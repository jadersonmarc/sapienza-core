import type { Coupon, CouponKind, CouponTarget } from "@/lib/coupons/types"

// Cálculo do cupom — funções PURAS (sem banco, sem rede). Testáveis isoladas.
// Preço sempre em BRL com 2 casas; o desconto nunca leva o líquido abaixo de zero.

/** Normaliza o código: sem espaços nas pontas, MAIÚSCULAS (comparação case-insensitive). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

/** Arredonda para centavos (evita ruído de ponto flutuante em percentual). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Aplica o desconto sobre o preço de tabela.
 *  - percentual: value = 0..100 (%).
 *  - fixo: value = BRL abatido.
 * O abatimento é limitado ao próprio preço base (líquido nunca negativo).
 */
export function computeDiscount(
  base: number,
  kind: CouponKind,
  value: number,
): { discount: number; net: number } {
  const raw = kind === "percentual" ? (base * value) / 100 : value
  const discount = round2(Math.min(Math.max(raw, 0), base))
  return { discount, net: round2(base - discount) }
}

/** O cupom vale para o alvo (produto+tier) escolhido? Escopo global casa com tudo. */
export function couponMatchesTarget(coupon: Coupon, target: CouponTarget): boolean {
  switch (coupon.scopeKind) {
    case "global":
      return true
    case "combo":
      return target.produto === "combo" && coupon.scopeTier === target.tier
    case "produto":
      return (
        target.produto !== "combo" &&
        coupon.scopeProduto === target.produto &&
        coupon.scopeTier === target.tier
      )
  }
}

/**
 * Data de fim do desconto = início + duração (meses). null = enquanto a
 * assinatura viver. Devolve "YYYY-MM-DD". Puro: recebe o início como Date.
 */
export function computeEndsOn(startsOn: Date, durationMonths: number | null): string | null {
  if (durationMonths == null) return null
  const d = new Date(Date.UTC(startsOn.getUTCFullYear(), startsOn.getUTCMonth(), startsOn.getUTCDate()))
  d.setUTCMonth(d.getUTCMonth() + durationMonths)
  return d.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" de uma data (UTC). */
export function toDateStr(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10)
}
