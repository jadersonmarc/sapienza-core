import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { validateCouponInput, type CouponInput } from "@/lib/coupons/manage"

// Base de um input válido; cada teste sobrescreve o que precisa.
function input(partial: Partial<CouponInput> = {}): CouponInput {
  return {
    code: "SAPIENZA2026", kind: "fixo", value: 200,
    scopeKind: "combo", scopeProduto: null, scopeTier: "pro",
    billingModel: "anual", redeemBy: null, maxRedemptions: 1, ...partial,
  }
}

describe("validateCouponInput (puro)", () => {
  it("aceita combo/pro fixo, produto margot/pro %, e global", () => {
    expect(validateCouponInput(input())).toBeNull()
    expect(validateCouponInput(input({ kind: "percentual", value: 10, scopeKind: "produto", scopeProduto: "margot", scopeTier: "pro" }))).toBeNull()
    expect(validateCouponInput(input({ scopeKind: "global", scopeProduto: null, scopeTier: null }))).toBeNull()
  })
  it("recusa valor <= 0 e percentual > 100", () => {
    expect(validateCouponInput(input({ value: 0 }))).toMatch(/maior que zero/)
    expect(validateCouponInput(input({ kind: "percentual", value: 120 }))).toMatch(/100%/)
  })
  it("exige coerência de escopo", () => {
    expect(validateCouponInput(input({ scopeKind: "produto", scopeProduto: null, scopeTier: "pro" }))).toMatch(/produto/)
    expect(validateCouponInput(input({ scopeKind: "produto", scopeProduto: "margot", scopeTier: null }))).toMatch(/plano/)
    expect(validateCouponInput(input({ scopeKind: "combo", scopeProduto: "margot", scopeTier: "pro" }))).toMatch(/não leva produto/)
    expect(validateCouponInput(input({ scopeKind: "global", scopeTier: "pro" }))).toMatch(/global/)
  })
  it("recusa limite não-inteiro/≤0", () => {
    expect(validateCouponInput(input({ maxRedemptions: 0 }))).toMatch(/máximo/)
  })
  it("recusa cupom fixo exclusivo do mensal", () => {
    expect(validateCouponInput(input({ kind: "fixo", billingModel: "mensal" }))).toMatch(/fixo/)
  })
})

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("catálogo de cupons — integração", () => {
  let raw: ReturnType<typeof postgres>
  let mod: {
    createCoupon: typeof import("@/lib/coupons/manage")["createCoupon"]
    listCoupons: typeof import("@/lib/coupons/manage")["listCoupons"]
    setCouponActive: typeof import("@/lib/coupons/manage")["setCouponActive"]
    CouponManageError: typeof import("@/lib/coupons/manage")["CouponManageError"]
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    mod = { ...(await import("@/lib/coupons/manage")) } as typeof mod
  })
  beforeEach(async () => {
    await raw`TRUNCATE public.coupon_redemptions, public.coupons RESTART IDENTITY CASCADE`
  })
  afterAll(async () => {
    await raw?.end()
  })

  it("cria (normaliza o código), lista e alterna ativo/inativo", async () => {
    const { id } = await mod.createCoupon({
      code: "  sapienza2026 ", kind: "fixo", value: 200,
      scopeKind: "combo", scopeProduto: null, scopeTier: "pro",
      billingModel: "anual", redeemBy: null, maxRedemptions: 1,
    })
    const list = await mod.listCoupons()
    expect(list).toHaveLength(1)
    expect(list[0].code).toBe("SAPIENZA2026") // normalizado
    expect(list[0].active).toBe(true)

    await mod.setCouponActive(id, false)
    expect((await mod.listCoupons())[0].active).toBe(false)
    await mod.setCouponActive(id, true)
    expect((await mod.listCoupons())[0].active).toBe(true)
  })

  it("rejeita código duplicado (case-insensitive)", async () => {
    const base = { kind: "fixo" as const, value: 100, scopeKind: "combo" as const, scopeProduto: null, scopeTier: "pro", billingModel: "anual" as const, redeemBy: null, maxRedemptions: null }
    await mod.createCoupon({ code: "DUP", ...base })
    await expect(mod.createCoupon({ code: "dup", ...base })).rejects.toBeInstanceOf(mod.CouponManageError)
  })

  it("rejeita escopo incoerente antes de tocar no banco", async () => {
    await expect(
      mod.createCoupon({ code: "BAD", kind: "fixo", value: 50, scopeKind: "combo", scopeProduto: "margot", scopeTier: "pro", billingModel: "anual", redeemBy: null, maxRedemptions: null }),
    ).rejects.toBeInstanceOf(mod.CouponManageError)
    expect(await mod.listCoupons()).toHaveLength(0)
  })
})
