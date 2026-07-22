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

export async function checkoutSignup(input: CheckoutInput): Promise<{ paymentUrl: string; tenantId: string }> {
  const email = input.email.trim().toLowerCase()
  if (!PRODUTOS.has(input.produto)) throw new CheckoutError("produto inválido")
  if (!TIERS.has(input.tier)) throw new CheckoutError("plano inválido")
  const pwErr = validatePasswordStrength(input.password)
  if (pwErr) throw new CheckoutError(pwErr)

  const provider = paymentProvider()
  if (!provider.configured()) throw new CheckoutError("pagamento indisponível no momento")

  // Guarda: e-mail já dono de um tenant com assinatura ativa → não reprovisiona/re-cobra.
  const existing = (await db.execute(sql`
    SELECT 1 FROM public.subscriptions s
      JOIN public.memberships m ON m.tenant_id = s.tenant_id AND m.role = 'owner'
      JOIN public.users u ON u.id = m.user_id
     WHERE u.email = ${email} AND s.status = 'active' LIMIT 1
  `)) as unknown as unknown[]
  if (existing.length > 0) {
    throw new CheckoutError("já existe uma conta ativa com este e-mail")
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

  // 6) cobrança no Asaas (externalReference = id da fatura, p/ o webhook reconciliar)
  const asaasCustomerId = (
    (await db.execute(sql`SELECT asaas_customer_id FROM public.tenants WHERE id = ${tenantId}::uuid`)) as unknown as {
      asaas_customer_id: string | null
    }[]
  )[0]?.asaas_customer_id
  if (!asaasCustomerId) throw new CheckoutError("falha ao criar o cadastro de cobrança")

  const charge = await provider.createCharge({
    customerId: asaasCustomerId,
    value,
    dueDate: dueInDays(3),
    description: `Sapienza — ${input.produto} ${input.tier} — ${period}`,
    externalReference: invoice.id,
  })
  await db.execute(sql`
    UPDATE public.invoices SET provider_charge_id = ${charge.id}, payment_url = ${charge.invoiceUrl},
           due_date = ${dueInDays(3)}::date
     WHERE id = ${invoice.id}::uuid
  `)

  return { paymentUrl: charge.invoiceUrl, tenantId }
}
