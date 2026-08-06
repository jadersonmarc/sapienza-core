import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { paymentProvider } from "@/lib/payments/asaas"
import { computeDiscount } from "@/lib/coupons/compute"
import { priceBaseFor, redeemCoupon, refreshRedemptionCount, validateCoupon } from "@/lib/coupons/redeem"
import type { CouponTarget } from "@/lib/coupons/types"
import type { ProdutoId } from "@/lib/pricing/load"

// Concessão de desconto pelo superadmin, SEM passar pelo checkout — a porta do
// desconto recorrente negociado. Aplica/revoga sobre uma assinatura já existente,
// mexendo SÓ no preço (a recorrência do Asaas). Plano, hard caps e assentos ficam.

export class AdminCouponError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminCouponError"
  }
}

/**
 * Descobre o alvo comercial (produto+tier) e a recorrência do Asaas de um tenant.
 * Combo = margot+motor compartilhando a MESMA recorrência. Exige recorrência única
 * (sem ela não há o que descontar no Asaas).
 */
async function resolveSubscription(
  tenantId: string,
): Promise<{ target: CouponTarget; providerSubId: string }> {
  const subs = (await db.execute(sql`
    SELECT produto, tier, provider_sub_id
      FROM public.subscriptions
     WHERE tenant_id = ${tenantId}::uuid AND status IN ('active', 'past_due')
     ORDER BY produto
  `)) as unknown as { produto: string; tier: string; provider_sub_id: string | null }[]

  if (subs.length === 0) throw new AdminCouponError("tenant sem assinatura ativa")

  const providerIds = new Set(subs.map((s) => s.provider_sub_id).filter(Boolean) as string[])
  if (providerIds.size !== 1) {
    throw new AdminCouponError("assinatura sem recorrência única no Asaas — não há o que descontar")
  }
  const providerSubId = [...providerIds][0]

  const tiers = new Set(subs.map((s) => s.tier))
  if (tiers.size !== 1) throw new AdminCouponError("assinaturas em planos diferentes — resolva manualmente")
  const tier = subs[0].tier

  const produtos = subs.map((s) => s.produto).sort()
  const isCombo = produtos.length === 2 && produtos[0] === "margot" && produtos[1] === "motor"
  const target: CouponTarget = { produto: isCombo ? "combo" : (produtos[0] as ProdutoId), tier }
  return { target, providerSubId }
}

/** Aplica um cupom a uma assinatura existente. Asaas-first, depois grava o resgate. */
export async function applyCouponToSubscription(args: {
  tenantId: string
  code: string
}): Promise<{ redemptionId: string; base: number; discount: number; net: number; endsOn: string | null }> {
  const { target, providerSubId } = await resolveSubscription(args.tenantId)
  const coupon = await validateCoupon(args.code, target) // lança CouponError distinto

  const existing = (await db.execute(sql`
    SELECT 1 FROM public.coupon_redemptions
     WHERE provider_sub_id = ${providerSubId} AND status = 'active' LIMIT 1
  `)) as unknown as unknown[]
  if (existing.length > 0) throw new AdminCouponError("já há um cupom ativo nesta assinatura")

  const base = await priceBaseFor(target)
  const { net } = computeDiscount(base, coupon.kind, coupon.value)

  const provider = paymentProvider()
  if (!provider.configured()) throw new AdminCouponError("pagamento indisponível no momento")
  // Asaas-first: aplica o líquido antes de gravar o resgate.
  await provider.updateSubscriptionValue(providerSubId, net)

  let result!: Awaited<ReturnType<typeof redeemCoupon>>
  await db.transaction(async (tx) => {
    result = await redeemCoupon(tx, { coupon, tenantId: args.tenantId, target, providerSubId })
    await tx.execute(sql`
      INSERT INTO public.audit_log (tenant_id, action, detail)
      VALUES (${args.tenantId}::uuid, 'coupon.applied', ${JSON.stringify({
        code: coupon.code, redemption: result.redemptionId, base: result.base, net: result.net,
      })}::jsonb)
    `)
  })
  return { redemptionId: result.redemptionId, base: result.base, discount: result.discount, net: result.net, endsOn: result.endsOn }
}

/** Revoga um resgate ativo: recorrência volta ao preço de tabela e o resgate encerra. */
export async function revokeCoupon(args: { redemptionId: string }): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT id, coupon_id, tenant_id, provider_sub_id, produto, tier
      FROM public.coupon_redemptions
     WHERE id = ${args.redemptionId}::uuid AND status = 'active'
  `)) as unknown as {
    id: string; coupon_id: string; tenant_id: string
    provider_sub_id: string | null; produto: string; tier: string
  }[]
  const r = rows[0]
  if (!r) throw new AdminCouponError("resgate não encontrado ou já encerrado")

  const target: CouponTarget = { produto: r.produto as ProdutoId | "combo", tier: r.tier }
  const tablePrice = await priceBaseFor(target)

  if (r.provider_sub_id) {
    const provider = paymentProvider()
    if (!provider.configured()) throw new AdminCouponError("pagamento indisponível no momento")
    await provider.updateSubscriptionValue(r.provider_sub_id, tablePrice) // Asaas-first
  }

  await db.transaction(async (tx) => {
    const upd = (await tx.execute(sql`
      UPDATE public.coupon_redemptions
         SET status = 'revoked', ended_at = now()
       WHERE id = ${r.id}::uuid AND status = 'active'
      RETURNING id
    `)) as unknown as { id: string }[]
    if (upd.length > 0) {
      await refreshRedemptionCount(r.coupon_id, tx)
      await tx.execute(sql`
        INSERT INTO public.audit_log (tenant_id, action, detail)
        VALUES (${r.tenant_id}::uuid, 'coupon.revoked', ${JSON.stringify({ redemption: r.id })}::jsonb)
      `)
    }
  })
}
