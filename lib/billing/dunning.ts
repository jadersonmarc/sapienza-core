import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent, type EventType } from "@/lib/events/emit"
import { cancelAllSubscriptions } from "@/lib/provisioning/cancel"

// Dunning (inadimplência) — política grace 3 dias (decisão do usuário):
//   dia 0  → estágio 1: e-mail "venceu" (InvoiceOverdue)
//   dia 2  → estágio 2: e-mail "bloqueio iminente" (BlockImminent)
//   dia 3  → estágio 3: BLOQUEIA (assinaturas → past_due) + e-mail (SubscriptionBlocked)
//   dia 15 → estágio 4: CANCELA (recorrência no Asaas + status canceled) + e-mail
// O acesso segue ativo durante o grace (o webhook de overdue NÃO rebaixa mais —
// ver lib/billing/reconcile.ts). O Asaas re-tenta a recorrência do cartão sozinho;
// aqui não criamos cobrança nova (evita cobrança dupla), só reenviamos o link.
// dunning_stage avança só pra frente → idempotente (rodar 2×/dia não repete).

const MS_DAY = 86_400_000

/** Estágio-alvo para um nº de dias desde o vencimento. */
export function stageForDays(days: number): number {
  if (days >= 15) return 4
  if (days >= 3) return 3
  if (days >= 2) return 2
  if (days >= 0) return 1
  return 0
}

type OverdueRow = {
  id: string
  tenant_id: string
  due_date: string // 'YYYY-MM-DD'
  payment_url: string | null
  period: string
  dunning_stage: number
}

function daysSince(dueDate: string, now: Date): number {
  const due = new Date(`${dueDate}T00:00:00.000Z`).getTime()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - due) / MS_DAY)
}

async function emit(tenantId: string, type: EventType, payload: Record<string, unknown>): Promise<void> {
  await db.transaction((tx) => emitEvent(tx, { type, tenantId, payload }))
}

async function audit(tenantId: string, action: string, detail: Record<string, unknown>): Promise<void> {
  await db.execute(sql`
    INSERT INTO public.audit_log (tenant_id, action, detail)
    VALUES (${tenantId}::uuid, ${action}, ${JSON.stringify(detail)}::jsonb)
  `)
}

/** Aplica o efeito + e-mail de UM estágio recém-cruzado. */
async function applyStage(inv: OverdueRow, stage: number): Promise<void> {
  const base = { invoice_id: inv.id, period: inv.period, payment_url: inv.payment_url ?? undefined }
  switch (stage) {
    case 1:
      await emit(inv.tenant_id, "InvoiceOverdue", base)
      break
    case 2:
      await emit(inv.tenant_id, "BlockImminent", base)
      break
    case 3:
      await db.execute(sql`
        UPDATE public.subscriptions SET status = 'past_due', updated_at = now()
         WHERE tenant_id = ${inv.tenant_id}::uuid AND status = 'active'
      `)
      await emit(inv.tenant_id, "SubscriptionBlocked", base)
      break
    case 4:
      // Cancela a recorrência no Asaas + marca canceled (best-effort no provedor).
      await cancelAllSubscriptions(inv.tenant_id)
      await emit(inv.tenant_id, "SubscriptionCanceled", { invoice_id: inv.id, period: inv.period })
      break
  }
  await audit(inv.tenant_id, `dunning.stage${stage}`, { invoice: inv.id, days_from_due: null })
}

export type DunningResult = { scanned: number; advanced: { invoiceId: string; from: number; to: number }[] }

/** Varre faturas vencidas e avança o dunning conforme os dias desde o vencimento. */
export async function runDunning(now: Date = new Date()): Promise<DunningResult> {
  const rows = (await db.execute(sql`
    SELECT id, tenant_id, due_date, payment_url, period, dunning_stage
    FROM public.invoices
    WHERE status = 'overdue' AND due_date IS NOT NULL
  `)) as unknown as OverdueRow[]

  const advanced: DunningResult["advanced"] = []
  for (const inv of rows) {
    const days = daysSince(inv.due_date, now)
    const target = stageForDays(days)
    const from = inv.dunning_stage
    if (target <= from) continue
    // Cruza cada estágio de from+1 até target (aplica efeito + e-mail de cada um).
    for (let s = from + 1; s <= target; s++) {
      await applyStage(inv, s)
    }
    await db.execute(sql`
      UPDATE public.invoices SET dunning_stage = ${target} WHERE id = ${inv.id}::uuid
    `)
    advanced.push({ invoiceId: inv.id, from, to: target })
  }
  return { scanned: rows.length, advanced }
}
