import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { closeTenantInvoice } from "@/lib/billing/close"
import { cronAuthorized } from "@/lib/auth/webhook"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

/** Mês anterior (YYYY-MM) — o ciclo que acabou de fechar. */
function previousPeriod(at = new Date()): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1))
  return d.toISOString().slice(0, 7)
}

// POST /api/cron/billing-close — fecha o período para todos os tenants com
// assinatura ativa (mesma lógica do `pnpm billing:close`, agendável por HTTP).
// Body opcional { period }. Default = mês anterior. Protegido por x-webhook-secret.
export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return json(401, { error: "unauthorized" })

  const body = (await req.json().catch(() => ({}))) as { period?: string }
  const period = body.period && /^\d{4}-\d{2}$/.test(body.period) ? body.period : previousPeriod()

  const rows = (await db.execute(sql`
    SELECT DISTINCT tenant_id FROM public.subscriptions WHERE status = 'active'
  `)) as unknown as { tenant_id: string }[]

  const closed: { tenantId: string; total: number }[] = []
  const errors: { tenantId: string; error: string }[] = []
  for (const r of rows) {
    try {
      const { total } = await closeTenantInvoice(r.tenant_id, period)
      closed.push({ tenantId: r.tenant_id, total })
    } catch (e) {
      errors.push({ tenantId: r.tenant_id, error: String(e instanceof Error ? e.message : e) })
    }
  }
  return json(200, { period, closed, errors })
}
