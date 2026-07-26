import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { createTenant } from "@/lib/tenant/create"
import { deleteTenant } from "@/lib/tenant/delete"
import { saveBillingIdentity } from "@/lib/tenant/billing"
import { activateSubscription } from "@/lib/provisioning/activate"
import { paymentProvider } from "@/lib/payments/asaas"
import { validatePasswordStrength } from "@/lib/auth/password"
import { comboFor, type ProdutoId } from "@/lib/pricing/load"

// Checkout self-service: o site coleta os dados e chama a API pública que roda
// isto. Cria a conta na hora em `past_due` (bloqueada) e emite a cobrança da 1ª
// mensalidade; o webhook de pagamento (reconcile) reativa para `active`.

// "combo" = assinar margot + motor no MESMO tier, numa recorrência única a preço
// reduzido (o desconto vive no `value` da recorrência do Asaas). Não é um produto do
// enum: internamente vira DUAS subscriptions (margot + motor) que compartilham o
// `provider_sub_id`, ativadas juntas quando a 1ª fatura é paga.
export type CheckoutProduto = ProdutoId | "combo"

export type CheckoutInput = {
  name: string
  taxId: string
  email: string
  password: string
  produto: CheckoutProduto
  tier: string
  remoteIp: string
  // Cartão (transparente) + dados do titular exigidos pelo Asaas.
  card: { number: string; holderName: string; expiryMonth: string; expiryYear: string; ccv: string }
  postalCode: string
  addressNumber: string
  phone: string
}

export class CheckoutError extends Error {}

const TIERS = new Set(["start", "pro", "scale"])
const PRODUTOS = new Set(["margot", "motor"])

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}
function dueInDays(days: number): string {
  const d = new Date(Date.now() + days * 86400_000)
  return d.toISOString().slice(0, 10)
}

