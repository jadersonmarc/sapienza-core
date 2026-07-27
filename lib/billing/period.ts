// Período de cobrança/uso = mês-calendário em America/Sao_Paulo (BRT). A cota de
// uso e o fechamento de fatura zeram à meia-noite de Brasília do dia 1º — não em
// UTC. TODOS os pontos que escrevem ou leem `usage_counters.period` usam este
// helper (e o equivalente Go no kit) para não dividir contagens na virada do mês.

const TZ = "America/Sao_Paulo"

// en-CA formata como AAAA-MM-DD, então basta cortar os 7 primeiros dígitos.
const YM = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" })

/** Período corrente "AAAA-MM" no fuso de São Paulo. */
export function currentPeriod(now: Date = new Date()): string {
  const parts = YM.formatToParts(now)
  const y = parts.find((p) => p.type === "year")!.value
  const m = parts.find((p) => p.type === "month")!.value
  return `${y}-${m}`
}

export type Renewal = {
  /** Instante do reset: 1º do próximo mês às 00:00 BRT. */
  resetDate: Date
  /** Dias inteiros até o reset (>= 1). */
  daysLeft: number
  /** Rótulo pt-BR curto da data de renovação, ex.: "1 de ago.". */
  label: string
}

/** Quando a cota do período corrente se renova (estilo "renova em N dias"). */
export function renewal(now: Date = new Date()): Renewal {
  const [y, m] = currentPeriod(now).split("-").map(Number) // m: 1..12 (BRT)
  // Date.UTC usa mês 0-indexado, então `m` (1-based) já aponta para o PRÓXIMO
  // mês. Brasil não tem horário de verão desde 2019 → BRT é UTC-3 fixo, logo
  // 00:00 BRT = 03:00 UTC.
  const resetDate = new Date(Date.UTC(y, m, 1, 3, 0, 0))
  const daysLeft = Math.max(1, Math.ceil((resetDate.getTime() - now.getTime()) / 86_400_000))
  const label = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "short" }).format(
    resetDate,
  )
  return { resetDate, daysLeft, label }
}
