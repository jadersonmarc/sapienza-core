import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// Estado de cobrança do tenant para o banner do console. Distingue:
//  - awaiting: assinatura past_due + nenhuma fatura já paga → aguardando o 1º pagamento
//  - overdue:  past_due com histórico de pagamento → inadimplência (em atraso)
//  - canceled: todas as assinaturas canceladas
//  - none:     nada a avisar
export type BannerKind = "none" | "awaiting" | "overdue" | "canceled"
export type BannerState = { kind: BannerKind; paymentUrl?: string }

export async function accountBannerState(tenantId: string): Promise<BannerState> {
  const subs = (await db.execute(sql`
    SELECT status FROM public.subscriptions WHERE tenant_id = ${tenantId}::uuid
  `)) as unknown as { status: string }[]
  if (subs.length === 0) return { kind: "none" }

  const anyActive = subs.some((s) => s.status === "active")
  const anyPastDue = subs.some((s) => s.status === "past_due")
  if (!anyActive && subs.every((s) => s.status === "canceled")) return { kind: "canceled" }
  if (!anyPastDue) return { kind: "none" }

  const invoices = (await db.execute(sql`
    SELECT status, payment_url, paid_at FROM public.invoices
     WHERE tenant_id = ${tenantId}::uuid ORDER BY issued_at DESC
  `)) as unknown as { status: string; payment_url: string | null; paid_at: string | null }[]

  const paidEver = invoices.some((i) => i.paid_at != null)
  const unpaid = invoices.find((i) => i.status === "issued" || i.status === "overdue")
  return { kind: paidEver ? "overdue" : "awaiting", paymentUrl: unpaid?.payment_url ?? undefined }
}