export async function checkoutSignup(
  input: CheckoutInput,
): Promise<{ tenantId: string; invoiceId: string }> {
  const email = input.email.trim().toLowerCase()
  const isCombo = input.produto === "combo"
  if (!isCombo && !PRODUTOS.has(input.produto)) throw new CheckoutError("produto inválido")
  if (!TIERS.has(input.tier)) throw new CheckoutError("plano inválido")
  if (isCombo && !comboFor(input.tier)) throw new CheckoutError("combo indisponível para este plano")
  // Produtos ativados por este cadastro: combo = os dois; avulso = só um.
  const produtos: ProdutoId[] = isCombo ? ["margot", "motor"] : [input.produto as ProdutoId]
  const pwErr = validatePasswordStrength(input.password)
  if (pwErr) throw new CheckoutError(pwErr)
  const card = {
    number: input.card.number.replace(/\s/g, ""),
    holderName: input.card.holderName.trim(),
    expiryMonth: input.card.expiryMonth.trim(),
    expiryYear: input.card.expiryYear.trim(),
    ccv: input.card.ccv.trim(),
  }
  const postalCode = input.postalCode.replace(/\D/g, "")
  const addressNumber = input.addressNumber.trim()
  const phone = input.phone.replace(/\D/g, "")
  if (card.number.length < 13) throw new CheckoutError("número do cartão inválido")
  if (!card.holderName) throw new CheckoutError("informe o nome impresso no cartão")
  if (card.expiryMonth.length !== 2 || card.expiryYear.length !== 4)
    throw new CheckoutError("validade do cartão inválida (MM e AAAA)")
  if (card.ccv.length < 3) throw new CheckoutError("CVV inválido")
  if (postalCode.length !== 8) throw new CheckoutError("CEP inválido (8 dígitos)")
  if (!addressNumber) throw new CheckoutError("informe o número do endereço")
  if (phone.length < 10) throw new CheckoutError("telefone inválido (com DDD)")

  const provider = paymentProvider()
  if (!provider.configured()) throw new CheckoutError("pagamento indisponível no momento")

  // Guarda: e-mail já cadastrado → não recria (o createTenant falharia no unique).
  // Mensagem clara para o cliente (evita o erro cru numa 2ª tentativa).
  const existing = (await db.execute(sql`
    SELECT 1 FROM public.users WHERE email = ${email} LIMIT 1
  `)) as unknown as unknown[]
  if (existing.length > 0) {
    throw new CheckoutError("já existe uma conta com este e-mail — faça login ou use outro e-mail")
  }

  // 1) tenant + owner (senha escolhida pelo cliente → loga já). uniqueSlug: cada
  // cadastro é um tenant NOVO — nunca funde com outro por nome/slug igual.
  const { tenantId } = await createTenant({
    name: input.name,
    ownerEmail: email,
    ownerPassword: input.password,
    uniqueSlug: true,
  })

  // A partir daqui, qualquer falha (Asaas/cartão) desfaz a conta recém-criada —
  // senão sobra um tenant órfão que bloqueia uma 2ª tentativa (e-mail duplicado).
  try {
    const taxId = input.taxId.replace(/\D/g, "")

    // 2) identidade de cobrança → cria o cliente no Asaas (valida o CPF/CNPJ aqui).
    await saveBillingIdentity(tenantId, { legalName: input.name, taxId, billingEmail: email })

    // 3) assinatura(s) em past_due (bloqueada até pagar) + schema + eventos.
    // Combo ativa margot E motor no mesmo tier — o pagamento libera os dois.
    for (const produto of produtos) {
      await activateSubscription({ tenantId, produto, tier: input.tier, status: "past_due" })
    }

    // 4) mensalidade de cada produto (do plano materializado)
    const planRows = (await db.execute(sql`
      SELECT produto, mensal FROM public.plans
       WHERE produto IN ${produtos} AND tier = ${input.tier}
    `)) as unknown as { produto: string; mensal: string }[]
    if (planRows.length !== produtos.length) throw new CheckoutError("plano não encontrado")
    const mensalDe = new Map(planRows.map((r) => [r.produto, Number(r.mensal)]))

    // 5) valor cobrado + linhas da fatura de ativação (período atual).
    // Combo: linhas dos dois produtos + uma linha de desconto → total = preço do combo.
    const period = currentPeriod()
    let value: number
    let lines: {
      produto: string; tier: string; mensal: number
      incluso: number; count: number; excedente: number; subtotal: number
    }[]
    if (isCombo) {
      const combo = comboFor(input.tier)!
      value = combo.mensal
      lines = produtos.map((produto) => {
        const m = mensalDe.get(produto)!
        return { produto, tier: input.tier, mensal: m, incluso: 0, count: 0, excedente: 0, subtotal: m }
      })
      lines.push({
        produto: "desconto_combo", tier: input.tier, mensal: -combo.economia,
        incluso: 0, count: 0, excedente: 0, subtotal: -combo.economia,
      })
    } else {
      value = mensalDe.get(input.produto as ProdutoId)!
      lines = [
        { produto: input.produto, tier: input.tier, mensal: value, incluso: 0, count: 0, excedente: 0, subtotal: value },
      ]
    }
    const [invoice] = (await db.execute(sql`
      INSERT INTO public.invoices (tenant_id, period, status, lines, total_brl)
      VALUES (${tenantId}::uuid, ${period}, 'issued', ${JSON.stringify(lines)}::jsonb, ${value})
      ON CONFLICT (tenant_id, period)
      DO UPDATE SET lines = EXCLUDED.lines, total_brl = EXCLUDED.total_brl, status = 'issued', issued_at = now()
      RETURNING id
    `)) as unknown as { id: string }[]

    // 6) Assinatura RECORRENTE no cartão (transparente). O 1º pagamento é capturado
    // agora — cartão recusado estoura PaymentError aqui. externalReference = id da
    // fatura → o webhook do pagamento reconcilia e ativa.
    const [tenant] = (await db.execute(sql`
      SELECT asaas_customer_id FROM public.tenants WHERE id = ${tenantId}::uuid
    `)) as unknown as { asaas_customer_id: string | null }[]
    if (!tenant?.asaas_customer_id) throw new CheckoutError("não foi possível criar o cliente de cobrança")

    const sub = await provider.createCardSubscription({
      customerId: tenant.asaas_customer_id,
      value,
      description: isCombo ? `Sapienza — combo ${input.tier}` : `Sapienza — ${input.produto} ${input.tier}`,
      externalReference: invoice.id,
      nextDueDate: dueInDays(0),
      remoteIp: input.remoteIp,
      card,
      holder: { name: input.name, email, taxId, postalCode, addressNumber, phone },
    })

    // Guarda o id da assinatura no provedor (para cancelar a recorrência depois).
    // Combo: a MESMA recorrência cobre margot + motor → grava o id nas duas linhas.
    await db.execute(sql`
      UPDATE public.subscriptions SET provider_sub_id = ${sub.id}, updated_at = now()
       WHERE tenant_id = ${tenantId}::uuid AND produto IN ${produtos}
    `)
    await db.execute(sql`
      UPDATE public.invoices SET provider_charge_id = ${sub.id}, due_date = ${dueInDays(3)}::date
       WHERE id = ${invoice.id}::uuid
    `)

    return { tenantId, invoiceId: invoice.id }
  } catch (e) {
    // Rollback best-effort: apaga o tenant recém-criado para não deixar órfão.
    await deleteTenant(tenantId).catch((err) => console.error("[signup] rollback falhou:", err))
    throw e
  }
}
