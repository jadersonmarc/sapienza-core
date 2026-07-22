import { describe, it, expect, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import bcrypt from "bcryptjs"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { PaymentProvider, Charge } from "@/lib/payments/asaas"

// Checkout self-service de ponta a ponta (com Asaas falso): cria conta em
// past_due, emite cobrança; o webhook reativa. Requer TEST_DATABASE_URL.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

class FakeProvider implements PaymentProvider {
  configured() {
    return true
  }
  async upsertCustomer() {
    return { id: "cus_checkout" }
  }
  async createCharge(input: { externalReference: string }): Promise<Charge> {
    return { id: "pay_" + input.externalReference.slice(0, 6), invoiceUrl: "https://asaas/i/checkout", status: "PENDING" }
  }
}

maybe("checkoutSignup", () => {
  let raw: ReturnType<typeof postgres>
  let checkoutSignup: typeof import("@/lib/signup/checkout")["checkoutSignup"]
  let setPaymentProvider: typeof import("@/lib/payments/asaas")["setPaymentProvider"]
  let applyPaymentReceived: typeof import("@/lib/billing/reconcile")["applyPaymentReceived"]

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of ["0000_control_plane.sql", "0001_product_rules_usage_agg.sql", "0002_billing_identity.sql", "0003_invoice_payment.sql"]) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    await raw`INSERT INTO public.plans (produto, tier, metric, mensal, incluso, canais, excedente_unitario, piso)
              VALUES ('margot','pro','resposta',700,1500,NULL,0.50,400)`
    ;({ checkoutSignup } = await import("@/lib/signup/checkout"))
    ;({ setPaymentProvider } = await import("@/lib/payments/asaas"))
    ;({ applyPaymentReceived } = await import("@/lib/billing/reconcile"))
    setPaymentProvider(new FakeProvider())
  })
  afterAll(async () => {
    setPaymentProvider(null)
    await raw?.end()
  })

  it("cria conta em past_due + cobrança; o webhook de pagamento ativa", async () => {
    const { paymentUrl, tenantId } = await checkoutSignup({
      name: "Cliente Checkout",
      taxId: "12345678000199",
      email: "novo@cliente.com",
      password: "SenhaForte123",
      produto: "margot",
      tier: "pro",
    })
    expect(paymentUrl).toBe("https://asaas/i/checkout")

    // owner criado e loga com a senha escolhida
    const [u] = await raw<{ password_hash: string }[]>`SELECT password_hash FROM public.users WHERE email='novo@cliente.com'`
    expect(await bcrypt.compare("SenhaForte123", u.password_hash)).toBe(true)

    // assinatura bloqueada (past_due) até pagar
    const [sub0] = await raw<{ status: string }[]>`SELECT status FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    expect(sub0.status).toBe("past_due")

    // fatura de ativação com a cobrança (só a mensalidade)
    const [inv] = await raw<{ id: string; status: string; total_brl: string; provider_charge_id: string }[]>`
      SELECT id, status, total_brl, provider_charge_id FROM public.invoices WHERE tenant_id=${tenantId}::uuid`
    expect(inv.status).toBe("issued")
    expect(Number(inv.total_brl)).toBe(700)
    expect(inv.provider_charge_id).toMatch(/^pay_/)

    // webhook: pagou → fatura paga + assinatura ativa (conta liberada)
    await applyPaymentReceived(inv.provider_charge_id, inv.id)
    const [sub1] = await raw<{ status: string }[]>`SELECT status FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    const [inv1] = await raw<{ status: string }[]>`SELECT status FROM public.invoices WHERE id=${inv.id}::uuid`
    expect(sub1.status).toBe("active")
    expect(inv1.status).toBe("paid")
  })

  it("recusa senha fraca e produto inválido, e e-mail já com conta ativa", async () => {
    const { CheckoutError } = await import("@/lib/signup/checkout")
    await expect(
      checkoutSignup({ name: "X", taxId: "1", email: "a@b.com", password: "fraca", produto: "margot", tier: "pro" }),
    ).rejects.toThrow(CheckoutError)
    // 'novo@cliente.com' já tem assinatura ativa (foi pago no teste anterior)
    await expect(
      checkoutSignup({ name: "Y", taxId: "12345678000199", email: "novo@cliente.com", password: "SenhaForte123", produto: "margot", tier: "pro" }),
    ).rejects.toThrow(/já existe uma conta ativa/)
  })

  it("a rota pública exige x-checkout-secret (401 sem)", async () => {
    process.env.CHECKOUT_SECRET = "sitesecret"
    const { POST } = await import("@/app/api/public/checkout/route")
    const req = new Request("http://x/api/public/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-checkout-secret": "errado" },
      body: JSON.stringify({ email: "z@z.com" }),
    })
    expect((await POST(req)).status).toBe(401)
  })

  it("o fechamento mensal NÃO sobrescreve a fatura de ativação já paga", async () => {
    const { closeTenantInvoice } = await import("@/lib/billing/close")
    // Reusa o tenant do 1º teste (fatura 'paid' com total 700).
    const [tenant] = await raw<{ tenant_id: string; period: string }[]>`
      SELECT tenant_id, period FROM public.invoices WHERE status='paid' LIMIT 1`
    const before = (await raw<{ total_brl: string; status: string }[]>`
      SELECT total_brl, status FROM public.invoices WHERE tenant_id=${tenant.tenant_id}::uuid AND period=${tenant.period}`)[0]
    const { total } = await closeTenantInvoice(tenant.tenant_id, tenant.period)
    const after = (await raw<{ total_brl: string; status: string }[]>`
      SELECT total_brl, status FROM public.invoices WHERE tenant_id=${tenant.tenant_id}::uuid AND period=${tenant.period}`)[0]
    // total e status intactos (não recomputou nem virou 'issued')
    expect(total).toBe(Number(before.total_brl))
    expect(after.status).toBe("paid")
    expect(after.total_brl).toBe(before.total_brl)
  })
})
