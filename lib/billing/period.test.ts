import { describe, it, expect } from "vitest"
import { currentPeriod, renewal } from "./period"

describe("currentPeriod (BRT)", () => {
  it("usa o mês-calendário de São Paulo", () => {
    expect(currentPeriod(new Date("2026-07-15T12:00:00Z"))).toBe("2026-07")
  })
  it("ainda é julho às 23:00 BRT do dia 31 (02:00 UTC do dia 1º)", () => {
    // 2026-08-01T02:00:00Z = 2026-07-31T23:00 BRT → conta em julho, não agosto.
    expect(currentPeriod(new Date("2026-08-01T02:00:00Z"))).toBe("2026-07")
  })
  it("vira agosto às 00:00 BRT (03:00 UTC)", () => {
    expect(currentPeriod(new Date("2026-08-01T03:00:00Z"))).toBe("2026-08")
  })
})

describe("renewal (BRT)", () => {
  it("renova no 1º do próximo mês às 00:00 BRT", () => {
    const r = renewal(new Date("2026-07-15T12:00:00Z"))
    // 1º ago 00:00 BRT = 03:00 UTC
    expect(r.resetDate.toISOString()).toBe("2026-08-01T03:00:00.000Z")
  })
  it("no dia 31 falta 1 dia", () => {
    const r = renewal(new Date("2026-07-31T13:00:00Z")) // 10:00 BRT
    expect(r.daysLeft).toBe(1)
  })
  it("no dia 1º falta o mês inteiro", () => {
    const r = renewal(new Date("2026-07-01T13:00:00Z"))
    expect(r.daysLeft).toBe(31)
  })
})
