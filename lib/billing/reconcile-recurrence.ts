import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { paymentProvider } from "@/lib/payments/asaas"
import { monthIndex } from "@/lib/billing/compute"
import { comboPreco, precoDe, type BillingModel } from "@/lib/pricing/load"
import { refreshRedemptionCount } from "@/lib/coupons/redeem"

// Reconciliação do valor da recorrência do Asaas. Unifica dois "aniversários" que
// hoje nada atualizava no provedor:
//   1. Degrau 13 (modelo ANUAL): no mês >=13 o preço cai ao piso.
//   2. Fim do desconto do cupom: o resgate vale enquanto o TERMO da assinatura
//      (anual = 12m; mensal = indefinido → percentual persiste).
// Para cada recorrência ativa, calcula o valor ESPERADO e, se divergir do
// `recurrence_value` guardado, atualiza o Asaas (idempotente — não reenvia igual).

type SubRow = {
  tenant_id: string
  produto: string
  tier: string
  billing_model: string
  activated_at: Date
  provider_sub_id: string
  recurrence_value: string | null
  piso: string
}

type Redemption = {
  id: string
  coupon_id: string
  ends_on: string | null
  net_value: string
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export async function runRecurrenceReconciliation(
  now: Date = new Date(),
): Promise<{ recurrences: number; updated: number; expired: number; skipped: number }> {
  const rows = (await db.execute(sql`
    SELECT s.tenant_id, s.produto, s.tier, s.billing_model, s.activated_at,
           s.provider_sub_id, s.recurrence_value, p.piso
      FROM public.subscriptions s
      JOIN public.plans p ON p.produto = s.produto AND p.tier = s.tier AND p.model = s.billing_model
     WHERE s.status = 'active' AND s.provider_sub_id IS NOT NULL
  `)) as unknown as SubRow[]

  // Agrupa por recorrência (combo = margot+motor compartilham o provider_sub_id).
  const byRecurrence = new Map<string, SubRow[]>()
  for (const r of rows) {
    const list = byRecurrence.get(r.provider_sub_id) ?? []
    list.push(r)
    byRecurrence.set(r.provider_sub_id, list)
  }

  const provider = paymentProvider()
  let updated = 0
  let expired = 0
  let skipped = 0

  for (const [providerSubId, subs] of byRecurrence) {
    const first = subs[0]
    const model = first.billing_model as BillingModel
    const tier = first.tier
    const produtos = subs.map((s) => s.produto).sort()
    const isCombo = produtos.length === 2 && produtos[0] === "margot" && produtos[1] === "motor"

    // Preço de tabela (sem cupom) por modelo. Degrau 13 (anual, mês>=13) leva o
    // avulso ao piso; combo mantém o preço de combo (piso de combo = follow-up).
    let base = isCombo ? comboPreco(tier, model) : precoDe(first.produto as "margot" | "motor", tier, model)
    if (model === "anual" && !isCombo && monthIndex(new Date(first.activated_at), now) >= 13) {
      base = Number(first.piso)
    }

    // Resgate ativo nesta recorrência (se houver) e se ainda no termo.
    const reds = (await db.execute(sql`
      SELECT id, coupon_id, ends_on, net_value FROM public.coupon_redemptions
       WHERE provider_sub_id = ${providerSubId} AND status = 'active' LIMIT 1
    `)) as unknown as Redemption[]
    const red = reds[0]
    const discountActive = !!red && (red.ends_on == null || red.ends_on > today(now))

    const expected = discountActive ? Number(red.net_value) : base

    // Cupom no fim do termo: encerra o resgate (não some sozinho — não há cron
    // de expiração de cupom; é a renovação que o descarta).
    if (red && !discountActive) {
      await db.transaction(async (tx) => {
        const upd = (await tx.execute(sql`
          UPDATE public.coupon_redemptions SET status = 'expired', ended_at = now()
           WHERE id = ${red.id}::uuid AND status = 'active' RETURNING id
        `)) as unknown as { id: string }[]
        if (upd.length > 0) {
          expired++
          await refreshRedemptionCount(red.coupon_id, tx)
        }
      })
    }

    // Só toca o Asaas quando o valor esperado diverge do já setado (idempotência).
    if (Number(first.recurrence_value ?? NaN) === expected) continue
    if (!provider.configured()) {
      skipped++
      continue
    }
    await provider.updateSubscriptionValue(providerSubId, expected)
    await db.execute(sql`
      UPDATE public.subscriptions SET recurrence_value = ${expected}, updated_at = now()
       WHERE provider_sub_id = ${providerSubId}
    `)
    updated++
  }

  return { recurrences: byRecurrence.size, updated, expired, skipped }
}
