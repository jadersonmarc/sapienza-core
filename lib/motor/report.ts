import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { invoiceLine, monthIndex, overage } from "@/lib/billing/compute"

// Prévia do mês corrente para o Motor (não persiste — a fatura é emitida pelo
// billing:close). Lê o `public` (do core) reusando a MESMA regra do fechamento:
// mensalidade do tier (com Degrau 13) + excedente do uso agregado em usage_counters.

export type MotorBilling = {
  period: string
  tier: string
  metric: string
  count: number
  incluso: number
  excedenteUnitario: number
  excedente: number
  mensal: number
  subtotal: number
  hardCap: boolean
}

type Row = {
  tier: string
  activated_at: Date
  mensal: string
  incluso: number
  excedente_unitario: string
  piso: string
  metric: string
  hard_cap: boolean
  count: number | null
}

/** Período corrente (YYYY-MM). */
export function currentPeriod(at = new Date()): string {
  return at.toISOString().slice(0, 7)
}

export async function motorMonthlyBilling(
  tenantId: string,
  period = currentPeriod(),
): Promise<MotorBilling | null> {
  const rows = (await db.execute(sql`
    SELECT s.tier, s.activated_at, COALESCE(s.hard_cap, false) AS hard_cap,
           p.mensal, p.incluso, p.excedente_unitario, p.piso, p.metric,
           uc.count
      FROM public.subscriptions s
      JOIN public.plans p ON p.produto = s.produto AND p.tier = s.tier
      LEFT JOIN public.usage_counters uc
             ON uc.tenant_id = s.tenant_id AND uc.produto = s.produto
            AND uc.period = ${period} AND uc.metric = p.metric
     WHERE s.tenant_id = ${tenantId}::uuid AND s.produto = 'motor' AND s.status = 'active'
  `)) as unknown as Row[]

  const r = rows[0]
  if (!r) return null

  const count = r.count ?? 0
  const mensal = Number(r.mensal)
  const piso = Number(r.piso)
  const exc = Number(r.excedente_unitario)
  const mi = monthIndex(new Date(r.activated_at), new Date())
  const subtotal = invoiceLine({
    tierMensal: mensal,
    piso,
    excedenteUnitario: exc,
    count,
    incluso: r.incluso,
    monthIndex: mi,
  })

  return {
    period,
    tier: r.tier,
    metric: r.metric,
    count,
    incluso: r.incluso,
    excedenteUnitario: exc,
    excedente: overage(count, r.incluso, exc),
    mensal: mi >= 13 ? piso : mensal,
    subtotal,
    hardCap: r.hard_cap,
  }
}
