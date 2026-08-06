import type { ProdutoId } from "@/lib/pricing/load"

// O alvo comercial de um cupom = o que está sendo assinado. Combo é um alvo
// próprio (não um produto do enum) — margot + motor no mesmo tier.
export type CouponTarget = { produto: ProdutoId | "combo"; tier: string }

export type CouponKind = "percentual" | "fixo"
export type CouponScopeKind = "global" | "produto" | "combo"

// Linha de public.coupons (valores numéricos já convertidos de numeric→number).
export type Coupon = {
  id: string
  code: string
  kind: CouponKind
  value: number
  scopeKind: CouponScopeKind
  scopeProduto: ProdutoId | null
  scopeTier: string | null
  redeemBy: string | null // "YYYY-MM-DD"
  maxRedemptions: number | null
  redemptionCount: number
  durationMonths: number | null
  active: boolean
}

// Motivo distinto da recusa — o checkout traduz cada um numa mensagem clara.
export type CouponRejectReason =
  | "not_found"
  | "inactive"
  | "expired"
  | "exhausted"
  | "out_of_scope"

const REASON_MESSAGE: Record<CouponRejectReason, string> = {
  not_found: "Cupom inexistente.",
  inactive: "Cupom inativo.",
  expired: "Cupom expirado.",
  exhausted: "Cupom esgotado.",
  out_of_scope: "Cupom não vale para o plano escolhido.",
}

export class CouponError extends Error {
  constructor(readonly reason: CouponRejectReason) {
    super(REASON_MESSAGE[reason])
    this.name = "CouponError"
  }
}
