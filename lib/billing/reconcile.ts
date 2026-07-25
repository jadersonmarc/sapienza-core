import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email/send"
import { paymentConfirmedEmail } from "@/lib/email/templates"

// E-mail de confirmação (com link de login) ao owner. Best-effort: falha de
// e-mail nunca derruba a reconciliação do webhook.
async function notifyPaymentConfirmed(tenantId: string): Promise<void> {
  try {
    const rows = (await db.execute(sql`
      SELECT u.email, COALESCE(u.name, t.legal_name, '') AS name, s.produto, s.tier
        FROM public.memberships m
        JOIN public.users u ON u.id = m.user_id
        JOIN public.tenants t ON t.id = m.tenant_id
        LEFT JOIN public.subscriptions s ON s.tenant_id = m.tenant_id
       WHERE m.tenant_id = ${tenantId}::uuid AND m.role = 'owner'
       LIMIT 1
    `)) as unknown as { email: string; name: string; produto: string | null; tier: string | null }[]
    const owner = rows[0]
    if (!owner?.email) return
    const loginUrl = `${(process.env.AUTH_URL || "").replace(/\/$/, "")}/login`
    const { subject, html } = paymentConfirmedEmail({
      name: owner.name,
      loginUrl,
      produto: owner.produto ?? undefined,
      tier: owner.tier ?? undefined,
    })
    await sendEmail({ to: owner.email, subject, html })
  } catch (e) {
    console.error("[reconcile] falha ao enviar e-mail de confirmação:", e)
  }
}

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
      UPDATE public.invoices SET status = 'paid', paid_at = now() WHERE id = ${inv.id}::uuid
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
  })
  await notifyPaymentConfirmed(inv.tenant_id)
  return true
}

/**
 * Cobrança vencida: marca a fatura como overdue e coloca as assinaturas ativas em
 * past_due — o gating (canOperate exige active) bloqueia Margot e Motor.
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
      UPDATE public.subscriptions SET status = 'past_due', updated_at = now()
       WHERE tenant_id = ${inv.tenant_id}::uuid AND status = 'active'
    `)
    await tx.execute(sql`
      INSERT INTO public.audit_log (tenant_id, action, detail)
      VALUES (${inv.tenant_id}::uuid, 'invoice.overdue', ${JSON.stringify({ invoice: inv.id })}::jsonb)
    `)
  })
  return true
}
