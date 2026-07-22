import { describe, it, expect, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { PaymentProvider, Charge } from "@/lib/payments/asaas"

// Fechamento de fatura de ponta a ponta: cálculo + setup na 1ª fatura + emissão
// da cobrança no provedor (falso). Requer TEST_DATABASE_URL; pula se ausente.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

// Provedor falso: captura o que foi cobrado e devolve um link fixo.
class FakeProvider implements PaymentProvider {
  charges: { customerId: string; value: number; externalReference: string }[] = []
  configured() {
    return true
  }
  async upsertCustomer() {
    return { id: "cus_fake" }
  }
  async createCharge(input: { customerId: string; value: number; externalReference: string }): Promise<Charge> {
    this.charges.push({ customerId: input.customerId, value: input.value, externalReference: input.externalReference })
    return { id: "pay_" + this.charges.length, invoiceUrl: "https://asaas/i/pay", status: "PENDING" }
  }
}

maybe("closeTenantInvoice", () => {
  let raw: ReturnType<typeof postgres>
  let closeTenantInvoice: typeof import("@/lib/billing/close")["closeTenantInvoice"]
  let setPaymentProvider: typeof import("@/lib/payments/asaas")["setPaymentProvider"]
  const fake = new FakeProvider()

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of [
      "0000_control_plane.sql",
      "0001_product_rules_usage_agg.sql",
      "0002_billing_identity.sql",
      "0003_invoice_payment.sql",
    ]) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    // pricing.sync mínimo: um plano margot/pro (a close junta por produto+tier).
    await raw`INSERT INTO public.plans (produto, tier, metric, mensal, incluso, canais, excedente_unitario, piso)
              VALUES ('margot','pro','resposta',700,1500,NULL,0.50,400)`
    ;({ closeTenantInvoice } = await import("@/lib/billing/close"))
    ;({ setPaymentProvider } = await import("@/lib/payments/asaas"))
    setPaymentProvider(fake)
  })

  afterAll(async () => {
    setPaymentProvider(null)
    await raw?.end()
  })

  it("1ª fatura: soma mensalidade + excedente + setup e emite a cobrança", async () => {
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug, legal_name, tax_id, billing_email, asaas_customer_id)
      VALUES ('Cliente','cli-close','Cliente LTDA','12345678000199','fin@cli.com','cus_real') RETURNING id`
    const tenantId = t.id
    await raw`INSERT INTO public.subscriptions (tenant_id, produto, tier, status, activated_at)
              VALUES (${tenantId}::uuid,'margot','pro','active','2026-07-01')`
    // 1600 respostas: 100 de excedente × 0,50 = 50 sobre a mensalidade 700.
    await raw`INSERT INTO public.usage_counters (tenant_id, produto, period, metric, count)
              VALUES (${tenantId}::uuid,'margot','2026-07','resposta',1600)`

    const { total } = await closeTenantInvoice(tenantId, "2026-07")

    // 700 (mensal) + 50 (excedente) + 3000 (setup) = 3750.
    expect(total).toBe(3750)

    const [inv] = await raw<{ status: string; provider_charge_id: string; payment_url: string; due_date: string }[]>`
      SELECT status, provider_charge_id, payment_url, due_date FROM public.invoices
      WHERE tenant_id=${tenantId}::uuid AND period='2026-07'`
    expect(inv.provider_charge_id).toMatch(/^pay_/)
    expect(inv.payment_url).toBe("https://asaas/i/pay")
    expect(inv.due_date).toBeTruthy()

    // A cobrança foi pelo valor total, referenciando a fatura.
    const charge = fake.charges.at(-1)!
    expect(charge.value).toBe(3750)
    expect(charge.customerId).toBe("cus_real")
  })

  it("re-fechar o mesmo período não emite outra cobrança (idempotente)", async () => {
    const before = fake.charges.length
    const tenantId = (await raw<{ tenant_id: string }[]>`
      SELECT tenant_id FROM public.subscriptions LIMIT 1`)[0].tenant_id
    await closeTenantInvoice(tenantId, "2026-07")
    expect(fake.charges.length).toBe(before) // não cobrou de novo
  })

  it("sem cadastro de cobrança (asaas_customer_id nulo): grava a fatura, não cobra", async () => {
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug) VALUES ('Sem cobrança','sem-cob') RETURNING id`
    await raw`INSERT INTO public.subscriptions (tenant_id, produto, tier, status, activated_at)
              VALUES (${t.id}::uuid,'margot','pro','active','2026-07-01')`
    const before = fake.charges.length
    await closeTenantInvoice(t.id, "2026-07")
    expect(fake.charges.length).toBe(before) // não cobrou
    const [inv] = await raw<{ provider_charge_id: string | null }[]>`
      SELECT provider_charge_id FROM public.invoices WHERE tenant_id=${t.id}::uuid AND period='2026-07'`
    expect(inv.provider_charge_id).toBeNull()
  })
})
