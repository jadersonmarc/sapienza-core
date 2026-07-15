import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"
import { invoiceLine, monthIndex, overage } from "@/lib/billing/compute"

// Fechamento mensal: para cada assinatura ativa, soma mensalidade (com Degrau 13)
// + excedente do uso do período, grava invoices e emite InvoiceIssued.

type Period = string // "YYYY-MM"

type Row = {
  tenant_id: string
  produto: string
  tier: string
  activated_at: Date
  mensal: string
  incluso: number
  excedente_unitario: string
  piso: string
  metric: string
  count: number | null
}

export type InvoiceLineOut = {
  produto: string
  tier: string
  mensal: number
  incluso: number
  count: number
  excedente: number
  subtotal: number
}

/** Data de referência (fim do período) para o índice de mês do Degrau 13. */
function periodEnd(period: Period): Date {
  const [y, m] = period.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 28))
}

/** Fecha o período para um tenant: calcula, persiste invoice e emite evento. */
export async function closeTenantInvoice(tenantId: string, period: Period): Promise<{
  total: number
  lines: InvoiceLineOut[]
}> {
  const at = periodEnd(period)

  const rows = (await db.execute(sql`
    SELECT s.tenant_id, s.produto, s.tier, s.activated_at,
           p.mensal, p.incluso, p.excedente_unitario, p.piso, p.metric,
           uc.count
      FROM public.subscriptions s
      JOIN public.plans p ON p.produto = s.produto AND p.tier = s.tier
      LEFT JOIN public.usage_counters uc
             ON uc.tenant_id = s.tenant_id AND uc.produto = s.produto
            AND uc.period = ${period} AND uc.metric = p.metric
     WHERE s.tenant_id = ${tenantId}::uuid AND s.status = 'active'
  `)) as unknown as Row[]

  const lines: InvoiceLineOut[] = []
  let total = 0
  for (const r of rows) {
    const count = r.count ?? 0
    const mensal = Number(r.mensal)
    const piso = Number(r.piso)
    const exc = Number(r.excedente_unitario)
    const mi = monthIndex(new Date(r.activated_at), at)
    const subtotal = invoiceLine({
      tierMensal: mensal, piso, excedenteUnitario: exc,
      count, incluso: r.incluso, monthIndex: mi,
    })
    lines.push({
      produto: r.produto,
      tier: r.tier,
      mensal: mi >= 13 ? piso : mensal,
      incluso: r.incluso,
      count,
      excedente: overage(count, r.incluso, exc),
      subtotal,
    })
    total += subtotal
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO public.invoices (tenant_id, period, status, lines, total_brl)
      VALUES (${tenantId}::uuid, ${period}, 'issued', ${JSON.stringify(lines)}::jsonb, ${total})
      ON CONFLICT (tenant_id, period)
      DO UPDATE SET lines = EXCLUDED.lines, total_brl = EXCLUDED.total_brl,
                    status = 'issued', issued_at = now()
    `)
    await emitEvent(tx, {
      type: "InvoiceIssued",
      tenantId,
      payload: { tenant_id: tenantId, period, total_brl: total },
    })
  })

  return { total, lines }
}
