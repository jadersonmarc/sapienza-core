import { dispatchAll } from "@/lib/email/consumer"
import { cronAuthorized } from "@/lib/auth/webhook"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// POST /api/cron/email-dispatch — drena o event_outbox e envia os e-mails
// transacionais (consumer `mailer`). Idempotente (dedupe em email_deliveries).
// Protegido por x-webhook-secret. Agendar a cada poucos minutos.
export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return json(401, { error: "unauthorized" })
  const sent = await dispatchAll()
  return json(200, { sent })
}
