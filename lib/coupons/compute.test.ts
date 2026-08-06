import { describe, it, expect } from "vitest"
import { computeDiscount, computeEndsOn, couponMatchesTarget, normalizeCode } from "@/lib/coupons/compute"
import type { Coupon } from "@/lib/coupons/types"

function coupon(partial: Partial<Coupon>): Coupon {
  return {
    id: "c1", code: "X", kind: "fixo", value: 0,
    scopeKind: "global", scopeProduto: null, scopeTier: null,
    redeemBy: null, maxRedemptions: null, redemptionCount: 0,
    durationMonths: null, active: true, ...partial,
  }
}

describe("normalizeCode", () => {
  it("apara e sobe para maiúsculas", () => {
    expect(normalizeCode("  nortec2026 ")).toBe("NORTEC2026")
  })
})

describe("computeDiscount", () => {
  it("fixo abate o valor em reais", () => {
    expect(computeDiscount(1200, "fixo", 200)).toEqual({ discount: 200, net: 1000 })
  })
  it("percentual abate a fração", () => {
    expect(computeDiscount(700, "percentual", 10)).toEqual({ discount: 70, net: 630 })
  })
  it("fixo maior que a base zera o líquido (nunca negativo)", () => {
    expect(computeDiscount(400, "fixo", 500)).toEqual({ discount: 400, net: 0 })
  })
  it("percentual arredonda para centavos", () => {
    expect(computeDiscount(99.99, "percentual", 10)).toEqual({ discount: 10, net: 89.99 })
  })
})

describe("couponMatchesTarget", () => {
  it("global casa com qualquer alvo", () => {
    expect(couponMatchesTarget(coupon({ scopeKind: "global" }), { produto: "combo", tier: "pro" })).toBe(true)
    expect(couponMatchesTarget(coupon({ scopeKind: "global" }), { produto: "margot", tier: "start" })).toBe(true)
  })
  it("combo casa só com o combo do mesmo tier", () => {
    const c = coupon({ scopeKind: "combo", scopeTier: "pro" })
    expect(couponMatchesTarget(c, { produto: "combo", tier: "pro" })).toBe(true)
    expect(couponMatchesTarget(c, { produto: "combo", tier: "start" })).toBe(false)
    expect(couponMatchesTarget(c, { produto: "margot", tier: "pro" })).toBe(false)
  })
  it("produto casa só com o produto+tier exatos", () => {
    const c = coupon({ scopeKind: "produto", scopeProduto: "margot", scopeTier: "pro" })
    expect(couponMatchesTarget(c, { produto: "margot", tier: "pro" })).toBe(true)
    expect(couponMatchesTarget(c, { produto: "motor", tier: "pro" })).toBe(false)
    expect(couponMatchesTarget(c, { produto: "margot", tier: "start" })).toBe(false)
    expect(couponMatchesTarget(c, { produto: "combo", tier: "pro" })).toBe(false)
  })
})

describe("computeEndsOn", () => {
  it("soma a duração em meses", () => {
    expect(computeEndsOn(new Date("2026-08-05T00:00:00Z"), 12)).toBe("2027-08-05")
  })
  it("duração nula = sem fim", () => {
    expect(computeEndsOn(new Date("2026-08-05T00:00:00Z"), null)).toBeNull()
  })
})
