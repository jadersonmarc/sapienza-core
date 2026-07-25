import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { createTenant } from "@/lib/tenant/create"
import { saveBillingIdentity } from "@/lib/tenant/billing"
import { activateSubscription } from "@/lib/provisioning/activate"
import { paymentProvider } from "@/lib/payments/asaas"
import { validatePasswordStrength } from "@/lib/auth/password"
import type { ProdutoId } from "@/lib/pricing/load"

// Checkout self-service: o site coleta os dados e chama a API pública que roda
// isto. Cria a conta na hora em `past_due` (bloqueada) e emite a cobrança da 1ª
// mensalidade; o webhook de pagamento (reconcile) reativa para `active`.

export type CheckoutInput = {
  name: string
  taxId: string
  email: string
  password: string
  produto: ProdutoId
  tier: string
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
): Promise<{ tenantId: string; invoiceId: string; checkoutUrl: string }> {
  const email = input.email.trim().toLowerCase()
  if (!PRODUTOS.has(input.produto)) throw new CheckoutError("produto inválido")
  if (!TIERS.has(input.tier)) throw new CheckoutError("plano inválido")
  const pwErr = validatePasswordStrength(input.password)
  if (pwErr) throw new CheckoutError(pwErr)

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

  // 1) tenant + owner (senha escolhida pelo cliente → loga já)
  const { tenantId } = await createTenant({ name: input.name, ownerEmail: email, ownerPassword: input.password })

  // 2) identidade de cobrança → cria o cliente no Asaas
  await saveBillingIdentity(tenantId, { legalName: input.name, taxId: input.taxId, billingEmail: email })

  // 3) assinatura em past_due (bloqueada até pagar) + schema + eventos
  await activateSubscription({ tenantId, produto: input.produto, tier: input.tier, status: "past_due" })

  // 4) valor da 1ª mensalidade (do plano materializado)
  const planRows = (await db.execute(sql`
    SELECT mensal FROM public.plans WHERE produto = ${input.produto} AND tier = ${input.tier}
  `)) as unknown as { mensal: string }[]
  if (planRows.length === 0) throw new CheckoutError("plano não encontrado")
  const value = Number(planRows[0].mensal)

  // 5) fatura de ativação (período atual, só a mensalidade)
  const period = currentPeriod()
  const lines = [
    { produto: input.produto, tier: input.tier, mensal: value, incluso: 0, count: 0, excedente: 0, subtotal: value },
  ]
  const [invoice] = (await db.execute(sql`
    INSERT INTO public.invoices (tenant_id, period, status, lines, total_brl)
    VALUES (${tenantId}::uuid, ${period}, 'issued', ${JSON.stringify(lines)}::jsonb, ${value})
    ON CONFLICT (tenant_id, period)
    DO UPDATE SET lines = EXCLUDED.lines, total_brl = EXCLUDED.total_brl, status = 'issued', issued_at = now()
    RETURNING id
  `)) as unknown as { id: string }[]

  // 6) Checkout hospedado com assinatura RECORRENTE no cartão. externalReference =
  // id da fatura → o webhook do 1º pagamento reconcilia e ativa. O cliente digita
  // o cartão na página do Asaas; a recorrência mensal é automática.
  const authUrl = (process.env.AUTH_URL || "").replace(/\/$/, "")
  const checkout = await provider.createCheckout({
    value,
    description: `Sapienza — ${input.produto} ${input.tier}`,
    externalReference: invoice.id,
    nextDueDate: dueInDays(0),
    customer: { name: input.name, taxId: input.taxId, email },
    successUrl: `${authUrl}/login?assinou=1`,
    cancelUrl: `${authUrl}/assinar?produto=${input.produto}&tier=${input.tier}`,
  })
  await db.execute(sql`
    UPDATE public.invoices SET provider_charge_id = ${checkout.id}, payment_url = ${checkout.url},
           due_date = ${dueInDays(3)}::date
     WHERE id = ${invoice.id}::uuid
  `)

  return { tenantId, invoiceId: invoice.id, checkoutUrl: checkout.url }
}
