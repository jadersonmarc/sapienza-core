import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"
import { invoiceLine, monthIndex, overage } from "@/lib/billing/compute"
import { loadPricing } from "@/lib/pricing/load"
import { paymentProvider } from "@/lib/payments/asaas"

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

  // Setup (uma vez): entra na PRIMEIRA fatura do tenant — a de menor período.
  // Detecção idempotente: não existe fatura de um período anterior.
  const earlier = (await db.execute(sql`
    SELECT 1 FROM public.invoices WHERE tenant_id = ${tenantId}::uuid AND period < ${period} LIMIT 1
  `)) as unknown as unknown[]
  if (earlier.length === 0) {
    const setup = loadPricing().setup.padrao
    if (setup > 0) {
      lines.push({ produto: "setup", tier: "único", mensal: setup, incluso: 0, count: 0, excedente: 0, subtotal: setup })
      total += setup
    }
  }

  // Persiste a fatura; guarda id e a cobrança já existente (para não duplicar).
  const inserted = (await db.transaction(async (tx) => {
    const rowsBack = (await tx.execute(sql`
      INSERT INTO public.invoices (tenant_id, period, status, lines, total_brl)
      VALUES (${tenantId}::uuid, ${period}, 'issued', ${JSON.stringify(lines)}::jsonb, ${total})
      ON CONFLICT (tenant_id, period)
      DO UPDATE SET lines = EXCLUDED.lines, total_brl = EXCLUDED.total_brl,
                    status = (CASE WHEN public.invoices.status = 'paid' THEN 'paid' ELSE 'issued' END)::invoice_status,
                    issued_at = now()
      RETURNING id, provider_charge_id
    `)) as unknown as { id: string; provider_charge_id: string | null }[]
    await emitEvent(tx, {
      type: "InvoiceIssued",
      tenantId,
      payload: { tenant_id: tenantId, period, total_brl: total },
    })
    return rowsBack[0]
  }))

  // Emite a cobrança no provedor (fora da tx — é chamada externa). Só se há valor,
  // o tenant tem cadastro de cobrança e ainda não há cobrança para esta fatura.
  if (total > 0 && !inserted.provider_charge_id) {
    const [tenant] = (await db.execute(sql`
      SELECT asaas_customer_id FROM public.tenants WHERE id = ${tenantId}::uuid
    `)) as unknown as { asaas_customer_id: string | null }[]
    const provider = paymentProvider()
    if (tenant?.asaas_customer_id && provider.configured()) {
      const charge = await provider.createCharge({
        customerId: tenant.asaas_customer_id,
        value: total,
        dueDate: dueDate(period),
        description: `Sapienza — ${period}`,
        externalReference: inserted.id,
      })
      await db.execute(sql`
        UPDATE public.invoices
           SET provider_charge_id = ${charge.id}, payment_url = ${charge.invoiceUrl},
               due_date = ${dueDate(period)}::date
         WHERE id = ${inserted.id}::uuid
      `)
    }
  }

  return { total, lines }
}

/** Vencimento: fim do período + 10 dias (YYYY-MM-DD). */
function dueDate(period: Period): string {
  const end = periodEnd(period)
  const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 10))
  return d.toISOString().slice(0, 10)
}
