import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { PaymentProvider, Charge, CardSubscription } from "@/lib/payments/asaas"

// Upgrade self-service de ponta a ponta (com Asaas falso): sobe motor start→pro,
// cria nova recorrência no novo valor e cancela a antiga. Requer TEST_DATABASE_URL.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

let canceled: string[] = []
let recusarCartao = false

class FakeProvider implements PaymentProvider {
  configured() {
    return true
  }
  async upsertCustomer() {
    return { id: "cus_up" }
  }
  async createCharge(input: { externalReference: string }): Promise<Charge> {
    return { id: "pay_" + input.externalReference.slice(0, 6), invoiceUrl: "https://asaas/i/up", status: "PENDING" }
  }
  async createCardSubscription(input: { externalReference: string }): Promise<CardSubscription> {
    if (recusarCartao) {
      const { PaymentError } = await import("@/lib/payments/asaas")
      throw new PaymentError(402, "cartão recusado")
    }
    return { id: "sub_new_" + input.externalReference.slice(0, 4), status: "ACTIVE" }
  }
  async updateSubscriptionValue() {}
  async cancelSubscription(id: string) {
    canceled.push(id)
  }
}

maybe("upgradeSubscription", () => {
  let raw: ReturnType<typeof postgres>
  let upgradeSubscription: typeof import("@/lib/signup/upgrade")["upgradeSubscription"]
  let UpgradeError: typeof import("@/lib/signup/upgrade")["UpgradeError"]
  let setPaymentProvider: typeof import("@/lib/payments/asaas")["setPaymentProvider"]

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    await raw`INSERT INTO public.plans (produto, tier, metric, mensal, incluso, canais, excedente_unitario, piso)
              VALUES ('motor','start','peca',400,12,1,25.0,400),
                     ('motor','pro','peca',700,30,2,25.0,400)`
    ;({ upgradeSubscription, UpgradeError } = await import("@/lib/signup/upgrade"))
    ;({ setPaymentProvider } = await import("@/lib/payments/asaas"))
    setPaymentProvider(new FakeProvider())
  })
  afterAll(async () => {
    setPaymentProvider(null)
    await raw?.end()
  })

  let tenantId: string
  beforeEach(async () => {
    canceled = []
    recusarCartao = false
    await raw`DELETE FROM public.subscriptions`
    await raw`DELETE FROM public.invoices`
    await raw`DELETE FROM public.tenants`
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug, legal_name, tax_id, billing_email, asaas_customer_id)
      VALUES ('Margot Editora Cliente', ${"cli-" + Math.random().toString(36).slice(2, 8)},
              'Editora Cliente LTDA', '12345678000199', 'cobranca@cliente.com', 'cus_up')
      RETURNING id`
    tenantId = t.id
    await raw`
      INSERT INTO public.subscriptions (tenant_id, produto, tier, status, hard_cap, provider_sub_id, activated_at)
      VALUES (${tenantId}::uuid, 'motor', 'start', 'active', false, 'sub_old', now() - interval '2 months')`
  })

  const validCard = {
    card: { number: "5162306219378829", holderName: "CLIENTE UP", expiryMonth: "05", expiryYear: "2030", ccv: "318" },
    postalCode: "89223-005",
    addressNumber: "277",
    phone: "(47) 3003-3030",
    remoteIp: "116.213.44.5",
  }

  it("sobe motor start→pro: nova recorrência, cancela a antiga, fatura do upgrade", async () => {
    const { invoiceId } = await upgradeSubscription({ tenantId, produto: "motor", toTier: "pro", ...validCard })
    expect(invoiceId).toBeTruthy()

    const [sub] = await raw<{ tier: string; status: string; provider_sub_id: string; activated_at: string }[]>`
      SELECT tier, status, provider_sub_id, activated_at FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    expect(sub.tier).toBe("pro")
    expect(sub.status).toBe("active")
    expect(sub.provider_sub_id).toMatch(/^sub_new_/)
    // activated_at PRESERVADO (Degrau 13 não reinicia).
    expect(new Date(sub.activated_at).getTime()).toBeLessThan(Date.now() - 30 * 86400_000)

    // recorrência antiga cancelada
    expect(canceled).toEqual(["sub_old"])

    // fatura do upgrade com o valor do novo tier
    const [inv] = await raw<{ total_brl: string; provider_charge_id: string }[]>`
      SELECT total_brl, provider_charge_id FROM public.invoices WHERE id=${invoiceId}::uuid`
    expect(Number(inv.total_brl)).toBe(700)
    expect(inv.provider_charge_id).toMatch(/^sub_new_/)
  })

  it("cartão recusado ⇒ tier inalterado e recorrência antiga preservada", async () => {
    recusarCartao = true
    await expect(upgradeSubscription({ tenantId, produto: "motor", toTier: "pro", ...validCard })).rejects.toThrow()
    const [sub] = await raw<{ tier: string; provider_sub_id: string }[]>`
      SELECT tier, provider_sub_id FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    expect(sub.tier).toBe("start")
    expect(sub.provider_sub_id).toBe("sub_old")
    expect(canceled).toEqual([])
  })

  it("recusa downgrade/mesmo tier", async () => {
    await expect(
      upgradeSubscription({ tenantId, produto: "motor", toTier: "start", ...validCard }),
    ).rejects.toBeInstanceOf(UpgradeError)
  })
})
