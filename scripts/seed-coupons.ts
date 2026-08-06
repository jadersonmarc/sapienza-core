import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { normalizeCode } from "@/lib/coupons/compute"

// Semeia os cupons de lançamento. Idempotente: re-rodar atualiza o mesmo código
// (não zera o contador de resgates). Uso: pnpm coupons:seed

type CouponSeed = {
  code: string
  kind: "percentual" | "fixo"
  value: number
  scopeKind: "global" | "produto" | "combo"
  scopeProduto: "margot" | "motor" | null
  scopeTier: string | null
  redeemBy: string | null
  maxRedemptions: number | null
  durationMonths: number | null
}

const COUPONS: CouponSeed[] = [
  {
    // Primeiro cliente pagante: R$200 de desconto no Combo Pro, por 12 meses, 1 uso.
    code: "NORTEC2026",
    kind: "fixo",
    value: 200,
    scopeKind: "combo",
    scopeProduto: null,
    scopeTier: "pro",
    redeemBy: null,
    maxRedemptions: 1,
    durationMonths: 12,
  },
]

async function upsert(c: CouponSeed): Promise<void> {
  const code = normalizeCode(c.code)
  const existing = (await db.execute(sql`
    SELECT id FROM public.coupons WHERE upper(code) = upper(${code}) LIMIT 1
  `)) as unknown as { id: string }[]

  if (existing[0]) {
    // Atualiza a definição SEM tocar em redemption_count nem nos resgates.
    await db.execute(sql`
      UPDATE public.coupons
         SET kind = ${c.kind}, value = ${c.value},
             scope_kind = ${c.scopeKind}, scope_produto = ${c.scopeProduto},
             scope_tier = ${c.scopeTier}, redeem_by = ${c.redeemBy},
             max_redemptions = ${c.maxRedemptions}, duration_months = ${c.durationMonths},
             active = true, updated_at = now()
       WHERE id = ${existing[0].id}::uuid
    `)
    console.log(`cupom ${code} atualizado`)
    return
  }
  await db.execute(sql`
    INSERT INTO public.coupons
      (code, kind, value, scope_kind, scope_produto, scope_tier, redeem_by, max_redemptions, duration_months, active)
    VALUES (${code}, ${c.kind}, ${c.value}, ${c.scopeKind}, ${c.scopeProduto},
            ${c.scopeTier}, ${c.redeemBy}, ${c.maxRedemptions}, ${c.durationMonths}, true)
  `)
  console.log(`cupom ${code} criado`)
}

async function main(): Promise<void> {
  for (const c of COUPONS) await upsert(c)
  process.exit(0)
}

main().catch((e) => {
  console.error("seed de cupons falhou:", e)
  process.exit(1)
})
