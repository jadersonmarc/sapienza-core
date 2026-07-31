import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { mailer } from "./mailer"
import { buildEmail, EMAIL_EVENT_TYPES } from "./templates"

// Consumer `mailer`: drena o public.event_outbox e envia 1 e-mail por evento que
// gera e-mail. Cursor próprio em bus.event_cursors (não escreve em public, exceto
// o dedupe em email_deliveries). Entrega at-least-once → efeito once via claim
// em email_deliveries ANTES do envio. Espelha sapienza-motor/lib/platform/events.ts.

const CURSOR_CONSUMER = "mailer"

type OutboxEvent = {
  id: number
  type: string
  tenant_id: string
  produto: string | null
  payload: Record<string, unknown>
}

async function cursor(): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT last_id FROM bus.event_cursors WHERE consumer = ${CURSOR_CONSUMER}
  `)) as unknown as { last_id: number }[]
  return rows[0]?.last_id ?? 0
}

async function ack(upTo: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO bus.event_cursors (consumer, last_id, updated_at)
    VALUES (${CURSOR_CONSUMER}, ${upTo}, now())
    ON CONFLICT (consumer) DO UPDATE SET last_id = EXCLUDED.last_id, updated_at = now()
  `)
}

async function fetchAfter(after: number, limit = 100): Promise<OutboxEvent[]> {
  return (await db.execute(sql`
    SELECT id, type, tenant_id, produto, payload FROM public.event_outbox
    WHERE id > ${after} ORDER BY id LIMIT ${limit}
  `)) as unknown as OutboxEvent[]
}

/** Destinatário do e-mail: `email` explícito no payload (reset/verificação/welcome)
 *  ou o owner do tenant (eventos de cobrança). null se não achar. */
async function resolveRecipient(ev: OutboxEvent): Promise<string | null> {
  const explicit = ev.payload.email
  if (typeof explicit === "string" && explicit.includes("@")) return explicit
  const rows = (await db.execute(sql`
    SELECT u.email FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id
    WHERE m.tenant_id = ${ev.tenant_id}::uuid AND m.role = 'owner'
    ORDER BY m.created_at LIMIT 1
  `)) as unknown as { email: string }[]
  return rows[0]?.email ?? null
}

/** Tenta reservar o envio deste evento (dedupe). true se ESTE processo reservou. */
async function claim(eventId: number): Promise<boolean> {
  const rows = (await db.execute(sql`
    INSERT INTO public.email_deliveries (event_id) VALUES (${eventId})
    ON CONFLICT (event_id) DO NOTHING RETURNING event_id
  `)) as unknown as { event_id: number }[]
  return rows.length > 0
}

async function unclaim(eventId: number): Promise<void> {
  await db.execute(sql`DELETE FROM public.email_deliveries WHERE event_id = ${eventId}`)
}

/** Processa um lote a partir do cursor. Retorna quantos eventos avançou.
 *  Para no 1º erro de envio (não avança além dele → retenta no próximo tick). */
export async function dispatchBatch(limit = 100): Promise<number> {
  const last = await cursor()
  const events = await fetchAfter(last, limit)
  if (events.length === 0) return 0

  let advancedTo = last
  const m = mailer()
  for (const ev of events) {
    if (EMAIL_EVENT_TYPES.has(ev.type)) {
      const to = await resolveRecipient(ev)
      if (to) {
        // Claim antes de enviar: se já reservado (reprocesso), não reenvia.
        const mine = await claim(ev.id)
        if (mine) {
          const msg = buildEmail(ev.type, ev.payload, to)
          if (msg) {
            try {
              await m.send(msg)
            } catch (e) {
              await unclaim(ev.id).catch(() => {})
              console.error(`[mailer] falha ao enviar evento ${ev.id} (${ev.type}):`, e)
              break // não avança o cursor além deste; retenta no próximo tick
            }
          }
        }
      } else {
        console.warn(`[mailer] evento ${ev.id} (${ev.type}) sem destinatário — pulando`)
      }
    }
    advancedTo = ev.id
  }

  if (advancedTo > last) await ack(advancedTo)
  return advancedTo - last === 0 ? 0 : events.filter((e) => e.id <= advancedTo).length
}

/** Drena o outbox em loop até esvaziar (usado pelo cron). */
export async function dispatchAll(): Promise<number> {
  let total = 0
  for (;;) {
    const before = await cursor()
    const n = await dispatchBatch()
    total += n
    const after = await cursor()
    if (n === 0 || after === before) break
  }
  return total
}
