import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { PaymentProvider, Charge, CardSubscription } from "@/lib/payments/asaas"

// Integração dos cupons contra Postgres real (TEST_DATABASE_URL). Cobre: cálculo
// no resgate, rejeição por escopo, esgotamento, valor enviado ao Asaas na criação
// (checkout) e na expiração, e aplicar/revogar pelo admin. Reaproveita o harness
// do checkout (recria o schema public + planos).

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

// Provedor que CAPTURA o que foi enviado ao Asaas (valor da recorrência e updates).
class CapturingProvider implements PaymentProvider {
  created: { externalReference: string; value: number }[] = []
  updates: { id: string; value: number }[] = []
  configured() {
    return true
  }
  async upsertCustomer() {
    return { id: "cus_cap" }
  }
  async createCharge(input: { externalReference: string }): Promise<Charge> {
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

maybe("cupons — integração", () => {
  let raw: ReturnType<typeof postgres>
  let provider: CapturingProvider
  let mod: {
    checkoutSignup: typeof import("@/lib/signup/checkout")["checkoutSignup"]
    setPaymentProvider: typeof import("@/lib/payments/asaas")["setPaymentProvider"]
    validateCoupon: typeof import("@/lib/coupons/redeem")["validateCoupon"]
    redeemCoupon: typeof import("@/lib/coupons/redeem")["redeemCoupon"]
    loadCouponByCode: typeof import("@/lib/coupons/redeem")["loadCouponByCode"]
    runCouponExpiry: typeof import("@/lib/coupons/expire")["runCouponExpiry"]
    applyCouponToSubscription: typeof import("@/lib/coupons/admin")["applyCouponToSubscription"]
    revokeCoupon: typeof import("@/lib/coupons/admin")["revokeCoupon"]
    CouponError: typeof import("@/lib/coupons/types")["CouponError"]
    db: typeof import("@/lib/db")["db"]
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    await raw`INSERT INTO public.plans (produto, tier, metric, mensal, incluso, canais, excedente_unitario, piso)
              VALUES ('margot','pro','resposta',700,1500,NULL,0.50,400),
                     ('margot','start','resposta',400,500,NULL,0.50,400),
                     ('motor','pro','peca',700,30,2,25.0,400),
                     ('motor','start','peca',400,12,1,25.0,400)`
    mod = {
      ...(await import("@/lib/signup/checkout")),
      ...(await import("@/lib/payments/asaas")),
      ...(await import("@/lib/coupons/redeem")),
      ...(await import("@/lib/coupons/expire")),
      ...(await import("@/lib/coupons/admin")),
      ...(await import("@/lib/coupons/types")),
      ...(await import("@/lib/db")),
    } as typeof mod
    provider = new CapturingProvider()
    mod.setPaymentProvider(provider)
  })

  beforeEach(async () => {
    provider.created = []
    provider.updates = []
    // Zera cupons/resgates entre os casos (mantém plans).
    await raw`TRUNCATE public.coupon_redemptions, public.coupons RESTART IDENTITY CASCADE`
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
    scopeProduto?: string | null; scopeTier?: string | null
    maxRedemptions?: number | null; durationMonths?: number | null; redeemBy?: string | null; active?: boolean
  }): Promise<string> {
    const [row] = await raw<{ id: string }[]>`
      INSERT INTO public.coupons (code, kind, value, scope_kind, scope_produto, scope_tier, redeem_by, max_redemptions, duration_months, active)
      VALUES (${c.code}, ${c.kind}, ${c.value}, ${c.scopeKind}, ${c.scopeProduto ?? null}, ${c.scopeTier ?? null},
              ${c.redeemBy ?? null}, ${c.maxRedemptions ?? null}, ${c.durationMonths ?? null}, ${c.active ?? true})
      RETURNING id`
    return row.id
  }

  it("resgate FIXO no combo pro: 1200 → 1000, fim em 12 meses, contador em 1", async () => {
    const tenantId = await newTenant("Redeem Fixo")
    await insertCoupon({ code: "NORTEC2026", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", maxRedemptions: 1, durationMonths: 12 })

    const coupon = await mod.validateCoupon("nortec2026", { produto: "combo", tier: "pro" })
    const r = await mod.db.transaction((tx) =>
      mod.redeemCoupon(tx, { coupon, tenantId, target: { produto: "combo", tier: "pro" }, providerSubId: "sub_x" }),
    )
    expect(r.base).toBe(1200)
    expect(r.discount).toBe(200)
    expect(r.net).toBe(1000)
    expect(r.endsOn).not.toBeNull()

    const [row] = await raw<{ net_value: string; ends_on: string }[]>`
      SELECT net_value, ends_on FROM public.coupon_redemptions WHERE tenant_id=${tenantId}::uuid`
    expect(Number(row.net_value)).toBe(1000)
    const [c] = await raw<{ redemption_count: number }[]>`SELECT redemption_count FROM public.coupons WHERE code='NORTEC2026'`
    expect(c.redemption_count).toBe(1)
  })

  it("resgate PERCENTUAL no produto margot/pro: 700 → 630", async () => {
    const tenantId = await newTenant("Redeem Pct")
    await insertCoupon({ code: "PCT10", kind: "percentual", value: 10, scopeKind: "produto", scopeProduto: "margot", scopeTier: "pro" })
    const coupon = await mod.validateCoupon("PCT10", { produto: "margot", tier: "pro" })
    const r = await mod.db.transaction((tx) =>
      mod.redeemCoupon(tx, { coupon, tenantId, target: { produto: "margot", tier: "pro" }, providerSubId: "sub_p" }),
    )
    expect(r.net).toBe(630)
  })

  it("rejeita fora do escopo (motivo out_of_scope)", async () => {
    await insertCoupon({ code: "COMBOPRO", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro" })
    await expect(mod.validateCoupon("COMBOPRO", { produto: "margot", tier: "pro" })).rejects.toMatchObject({ reason: "out_of_scope" })
    await expect(mod.validateCoupon("COMBOPRO", { produto: "combo", tier: "start" })).rejects.toMatchObject({ reason: "out_of_scope" })
  })

  it("esgota no máximo de resgates; revogar libera a vaga", async () => {
    const couponId = await insertCoupon({ code: "UMSO", kind: "fixo", value: 100, scopeKind: "combo", scopeTier: "pro", maxRedemptions: 1 })
    const t1 = await newTenant("Esgota 1")
    const coupon = await mod.validateCoupon("UMSO", { produto: "combo", tier: "pro" })
    await mod.db.transaction((tx) =>
      mod.redeemCoupon(tx, { coupon, tenantId: t1, target: { produto: "combo", tier: "pro" }, providerSubId: "sub_um" }),
    )
    // 2ª validação → esgotado
    await expect(mod.validateCoupon("UMSO", { produto: "combo", tier: "pro" })).rejects.toMatchObject({ reason: "exhausted" })
    // revoga o resgate → vaga volta
    const [red] = await raw<{ id: string }[]>`SELECT id FROM public.coupon_redemptions WHERE coupon_id=${couponId}::uuid`
    await mod.revokeCoupon({ redemptionId: red.id })
    await expect(mod.validateCoupon("UMSO", { produto: "combo", tier: "pro" })).resolves.toBeTruthy()
  })

  it("checkout com cupom envia o LÍQUIDO ao Asaas e grava o resgate", async () => {
    await insertCoupon({ code: "NORTEC2026", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", maxRedemptions: 1, durationMonths: 12 })
    const { tenantId } = await mod.checkoutSignup({
      name: "Cliente Cupom", taxId: "12345678000199", email: `cup-${Date.now()}@x.com`,
      password: "SenhaForte123", produto: "combo", tier: "pro", coupon: "nortec2026", remoteIp: "1.2.3.4",
      card: { number: "5162306219378829", holderName: "CLIENTE", expiryMonth: "05", expiryYear: "2030", ccv: "318" },
      postalCode: "89223-005", addressNumber: "277", phone: "(47) 3003-3030",
    })
    // Asaas recebeu 1000 (combo 1200 - 200), não 1200.
    expect(provider.created.at(-1)?.value).toBe(1000)
    // Fatura ao líquido + linha de desconto.
    const [inv] = await raw<{ total_brl: string; lines: { produto: string }[] }[]>`
      SELECT total_brl, lines FROM public.invoices WHERE tenant_id=${tenantId}::uuid`
    expect(Number(inv.total_brl)).toBe(1000)
    expect(inv.lines.some((l) => l.produto === "desconto_cupom")).toBe(true)
    // Resgate com o provider_sub_id da recorrência.
    const [red] = await raw<{ provider_sub_id: string; net_value: string }[]>`
      SELECT provider_sub_id, net_value FROM public.coupon_redemptions WHERE tenant_id=${tenantId}::uuid`
    expect(red.provider_sub_id).toMatch(/^sub_/)
    expect(Number(red.net_value)).toBe(1000)
  })

  it("expiração devolve o preço de tabela ao Asaas e é idempotente", async () => {
    const couponId = await insertCoupon({ code: "EXP", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", durationMonths: 12 })
    const tenantId = await newTenant("Expira")
    // Resgate já vencido (ends_on ontem), status active.
    await raw`
      INSERT INTO public.coupon_redemptions
        (coupon_id, tenant_id, provider_sub_id, produto, tier, base_value, discount_amount, net_value, starts_on, ends_on, status)
      VALUES (${couponId}::uuid, ${tenantId}::uuid, 'sub_exp', 'combo', 'pro', 1200, 200, 1000,
              (now() - interval '1 year')::date, (now() - interval '1 day')::date, 'active')`

    const first = await mod.runCouponExpiry()
    expect(first.expired).toBe(1)
    expect(provider.updates).toContainEqual({ id: "sub_exp", value: 1200 }) // preço de tabela do combo pro
    const [r1] = await raw<{ status: string }[]>`SELECT status FROM public.coupon_redemptions WHERE provider_sub_id='sub_exp'`
    expect(r1.status).toBe("expired")

    // Rodar de novo: nada a expirar, nenhum novo update no Asaas.
    provider.updates = []
    const second = await mod.runCouponExpiry()
    expect(second.expired).toBe(0)
    expect(provider.updates).toEqual([])
  })

  it("admin aplica e revoga sobre assinatura existente (combo), mexendo só no Asaas", async () => {
    const tenantId = await newTenant("Admin Combo")
    // Combo = margot+motor pro compartilhando a recorrência.
    await raw`
      INSERT INTO public.subscriptions (tenant_id, produto, tier, status, provider_sub_id)
      VALUES (${tenantId}::uuid, 'margot', 'pro', 'active', 'sub_adm'),
             (${tenantId}::uuid, 'motor',  'pro', 'active', 'sub_adm')`
    await insertCoupon({ code: "GRANT", kind: "fixo", value: 200, scopeKind: "combo", scopeTier: "pro", durationMonths: 12 })

    const applied = await mod.applyCouponToSubscription({ tenantId, code: "grant" })
    expect(applied.net).toBe(1000)
    expect(provider.updates).toContainEqual({ id: "sub_adm", value: 1000 })

    await mod.revokeCoupon({ redemptionId: applied.redemptionId })
    expect(provider.updates).toContainEqual({ id: "sub_adm", value: 1200 }) // volta à tabela
    const [r] = await raw<{ status: string }[]>`SELECT status FROM public.coupon_redemptions WHERE tenant_id=${tenantId}::uuid`
    expect(r.status).toBe("revoked")
  })
})
