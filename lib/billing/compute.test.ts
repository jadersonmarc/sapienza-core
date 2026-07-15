import { describe, it, expect } from "vitest"
import { overage, invoiceLine, monthIndex, blockedByCap } from "./compute"

describe("overage", () => {
  it("é zero até o incluso", () => {
    expect(overage(150, 200, 1.5)).toBe(0)
    expect(overage(200, 200, 1.5)).toBe(0)
  })
  it("cobra o excedente margot", () => {
    expect(overage(250, 200, 1.5)).toBe(75) // 50 * 1.50
  })
  it("cobra o excedente motor", () => {
    expect(overage(15, 12, 25)).toBe(75) // 3 * 25
  })
})

describe("invoiceLine (Degrau 13)", () => {
  const base = { tierMensal: 700, piso: 400, excedenteUnitario: 1.5, incluso: 600 }
  it("mês < 13 usa a mensalidade do tier", () => {
    expect(invoiceLine({ ...base, count: 500, monthIndex: 5 })).toBe(700)
  })
  it("mês < 13 soma excedente", () => {
    expect(invoiceLine({ ...base, count: 700, monthIndex: 5 })).toBe(850)
  })
  it("mês >= 13 cai ao piso", () => {
    expect(invoiceLine({ ...base, count: 500, monthIndex: 13 })).toBe(400)
  })
  it("mês >= 13 piso + excedente", () => {
    expect(invoiceLine({ ...base, count: 700, monthIndex: 20 })).toBe(550)
  })
})

describe("monthIndex", () => {
  it("é 1 no mês de ativação", () => {
    expect(monthIndex(new Date("2026-01-10T00:00:00Z"), new Date("2026-01-28T00:00:00Z"))).toBe(1)
  })
  it("conta meses (Degrau 13 no 13º)", () => {
    expect(monthIndex(new Date("2025-01-10T00:00:00Z"), new Date("2026-01-28T00:00:00Z"))).toBe(13)
  })
})

describe("blockedByCap", () => {
  it("soft nunca bloqueia", () => {
    expect(blockedByCap(999, 200, false)).toBe(false)
  })
  it("hard bloqueia ao atingir o incluso", () => {
    expect(blockedByCap(200, 200, true)).toBe(true)
    expect(blockedByCap(199, 200, true)).toBe(false)
  })
})
