import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"

// Reconciliação de pagamento a partir do webhook do provedor. Idempotente: o
// provedor pode reentregar o mesmo evento. A fatura é achada por externalReference
// (id da nossa fatura) ou pelo id da cobrança.

type Found = { id: string; tenant_id: string; status: string } | null

async function findInvoice(chargeId: string | null, externalRef: string | null): Promise<Found> {
  const rows = (await db.execute(sql`
    SELECT id, tenant_id, status FROM public.invoices
     WHERE (${externalRef}::text IS NOT NULL AND id = ${externalRef}::uuid)
        OR (${chargeId}::text IS NOT NULL AND provider_charge_id = ${chargeId})
     LIMIT 1
  `)) as unknown as { id: string; tenant_id: string; status: string }[]
  return rows[0] ?? null
}

/**
 * Pagamento confirmado: marca a fatura como paga e, se o tenant estava bloqueado
 * por atraso (past_due), reativa as assinaturas. Volta true se aplicou.
 */
export async function applyPaymentReceived(chargeId: string | null, externalRef: string | null): Promise<boolean> {
  const inv = await findInvoice(chargeId, externalRef)
  if (!inv) return false
  if (inv.status === "paid") return true // já reconciliado
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE public.invoices SET status = 'paid', paid_at = now(), dunning_stage = 0 WHERE id = ${inv.id}::uuid
    `)
    // Pagou → destrava os produtos (past_due volta a active).
    await tx.execute(sql`
      UPDATE public.subscriptions SET status = 'active', updated_at = now()
       WHERE tenant_id = ${inv.tenant_id}::uuid AND status = 'past_due'
    `)
    await tx.execute(sql`
      INSERT INTO public.audit_log (tenant_id, action, detail)
      VALUES (${inv.tenant_id}::uuid, 'invoice.paid', ${JSON.stringify({ invoice: inv.id })}::jsonb)
    `)
    // E-mail de recibo (consumer `mailer` drena o outbox). Emitido na MESMA tx.
    const [meta] = (await tx.execute(sql`
      SELECT period, total_brl FROM public.invoices WHERE id = ${inv.id}::uuid
    `)) as unknown as { period: string; total_brl: string }[]
    await emitEvent(tx, {
      type: "PaymentReceived",
      tenantId: inv.tenant_id,
      payload: { invoice_id: inv.id, period: meta?.period, total_brl: meta?.total_brl },
    })
  })
  return true
}

/**
 * Cobrança vencida: marca a fatura como overdue. NÃO bloqueia na hora — começa o
 * grace period. Quem bloqueia (past_due) e cancela é o cron de dunning, por
 * estágio/dias desde o vencimento (app/api/cron/dunning/route.ts). Assim o acesso
 * segue durante o grace de 3 dias enquanto o Asaas re-tenta a recorrência do cartão.
 */
export async function applyPaymentOverdue(chargeId: string | null, externalRef: string | null): Promise<boolean> {
  const inv = await findInvoice(chargeId, externalRef)
  if (!inv) return false
  if (inv.status === "paid") return true // pagou depois; não rebaixa
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE public.invoices SET status = 'overdue' WHERE id = ${inv.id}::uuid AND status <> 'paid'
    `)
    await tx.execute(sql`
      INSERT INTO public.audit_log (tenant_id, action, detail)
      VALUES (${inv.tenant_id}::uuid, 'invoice.overdue', ${JSON.stringify({ invoice: inv.id })}::jsonb)
    `)
  })
  return true
}
