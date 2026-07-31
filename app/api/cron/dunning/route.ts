import { runDunning } from "@/lib/billing/dunning"
import { cronAuthorized } from "@/lib/auth/webhook"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// POST /api/cron/dunning — inadimplência. Varre faturas vencidas e avança o
// dunning (e-mails escalonados → bloqueio no dia 3 → cancelamento no dia 15).
// Idempotente (dunning_stage). Agendar 1×/dia. Protegido por x-webhook-secret.
export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return json(401, { error: "unauthorized" })
  const result = await runDunning()
  return json(200, result)
}
