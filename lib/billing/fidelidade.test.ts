import { describe, it, expect } from "vitest"
import { mesesRestantes, multaCancelamento } from "./fidelidade"

const ativado = new Date(Date.UTC(2026, 0, 15)) // 15/01/2026

describe("fidelidade", () => {
  it("no 1º mês faltam 12 meses; multa = 50% de 12 mensalidades", () => {
    const at = new Date(Date.UTC(2026, 0, 20))
    expect(mesesRestantes(ativado, at)).toBe(12)
    expect(multaCancelamento(700, ativado, at)).toBe(4200) // 0.5 * 12 * 700
  })

  it("a multa cai proporcionalmente com o tempo", () => {
    const meio = new Date(Date.UTC(2026, 6, 15)) // +6 meses
    expect(mesesRestantes(ativado, meio)).toBe(6)
    expect(multaCancelamento(700, ativado, meio)).toBe(2100) // 0.5 * 6 * 700
  })

  it("cumprida a fidelidade (12 meses), multa zero — casa com o Degrau 13", () => {
    const anoDepois = new Date(Date.UTC(2027, 0, 15)) // +12 meses (mês 13)
    expect(mesesRestantes(ativado, anoDepois)).toBe(0)
    expect(multaCancelamento(700, ativado, anoDepois)).toBe(0)
    const bemDepois = new Date(Date.UTC(2027, 8, 1)) // +20 meses
    expect(mesesRestantes(ativado, bemDepois)).toBe(0)
  })
})
