import { sql } from "drizzle-orm"
import type { PgTransaction } from "drizzle-orm/pg-core"

// Contrato de eventos (espelha sapienza-kit/events). O core grava no
// public.event_outbox na MESMA transação da mudança de estado (outbox
// transacional); o trigger dispara pg_notify no commit.

export type EventType =
  | "TenantProvisioned"
  | "SubscriptionActivated"
  | "SubscriptionChanged"
  | "UsageRecorded"
  | "TierExceeded"
  | "InvoiceIssued"
  // Seats (auditoria/console; sem consumidor Go — não entram no kit/events).
  | "SeatLimitReached"
  | "MemberInvited"
  | "MemberRemoved"
  | "DowngradeBlockedBySeats"

/**
 * Grava um evento no outbox dentro de uma transação drizzle.
 * Use dentro de `db.transaction(async (tx) => { ...; await emitEvent(tx, ...) })`.
 */
export async function emitEvent(
  tx: { execute: PgTransaction<any, any, any>["execute"] },
  args: { type: EventType; tenantId: string; produto?: string; payload: Record<string, unknown> },
): Promise<void> {
  const produto = args.produto ?? null
  await tx.execute(sql`
    INSERT INTO public.event_outbox (type, tenant_id, produto, payload)
    VALUES (${args.type}, ${args.tenantId}::uuid, ${produto}, ${JSON.stringify(args.payload)}::jsonb)
  `)
}
