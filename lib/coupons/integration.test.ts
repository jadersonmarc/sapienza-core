import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { PaymentProvider, Charge, CardSubscription } from "@/lib/payments/asaas"

// Integração cupom + modelo contra Postgres real (TEST_DATABASE_URL). Cobre:
// cálculo %/fixo, rejeição de fixo no mensal, escopo, modelo, esgotamento, valor
// ao Asaas por modelo, implantação só no mensal, e a reconciliação (Degrau 13 +
// fim do desconto). Reaproveita o harness do checkout.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

// Provedor que CAPTURA o enviado ao Asaas (recorrência, updates e avulsas).
class CapturingProvider implements PaymentProvider {
  created: { externalReference: string; value: number }[] = []
  charges: { externalReference: string; value: number }[] = []
  updates: { id: string; value: number }[] = []
  configured() {
    return true
  }
  async upsertCustomer() {
    return { id: "cus_cap" }
  }
  async createCharge(input: { externalReference: string; value: number }): Promise<Charge> {
    this.charges.push({ externalReference: input.externalReference, value: input.value })
    return { id: "pay_" + input.externalReference.slice(0, 6), invoiceUrl: "https://asaas/i", status: "PENDING" }
  }
  async createCardSubscription(input: { externalReference: string; value: number }): Promise<CardSubscription> {
    this.created.push({ externalReference: input.externalReference, value: input.value })
    return { id: "sub_" + input.externalReference.slice(0, 6), status: "ACTIVE" }
  }
  async updateSubscriptionValue(id: string, value: number) {
    this.updates.push({ id, value })
  }
  async cancelSubscription() {}
}

