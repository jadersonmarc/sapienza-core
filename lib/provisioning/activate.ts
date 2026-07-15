import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"
import type { ProdutoId } from "@/lib/pricing/load"

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
}): Promise<{ schema: string }> {
  const schema = schemaName(args.tenantId)
  // Segurança: só aceitamos o nome derivado do uuid (evita DDL injection).
  if (!/^tenant_[0-9a-f]{32}$/.test(schema)) {
    throw new Error(`tenantId inválido: ${args.tenantId}`)
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO public.subscriptions (tenant_id, produto, tier, status, hard_cap)
      VALUES (${args.tenantId}::uuid, ${args.produto}, ${args.tier}, 'active', ${args.hardCap ?? false})
      ON CONFLICT (tenant_id, produto)
      DO UPDATE SET tier = EXCLUDED.tier, status = 'active',
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
