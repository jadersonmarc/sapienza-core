import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"
import type { ProdutoId } from "@/lib/pricing/load"
import {
  SeatError,
  highestOf,
  seatsLimitForTier,
  seatsUsed,
  type Tier,
} from "@/lib/billing/seats"

/** Nome do schema Postgres de um tenant: tenant_<uuid sem hífens>. */
export function schemaName(tenantId: string): string {
  return "tenant_" + tenantId.replace(/-/g, "")
}

/**
 * Ativa a assinatura de um produto para um tenant, numa única transação:
 *  1. upsert em subscriptions (status=active)
 *  2. CREATE SCHEMA tenant_<id> (VAZIO — o core não cria tabelas de produto)
 *  3. grava TenantProvisioned + SubscriptionActivated no outbox
 *
 * O produto (data plane) escuta SubscriptionActivated e aplica SUAS migrations
 * de tenant naquele schema (validado no PROMPT B).
 */
export async function activateSubscription(args: {
  tenantId: string
  produto: ProdutoId
  tier: string
  hardCap?: boolean
  // Estado inicial. Default 'active' (superadmin). O checkout passa 'past_due':
  // provisiona schema + eventos, mas o gating bloqueia até o pagamento (o webhook
  // reativa para 'active').
  status?: "active" | "past_due" | "trialing"
}): Promise<{ schema: string }> {
  const schema = schemaName(args.tenantId)
  // Segurança: só aceitamos o nome derivado do uuid (evita DDL injection).
  if (!/^tenant_[0-9a-f]{32}$/.test(schema)) {
    throw new Error(`tenantId inválido: ${args.tenantId}`)
  }
  const status = args.status ?? "active"

  // Bloqueio de downgrade por seats: se esta mudança de tier reduzir o MAIOR tier
  // ativo do tenant abaixo do necessário para os usuários atuais, recusar (o owner
  // remove os excedentes manualmente; nunca removemos usuários automaticamente).
  await assertSeatsAllowDowngrade(args.tenantId, args.produto, args.tier as Tier)

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO public.subscriptions (tenant_id, produto, tier, status, hard_cap)
      VALUES (${args.tenantId}::uuid, ${args.produto}, ${args.tier}, ${status}::subscription_status, ${args.hardCap ?? false})
      ON CONFLICT (tenant_id, produto)
      DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status,
                    hard_cap = EXCLUDED.hard_cap, updated_at = now()
    `)

    // Schema vazio; nome já validado acima. sql.raw é seguro aqui.
    await tx.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`))

    await emitEvent(tx, {
      type: "TenantProvisioned",
      tenantId: args.tenantId,
      payload: { tenant_id: args.tenantId, schema },
    })
    await emitEvent(tx, {
      type: "SubscriptionActivated",
      tenantId: args.tenantId,
      produto: args.produto,
      payload: { tenant_id: args.tenantId, produto: args.produto, tier: args.tier },
    })
  })

  return { schema }
}

/**
 * Recusa a efetivação de um downgrade quando o tenant passaria a ter mais
 * usuários que o limite do novo maior-tier ativo. Emite DowngradeBlockedBySeats
 * e lança SeatError("DOWNGRADE_BLOCKED_BY_SEATS"). Não faz nada em upgrades/novos.
 */
async function assertSeatsAllowDowngrade(
  tenantId: string,
  produto: ProdutoId,
  toTier: Tier,
): Promise<void> {
  const active = (await db.execute(sql`
    SELECT produto, tier FROM public.subscriptions
    WHERE tenant_id = ${tenantId}::uuid AND status = 'active'
  `)) as unknown as { produto: string; tier: string }[]

  const current = new Map<string, Tier>()
  for (const r of active) current.set(r.produto, r.tier as Tier)
  const fromTier = highestOf([...current.values()])

  // Estado prospectivo: este produto passa a `toTier`, os demais inalterados.
  const prospective = new Map(current)
  prospective.set(produto, toTier)
  const toHighest = highestOf([...prospective.values()])

  const used = await seatsUsed(tenantId)
  const limit = seatsLimitForTier(toHighest)
  if (used > limit) {
    await db.transaction(async (tx) => {
      await emitEvent(tx, {
        type: "DowngradeBlockedBySeats",
        tenantId,
        payload: { tenant_id: tenantId, from: fromTier, to: toHighest, used, limit },
      })
    })
    throw new SeatError(
      "DOWNGRADE_BLOCKED_BY_SEATS",
      `Seu plano ${toHighest} permite ${limit} usuário(s). Remova ${used - limit} para concluir o downgrade.`,
    )
  }
}
