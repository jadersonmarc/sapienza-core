import { monthIndex } from "./compute"

// Fidelidade de 12 meses (pago mensal). Cancelamento antes do prazo tem multa
// PROPORCIONAL ao que falta (CDC: não pode ser fixa/cheia, tem que cair com o
// tempo). Estes helpers são puros — servem de GUIA para o superadmin no
// cancelamento manual; não cobram nada automaticamente. Completou 12 meses →
// multa zero (casa com o Degrau 13, que premia quem fica).

export const FIDELIDADE_MESES = 12
export const MULTA_PCT = 0.5 // 50% das mensalidades restantes

/** Meses restantes até completar a fidelidade (0 quando já cumprida). */
export function mesesRestantes(activatedAt: Date, at: Date = new Date()): number {
  // monthIndex é 1-based (mês 1 = ativação; 13 = 12 meses completos).
  const idx = monthIndex(activatedAt, at)
  return Math.max(0, FIDELIDADE_MESES + 1 - idx)
}

/** Multa sugerida = 50% × (mensalidades restantes) × mensalidade do tier. */
export function multaCancelamento(mensal: number, activatedAt: Date, at: Date = new Date()): number {
  const bruto = MULTA_PCT * mesesRestantes(activatedAt, at) * mensal
  return Math.round(bruto * 100) / 100
}
