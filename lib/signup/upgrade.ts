import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { getBillingIdentity } from "@/lib/tenant/billing"
import { activateSubscription } from "@/lib/provisioning/activate"
import { paymentProvider } from "@/lib/payments/asaas"
import { currentPeriod } from "@/lib/billing/period"
import { tierRank } from "@/lib/billing/seats"
import { precoDe, type BillingModel, type ProdutoId } from "@/lib/pricing/load"

// Upgrade self-service (modelo "refaz o pagamento no ato"): o cliente sobe de
// tier redigitando o cartão. Cria uma NOVA assinatura recorrente no valor do novo
// tier (1ª cobrança capturada agora) e cancela a antiga. O novo `incluso` passa a
// valer imediatamente no período corrente; a nova mensalidade é cobrada já nesta
// nova recorrência (sem crédito/pro-rata do que já foi pago no mês).
//
// Escopo v1: só UPGRADE (tier acima) e só assinatura de PRODUTO ÚNICO — se a
// recorrência for compartilhada (combo margot+motor), a troca é conjunta e passa
// pela Sapienza.

export class UpgradeError extends Error {}

const TIERS = new Set(["start", "pro", "scale"])
const PRODUTOS = new Set(["margot", "motor"])

function dueInDays(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10)
}

export type UpgradeInput = {
  tenantId: string
  produto: ProdutoId
  toTier: string
  remoteIp: string
  card: { number: string; holderName: string; expiryMonth: string; expiryYear: string; ccv: string }
  postalCode: string
  addressNumber: string
  phone: string
}

export async function upgradeSubscription(input: UpgradeInput): Promise<{ invoiceId: string }> {
  if (!PRODUTOS.has(input.produto)) throw new UpgradeError("produto inválido")
  if (!TIERS.has(input.toTier)) throw new UpgradeError("plano inválido")

  // Assinatura atual do produto no tenant.
  const [current] = (await db.execute(sql`
    SELECT tier, status, hard_cap, billing_model, provider_sub_id
      FROM public.subscriptions
     WHERE tenant_id = ${input.tenantId}::uuid AND produto = ${input.produto}
  `)) as unknown as { tier: string; status: string; hard_cap: boolean; billing_model: string; provider_sub_id: string | null }[]
  if (!current) throw new UpgradeError("assinatura não encontrada")
  if (current.status !== "active") throw new UpgradeError("assinatura não está ativa")
  if (tierRank(input.toTier) <= tierRank(current.tier)) {
    throw new UpgradeError("o novo plano precisa ser superior ao atual — para reduzir, fale com a Sapienza")
  }

  // Recorrência compartilhada (combo): não dá para trocar só um produto aqui.
  if (current.provider_sub_id) {
    const [{ n }] = (await db.execute(sql`
      SELECT count(*)::int AS n FROM public.subscriptions
       WHERE tenant_id = ${input.tenantId}::uuid AND provider_sub_id = ${current.provider_sub_id}
    `)) as unknown as { n: number }[]
    if (n > 1) throw new UpgradeError("assinatura em combo — o upgrade é conjunto; fale com a Sapienza")
  }

  const provider = paymentProvider()
  if (!provider.configured()) throw new UpgradeError("pagamento indisponível no momento")

  const identity = await getBillingIdentity(input.tenantId)
  if (!identity.asaasCustomerId) throw new UpgradeError("cadastro de cobrança incompleto — preencha os dados de cobrança primeiro")

  // Cartão + endereço do titular (Asaas exige).
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
  if (card.number.length < 13) throw new UpgradeError("número do cartão inválido")
  if (!card.holderName) throw new UpgradeError("informe o nome impresso no cartão")
  if (card.expiryMonth.length !== 2 || card.expiryYear.length !== 4)
    throw new UpgradeError("validade do cartão inválida (MM e AAAA)")
  if (card.ccv.length < 3) throw new UpgradeError("CVV inválido")
  if (postalCode.length !== 8) throw new UpgradeError("CEP inválido (8 dígitos)")
  if (!addressNumber) throw new UpgradeError("informe o número do endereço")
  if (phone.length < 10) throw new UpgradeError("telefone inválido (com DDD)")

  // Mensalidade do novo tier, no MESMO modelo da assinatura atual (pricing.yaml).
  const value = precoDe(input.produto, input.toTier, current.billing_model as BillingModel)

  // Fatura do upgrade no período corrente (linha do novo tier).
  const period = currentPeriod()
  const lines = [
    { produto: input.produto, tier: input.toTier, mensal: value, incluso: 0, count: 0, excedente: 0, subtotal: value },
  ]
  const [invoice] = (await db.execute(sql`
    INSERT INTO public.invoices (tenant_id, period, status, lines, total_brl)
    VALUES (${input.tenantId}::uuid, ${period}, 'issued', ${JSON.stringify(lines)}::jsonb, ${value})
    ON CONFLICT (tenant_id, period)
    DO UPDATE SET lines = EXCLUDED.lines, total_brl = EXCLUDED.total_brl, status = 'issued', issued_at = now()
    RETURNING id
  `)) as unknown as { id: string }[]

  // Nova recorrência no cartão (captura a 1ª cobrança agora). Cartão recusado
  // estoura aqui ANTES de mexer no tier — nada muda se o pagamento falhar.
  const sub = await provider.createCardSubscription({
    customerId: identity.asaasCustomerId,
    value,
    description: `Sapienza — ${input.produto} ${input.toTier} (upgrade)`,
    externalReference: invoice.id,
    nextDueDate: dueInDays(0),
    remoteIp: input.remoteIp,
    card,
    holder: {
      name: identity.legalName,
      email: identity.billingEmail,
      taxId: identity.taxId,
      postalCode,
      addressNumber,
      phone,
    },
  })

  // Pagamento capturado: efetiva o novo tier (upsert preserva activated_at → o
  // relógio do Degrau 13 não reinicia) e passa a apontar para a nova recorrência.
  await activateSubscription({
    tenantId: input.tenantId,
    produto: input.produto,
    tier: input.toTier,
    hardCap: current.hard_cap,
    billingModel: current.billing_model as BillingModel,
  })
  await db.execute(sql`
    UPDATE public.subscriptions SET provider_sub_id = ${sub.id}, recurrence_value = ${value}, updated_at = now()
     WHERE tenant_id = ${input.tenantId}::uuid AND produto = ${input.produto}
  `)
  await db.execute(sql`
    UPDATE public.invoices SET provider_charge_id = ${sub.id}, due_date = ${dueInDays(3)}::date
     WHERE id = ${invoice.id}::uuid
  `)

  // Cancela a recorrência antiga por último (best-effort): já cobramos e ativamos
  // o novo plano; um erro aqui só deixa uma recorrência a limpar, sem bloquear.
  if (current.provider_sub_id && current.provider_sub_id !== sub.id) {
    await provider.cancelSubscription(current.provider_sub_id).catch((err) =>
      console.error("[upgrade] falha ao cancelar recorrência antiga:", err),
    )
  }

  return { invoiceId: invoice.id }
}
