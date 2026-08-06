import { runRecurrenceReconciliation } from "@/lib/billing/reconcile-recurrence"
import { cronAuthorized } from "@/lib/auth/webhook"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// POST /api/cron/reconcile-recurrence — recompõe o valor da recorrência do Asaas
// quando muda no aniversário: Degrau 13 (anual, mês>=13 → piso) e fim do desconto
// do cupom (termo da assinatura). Idempotente (só atualiza quando diverge do
// recurrence_value guardado). Agendar 1×/dia. Protegido por x-webhook-secret.
export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return json(401, { error: "unauthorized" })
  const result = await runRecurrenceReconciliation()
  return json(200, result)
}
