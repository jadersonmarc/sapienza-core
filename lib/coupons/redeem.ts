import { sql } from "drizzle-orm"
import type { PgTransaction } from "drizzle-orm/pg-core"
import { db } from "@/lib/db"
import { comboPreco, precoDe, type ProdutoId } from "@/lib/pricing/load"
import {
  CouponError,
  type Coupon,
  type CouponBillingModel,
  type CouponKind,
  type CouponScopeKind,
  type CouponTarget,
} from "@/lib/coupons/types"
import { computeDiscount, computeEndsOn, couponMatchesTarget, toDateStr } from "@/lib/coupons/compute"

// Operações de banco do cupom. O PREÇO BASE vem SEMPRE do pricing.yaml (nunca do
// request), por MODELO: avulso via precoDe, combo via comboPreco.
// Só usamos `.execute`; serve tanto `db` quanto uma transação (mesmo padrão do emitEvent).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = { execute: PgTransaction<any, any, any>["execute"] }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function mapCoupon(r: Record<string, unknown>): Coupon {
  return {
    id: String(r.id),
    code: String(r.code),
    kind: String(r.kind) as CouponKind,
    value: Number(r.value),
    scopeKind: String(r.scope_kind) as CouponScopeKind,
    scopeProduto: (r.scope_produto as ProdutoId | null) ?? null,
    scopeTier: (r.scope_tier as string | null) ?? null,
    redeemBy: (r.redeem_by as string | null) ?? null,
    maxRedemptions: r.max_redemptions == null ? null : Number(r.max_redemptions),
    redemptionCount: Number(r.redemption_count ?? 0),
    billingModel: (String(r.billing_model ?? "ambos")) as CouponBillingModel,
    active: Boolean(r.active),
  }
}

/** Preço de tabela do alvo, por MODELO — sempre do pricing.yaml. */
export function priceBaseFor(target: CouponTarget): number {
  return target.produto === "combo"
    ? comboPreco(target.tier, target.model)
    : precoDe(target.produto, target.tier, target.model)
}

/** Carrega o cupom pelo código (case-insensitive). null se não existir. */
export async function loadCouponByCode(code: string, exec: Executor = db): Promise<Coupon | null> {
  const rows = (await exec.execute(sql`
    SELECT * FROM public.coupons WHERE upper(code) = upper(${code}) LIMIT 1
  `)) as unknown as Record<string, unknown>[]
  return rows[0] ? mapCoupon(rows[0]) : null
}

/** Resgates que OCUPAM vaga (não-revogados) — base autoritativa do esgotamento. */
async function occupiedRedemptions(couponId: string, exec: Executor = db): Promise<number> {
  const rows = (await exec.execute(sql`
    SELECT count(*)::int AS n FROM public.coupon_redemptions
     WHERE coupon_id = ${couponId}::uuid AND status <> 'revoked'
  `)) as unknown as { n: number }[]
  return rows[0]?.n ?? 0
}

/**
 * Valida o cupom para um alvo (produto+tier). Só leitura — usado para falhar
 * cedo no checkout e no admin. Lança CouponError distinguindo o motivo.
 */
export async function validateCoupon(
  code: string,
  target: CouponTarget,
  exec: Executor = db,
): Promise<Coupon> {
  const coupon = await loadCouponByCode(code, exec)
  if (!coupon) throw new CouponError("not_found")
  if (!coupon.active) throw new CouponError("inactive")
  if (coupon.redeemBy && todayStr() > coupon.redeemBy) throw new CouponError("expired")
  if (coupon.maxRedemptions != null && (await occupiedRedemptions(coupon.id, exec)) >= coupon.maxRedemptions) {
    throw new CouponError("exhausted")
  }
  if (!couponMatchesTarget(coupon, target)) throw new CouponError("out_of_scope")
  // Modelo permitido do cupom vs o modelo da assinatura.
  if (coupon.billingModel !== "ambos" && coupon.billingModel !== target.model) {
    throw new CouponError("model_not_allowed")
  }
  // TRAVA: fixo só no anual — no mensal (termo indefinido) viraria desconto
  // perpétuo. Validado na APLICAÇÃO, não só na criação do cupom.
  if (coupon.kind === "fixo" && target.model !== "anual") {
    throw new CouponError("fixed_requires_annual")
  }
  return coupon
}

export type RedeemResult = {
  redemptionId: string
  base: number
  discount: number
  net: number
  startsOn: string
  endsOn: string | null
}

/**
 * Grava um resgate e reflete o contador do cupom. Deve rodar DENTRO de uma
 * transação (`tx`): trava a linha do cupom (FOR UPDATE) e re-checa o
 * esgotamento sob lock, para que resgates concorrentes não furem o máximo.
 * Recalcula o desconto do zero (preço base do servidor) — nunca confia no request.
 */
export async function redeemCoupon(
  tx: Executor,
  args: {
    coupon: Coupon
    tenantId: string
    target: CouponTarget
    providerSubId: string | null
    startsOn?: Date
  },
): Promise<RedeemResult> {
  const { coupon, tenantId, target } = args
  // Serializa contra corrida de esgotamento.
  await tx.execute(sql`SELECT 1 FROM public.coupons WHERE id = ${coupon.id}::uuid FOR UPDATE`)
  if (coupon.maxRedemptions != null && (await occupiedRedemptions(coupon.id, tx)) >= coupon.maxRedemptions) {
    throw new CouponError("exhausted")
  }

  const base = priceBaseFor(target)
  const { discount, net } = computeDiscount(base, coupon.kind, coupon.value)
  const startsOn = args.startsOn ?? new Date()
  const startsOnStr = toDateStr(startsOn)
  // Vigência = termo da assinatura: anual encerra em 12 meses; mensal é indefinido
  // (ends_on null → o desconto percentual persiste até cancelar). Sem duração de cupom.
  const endsOn = target.model === "anual" ? computeEndsOn(startsOn, 12) : null

  const ins = (await tx.execute(sql`
    INSERT INTO public.coupon_redemptions
      (coupon_id, tenant_id, provider_sub_id, produto, tier, billing_model,
       base_value, discount_amount, net_value, starts_on, ends_on)
    VALUES (${coupon.id}::uuid, ${tenantId}::uuid, ${args.providerSubId},
            ${target.produto}, ${target.tier}, ${target.model},
            ${base}, ${discount}, ${net}, ${startsOnStr}::date,
            ${endsOn == null ? sql`NULL` : sql`${endsOn}::date`})
    RETURNING id
  `)) as unknown as { id: string }[]

  // Espelho do contador (autoritativo = contagem real de não-revogados).
  await tx.execute(sql`
    UPDATE public.coupons
       SET redemption_count = (
             SELECT count(*) FROM public.coupon_redemptions
              WHERE coupon_id = ${coupon.id}::uuid AND status <> 'revoked'
           ),
           updated_at = now()
     WHERE id = ${coupon.id}::uuid
  `)

  return { redemptionId: ins[0].id, base, discount, net, startsOn: startsOnStr, endsOn }
}

/** Recalcula o espelho do contador (após revogar/expirar). */
export async function refreshRedemptionCount(couponId: string, exec: Executor = db): Promise<void> {
  await exec.execute(sql`
    UPDATE public.coupons
       SET redemption_count = (
             SELECT count(*) FROM public.coupon_redemptions
              WHERE coupon_id = ${couponId}::uuid AND status <> 'revoked'
           ),
           updated_at = now()
     WHERE id = ${couponId}::uuid
  `)
}
