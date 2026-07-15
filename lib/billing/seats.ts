import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { loadPricing } from "@/lib/pricing/load"

// Seats = limite de usuários por TENANT (transversal aos produtos). O limite vem
// do MAIOR tier ativo entre as assinaturas do tenant; a contagem são as
// memberships humanas (owner/admin/member). Super-admin Sapienza e agentes de IA
// nunca contam. Fonte de verdade: pricing.yaml > seats (nunca chumbar).

export type Tier = "start" | "pro" | "scale"

export type SeatErrorCode = "SEAT_LIMIT_REACHED" | "DOWNGRADE_BLOCKED_BY_SEATS"

/** Erro estruturado de seats — a UI usa `code` para a mensagem/CTA de upgrade. */
export class SeatError extends Error {
  code: SeatErrorCode
  constructor(code: SeatErrorCode, message: string) {
    super(message)
    this.name = "SeatError"
    this.code = code
  }
}

const TIER_RANK: Record<Tier, number> = { start: 1, pro: 2, scale: 3 }

/** Maior tier entre uma lista (por ranking start<pro<scale); default `start`. */
export function highestOf(tiers: Tier[]): Tier {
  let best: Tier = "start"
  for (const t of tiers) if (TIER_RANK[t] > TIER_RANK[best]) best = t
  return best
}

/** Maior tier ativo entre as assinaturas do tenant (null se nenhuma ativa). */
export async function highestActiveTier(tenantId: string): Promise<Tier | null> {
  const rows = (await db.execute(sql`
    SELECT tier FROM public.subscriptions
    WHERE tenant_id = ${tenantId}::uuid AND status = 'active'
  `)) as unknown as { tier: string }[]
  let best: Tier | null = null
  for (const r of rows) {
    const t = r.tier as Tier
    if (TIER_RANK[t] && (best === null || TIER_RANK[t] > TIER_RANK[best])) best = t
  }
  return best
}

/** Limite de seats do tenant. Sem assinatura ativa → tier `start` (permite o owner). */
export async function seatsLimit(tenantId: string): Promise<number> {
  const { por_tier } = loadPricing().seats
  const tier = (await highestActiveTier(tenantId)) ?? "start"
  return por_tier[tier]
}

/** Usuários que contam como seat: memberships com papel em `contam_como_seat`,
 *  excluindo super-admins da plataforma (is_superadmin). */
export async function seatsUsed(tenantId: string): Promise<number> {
  const roles = loadPricing().seats.contam_como_seat
  const roleArray = sql.join(
    roles.map((r) => sql`${r}`),
    sql`, `,
  )
  const rows = (await db.execute(sql`
    SELECT count(*)::int AS n
    FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND u.is_superadmin = false
      AND m.role::text = ANY(ARRAY[${roleArray}]::text[])
  `)) as unknown as { n: number }[]
  return rows[0]?.n ?? 0
}

export type SeatUsage = { used: number; limit: number; atCap: boolean; tier: Tier }

/** Contagem X/N para o console. */
export async function seatsUsage(tenantId: string): Promise<SeatUsage> {
  const { por_tier } = loadPricing().seats
  const tier = (await highestActiveTier(tenantId)) ?? "start"
  const limit = por_tier[tier]
  const used = await seatsUsed(tenantId)
  return { used, limit, atCap: used >= limit, tier }
}

/** Limite de seats de um tier específico (usado no bloqueio de downgrade). */
export function seatsLimitForTier(tier: Tier): number {
  return loadPricing().seats.por_tier[tier]
}
