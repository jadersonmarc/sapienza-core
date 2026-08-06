import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { paymentProvider } from "@/lib/payments/asaas"
import { priceBaseFor, refreshRedemptionCount } from "@/lib/coupons/redeem"
import type { CouponTarget } from "@/lib/coupons/types"
import type { ProdutoId } from "@/lib/pricing/load"

// Expiração dos resgates: quando o fim do desconto vence, a recorrência do Asaas
// volta ao PREÇO DE TABELA e o resgate é encerrado. Idempotente:
//  - só varre resgates 'active' com ends_on vencido;
//  - Asaas-FIRST (restaura o valor) e só então marca 'expired' com guarda
//    `status='active'` no UPDATE — rodar duas vezes não altera nem cobra 2×
//    (reenviar o mesmo valor de tabela ao Asaas é no-op econômico).
export async function runCouponExpiry(
  now: Date = new Date(),
): Promise<{ scanned: number; expired: number; skipped: number }> {
  const today = now.toISOString().slice(0, 10)
  const rows = (await db.execute(sql`
    SELECT id, coupon_id, tenant_id, provider_sub_id, produto, tier
      FROM public.coupon_redemptions
     WHERE status = 'active' AND ends_on IS NOT NULL AND ends_on <= ${today}::date
  `)) as unknown as {
    id: string
    coupon_id: string
    tenant_id: string
    provider_sub_id: string | null
    produto: string
    tier: string
  }[]

  const provider = paymentProvider()
  let expired = 0
  let skipped = 0

  for (const r of rows) {
    const target: CouponTarget = { produto: r.produto as ProdutoId | "combo", tier: r.tier }
    const tablePrice = await priceBaseFor(target)

    // Restaura o preço de tabela ANTES de encerrar (se há recorrência).
    if (r.provider_sub_id) {
      if (!provider.configured()) {
        skipped++
        continue // sem provedor não dá para restaurar; tenta no próximo scan
      }
      await provider.updateSubscriptionValue(r.provider_sub_id, tablePrice)
    }

    const upd = (await db.execute(sql`
      UPDATE public.coupon_redemptions
         SET status = 'expired', ended_at = now()
       WHERE id = ${r.id}::uuid AND status = 'active'
      RETURNING id
    `)) as unknown as { id: string }[]
    if (upd.length > 0) {
      expired++
      await refreshRedemptionCount(r.coupon_id)
    }
  }

  return { scanned: rows.length, expired, skipped }
}
