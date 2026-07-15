// Cálculo de fatura — espelha sapienza-kit/billing (mesma regra, fonte no core).

/** Excedente faturável de um count contra o incluso do tier. */
export function overage(count: number, incluso: number, excedenteUnitario: number): number {
  const over = count - incluso
  return over > 0 ? over * excedenteUnitario : 0
}

/**
 * Cobrança mensal de uma linha de assinatura:
 * mensalidade do tier (ou o PISO no mês >= 13 — Degrau 13) + excedente.
 * monthIndex é 1-based (meses desde a ativação).
 */
export function invoiceLine(params: {
  tierMensal: number
  piso: number
  excedenteUnitario: number
  count: number
  incluso: number
  monthIndex: number
}): number {
  const { tierMensal, piso, excedenteUnitario, count, incluso, monthIndex } = params
  const mensal = monthIndex >= 13 ? piso : tierMensal
  return mensal + overage(count, incluso, excedenteUnitario)
}

/** Índice do mês (1-based) de uma data dentro do ciclo iniciado em activatedAt. */
export function monthIndex(activatedAt: Date, at: Date): number {
  const months =
    (at.getUTCFullYear() - activatedAt.getUTCFullYear()) * 12 +
    (at.getUTCMonth() - activatedAt.getUTCMonth())
  return months + 1
}

/** Gating de uso: hard cap bloqueia ao atingir o incluso; soft nunca bloqueia. */
export function blockedByCap(count: number, incluso: number, hardCap: boolean): boolean {
  return hardCap && count >= incluso
}