maybe("cupons + modelo — integração", () => {
  let raw: ReturnType<typeof postgres>
  let provider: CapturingProvider
  let mod: {
    checkoutSignup: typeof import("@/lib/signup/checkout")["checkoutSignup"]
    setPaymentProvider: typeof import("@/lib/payments/asaas")["setPaymentProvider"]
    validateCoupon: typeof import("@/lib/coupons/redeem")["validateCoupon"]
    redeemCoupon: typeof import("@/lib/coupons/redeem")["redeemCoupon"]
    runRecurrenceReconciliation: typeof import("@/lib/billing/reconcile-recurrence")["runRecurrenceReconciliation"]
    applyCouponToSubscription: typeof import("@/lib/coupons/admin")["applyCouponToSubscription"]
    revokeCoupon: typeof import("@/lib/coupons/admin")["revokeCoupon"]
    db: typeof import("@/lib/db")["db"]
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    // Planos por MODELO (para os JOINs — reconcile lê piso). Preço da conta vem do
    // pricing.yaml (precoDe/comboPreco); estes valores só espelham o yaml.
    await raw`INSERT INTO public.plans (produto, tier, model, metric, mensal, incluso, canais, excedente_unitario, piso) VALUES
      ('margot','pro','anual','resposta',700,1500,NULL,0.50,400),
      ('margot','pro','mensal','resposta',900,1500,NULL,0.50,400),
      ('motor','pro','anual','peca',700,30,2,25.0,400),
      ('motor','pro','mensal','peca',900,30,2,25.0,400)`
    mod = {
      ...(await import("@/lib/signup/checkout")),
      ...(await import("@/lib/payments/asaas")),
      ...(await import("@/lib/coupons/redeem")),
      ...(await import("@/lib/billing/reconcile-recurrence")),
      ...(await import("@/lib/coupons/admin")),
      ...(await import("@/lib/db")),
    } as typeof mod
    provider = new CapturingProvider()
    mod.setPaymentProvider(provider)
  })

  beforeEach(async () => {
    provider.created = []
    provider.charges = []
    provider.updates = []
    await raw`TRUNCATE public.coupon_redemptions, public.coupons, public.subscriptions RESTART IDENTITY CASCADE`
  })

  afterAll(async () => {
    mod?.setPaymentProvider(null)
    await raw?.end()
  })

  async function newTenant(name: string): Promise<string> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).slice(2, 7)
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug) VALUES (${name}, ${slug}) RETURNING id`
    return t.id
  }

  async function insertCoupon(c: {
    code: string; kind: string; value: number; scopeKind: string
    scopeProduto?: string | null; scopeTier?: string | null; billingModel?: string
    maxRedemptions?: number | null; redeemBy?: string | null; active?: boolean
  }): Promise<string> {
    const [row] = await raw<{ id: string }[]>`
      INSERT INTO public.coupons (code, kind, value, scope_kind, scope_produto, scope_tier, billing_model, redeem_by, max_redemptions, active)
      VALUES (${c.code}, ${c.kind}, ${c.value}, ${c.scopeKind}, ${c.scopeProduto ?? null}, ${c.scopeTier ?? null},
              ${c.billingModel ?? "ambos"}, ${c.redeemBy ?? null}, ${c.maxRedemptions ?? null}, ${c.active ?? true})
      RETURNING id`
    return row.id
  }

  it("resgate FIXO no combo pro ANUAL: 1200 → 1000, fim em 12 meses, contador 1", async () => {
    const tenantId = await newTenant("Redeem Fixo")
    await insertCoupon({ code: "NORTEC2026", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", billingModel: "anual", maxRedemptions: 1 })
    const target = { produto: "combo" as const, tier: "pro", model: "anual" as const }
    const coupon = await mod.validateCoupon("nortec2026", target)
    const r = await mod.db.transaction((tx) => mod.redeemCoupon(tx, { coupon, tenantId, target, providerSubId: "sub_x" }))
    expect(r.base).toBe(1200)
    expect(r.net).toBe(1000)
    expect(r.endsOn).not.toBeNull()
    const [c] = await raw<{ redemption_count: number }[]>`SELECT redemption_count FROM public.coupons WHERE code='NORTEC2026'`
    expect(c.redemption_count).toBe(1)
  })

  it("resgate PERCENTUAL margot/pro mensal: 900 → 810, sem fim (ends_on null)", async () => {
    const tenantId = await newTenant("Redeem Pct")
    await insertCoupon({ code: "PCT10", kind: "percentual", value: 10, scopeKind: "produto", scopeProduto: "margot", scopeTier: "pro" })
    const target = { produto: "margot" as const, tier: "pro", model: "mensal" as const }
    const coupon = await mod.validateCoupon("PCT10", target)
    const r = await mod.db.transaction((tx) => mod.redeemCoupon(tx, { coupon, tenantId, target, providerSubId: "sub_p" }))
    expect(r.base).toBe(900) // mensal
    expect(r.net).toBe(810)
    expect(r.endsOn).toBeNull() // termo indefinido
  })

  it("rejeita FIXO no mensal (fixed_requires_annual)", async () => {
    // billingModel 'ambos' passa o check de modelo; a TRAVA fixo-só-anual é que barra.
    await insertCoupon({ code: "FIX", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", billingModel: "ambos" })
    await expect(mod.validateCoupon("FIX", { produto: "combo", tier: "pro", model: "mensal" }))
      .rejects.toMatchObject({ reason: "fixed_requires_annual" })
  })

  it("rejeita por MODELO não permitido (model_not_allowed)", async () => {
    await insertCoupon({ code: "SOANUAL", kind: "percentual", value: 10, scopeKind: "combo", scopeTier: "pro", billingModel: "anual" })
    await expect(mod.validateCoupon("SOANUAL", { produto: "combo", tier: "pro", model: "mensal" }))
      .rejects.toMatchObject({ reason: "model_not_allowed" })
  })

  it("rejeita fora do escopo (out_of_scope)", async () => {
    await insertCoupon({ code: "COMBOPRO", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", billingModel: "anual" })
    await expect(mod.validateCoupon("COMBOPRO", { produto: "margot", tier: "pro", model: "anual" }))
      .rejects.toMatchObject({ reason: "out_of_scope" })
  })

  it("esgota no máximo de resgates; revogar libera a vaga", async () => {
    const couponId = await insertCoupon({ code: "UMSO", kind: "fixo", value: 100, scopeKind: "combo", scopeTier: "pro", billingModel: "anual", maxRedemptions: 1 })
    const t1 = await newTenant("Esgota 1")
    const target = { produto: "combo" as const, tier: "pro", model: "anual" as const }
    const coupon = await mod.validateCoupon("UMSO", target)
    await mod.db.transaction((tx) => mod.redeemCoupon(tx, { coupon, tenantId: t1, target, providerSubId: "sub_um" }))
    await expect(mod.validateCoupon("UMSO", target)).rejects.toMatchObject({ reason: "exhausted" })
    const [red] = await raw<{ id: string }[]>`SELECT id FROM public.coupon_redemptions WHERE coupon_id=${couponId}::uuid`
    await mod.revokeCoupon({ redemptionId: red.id })
    await expect(mod.validateCoupon("UMSO", target)).resolves.toBeTruthy()
  })

  const card = { number: "5162306219378829", holderName: "CLIENTE", expiryMonth: "05", expiryYear: "2030", ccv: "318" }
  const addr = { postalCode: "89223-005", addressNumber: "277", phone: "(47) 3003-3030", remoteIp: "1.2.3.4" }

  it("checkout ANUAL com cupom envia o LÍQUIDO ao Asaas; sem implantação", async () => {
    await insertCoupon({ code: "NORTEC2026", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", billingModel: "anual", maxRedemptions: 1 })
    const { tenantId } = await mod.checkoutSignup({
      name: "Anual", taxId: "12345678000199", email: `an-${Date.now()}@x.com`, password: "SenhaForte123",
      produto: "combo", tier: "pro", model: "anual", coupon: "nortec2026", card, ...addr,
    })
    expect(provider.created.at(-1)?.value).toBe(1000) // combo anual 1200 - 200
    expect(provider.charges).toHaveLength(0) // anual: implantação isenta
    const [sub] = await raw<{ billing_model: string; recurrence_value: string }[]>`
      SELECT billing_model, recurrence_value FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid LIMIT 1`
    expect(sub.billing_model).toBe("anual")
    expect(Number(sub.recurrence_value)).toBe(1000)
  })

  it("checkout MENSAL cobra implantação avulsa (1 mensalidade) separada da recorrência", async () => {
    await mod.checkoutSignup({
      name: "Mensal", taxId: "12345678000199", email: `me-${Date.now()}@x.com`, password: "SenhaForte123",
      produto: "combo", tier: "pro", model: "mensal", card, ...addr,
    })
    expect(provider.created.at(-1)?.value).toBe(1500) // combo mensal
    expect(provider.charges.at(-1)?.value).toBe(1500) // implantação = 1 mensalidade
  })

  it("reconciliação: combo anual no mês>=13 descarta o cupom (1000→1200), idempotente", async () => {
    const couponId = await insertCoupon({ code: "EXP", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", billingModel: "anual" })
    const tenantId = await newTenant("Reconcilia")
    // Assinatura combo anual ativada há 13 meses, recorrência já no líquido (1000).
    await raw`
      INSERT INTO public.subscriptions (tenant_id, produto, tier, status, billing_model, provider_sub_id, recurrence_value, activated_at)
      VALUES (${tenantId}::uuid,'margot','pro','active','anual','sub_exp',1000, now() - interval '13 months'),
             (${tenantId}::uuid,'motor','pro','active','anual','sub_exp',1000, now() - interval '13 months')`
    await raw`
      INSERT INTO public.coupon_redemptions
        (coupon_id, tenant_id, provider_sub_id, produto, tier, billing_model, base_value, discount_amount, net_value, starts_on, ends_on, status)
      VALUES (${couponId}::uuid, ${tenantId}::uuid, 'sub_exp', 'combo', 'pro', 'anual', 1200, 200, 1000,
              (now() - interval '13 months')::date, (now() - interval '1 month')::date, 'active')`

    const first = await mod.runRecurrenceReconciliation()
    expect(first.expired).toBe(1)
    expect(provider.updates).toContainEqual({ id: "sub_exp", value: 1200 }) // volta ao preço de tabela
    const [r1] = await raw<{ status: string }[]>`SELECT status FROM public.coupon_redemptions WHERE provider_sub_id='sub_exp'`
    expect(r1.status).toBe("expired")

    provider.updates = []
    const second = await mod.runRecurrenceReconciliation()
    expect(second.updated).toBe(0)
    expect(provider.updates).toEqual([]) // idempotente
  })

  it("admin aplica e revoga sobre assinatura existente (combo anual)", async () => {
    const tenantId = await newTenant("Admin Combo")
    await raw`
      INSERT INTO public.subscriptions (tenant_id, produto, tier, status, billing_model, provider_sub_id, recurrence_value)
      VALUES (${tenantId}::uuid,'margot','pro','active','anual','sub_adm',1200),
             (${tenantId}::uuid,'motor','pro','active','anual','sub_adm',1200)`
    await insertCoupon({ code: "GRANT", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", billingModel: "anual" })

    const applied = await mod.applyCouponToSubscription({ tenantId, code: "grant" })
    expect(applied.net).toBe(1000)
    expect(provider.updates).toContainEqual({ id: "sub_adm", value: 1000 })

    await mod.revokeCoupon({ redemptionId: applied.redemptionId })
    expect(provider.updates).toContainEqual({ id: "sub_adm", value: 1200 })
    const [r] = await raw<{ status: string }[]>`SELECT status FROM public.coupon_redemptions WHERE tenant_id=${tenantId}::uuid`
    expect(r.status).toBe("revoked")
  })
})
