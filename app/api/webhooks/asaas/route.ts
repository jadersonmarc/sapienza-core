import { secretMatches } from "@/lib/auth/webhook"
import { applyPaymentReceived, applyPaymentOverdue } from "@/lib/billing/reconcile"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// POST /api/webhooks/asaas — eventos de pagamento do Asaas. Fora do matcher do
// middleware (não tem sessão); protegido pelo token que configuramos no painel do
// Asaas e que ele envia no header `asaas-access-token`.
//
// PAYMENT_RECEIVED/CONFIRMED → fatura paga + reativa se estava past_due.
// PAYMENT_OVERDUE            → fatura overdue + assinaturas em past_due (bloqueia).
export async function POST(req: Request): Promise<Response> {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected || !secretMatches(req.headers.get("asaas-access-token"), expected)) {
    return json(401, { error: "unauthorized" })
  }

  const body = (await req.json().catch(() => null)) as {
    event?: string
    payment?: { id?: string; externalReference?: string }
  } | null
  if (!body?.event) return json(400, { error: "invalid payload" })

  const chargeId = body.payment?.id ?? null
  const externalRef = body.payment?.externalReference ?? null

  try {
    switch (body.event) {
      case "PAYMENT_RECEIVED":
      case "PAYMENT_CONFIRMED":
        await applyPaymentReceived(chargeId, externalRef)
        break
      case "PAYMENT_OVERDUE":
        await applyPaymentOverdue(chargeId, externalRef)
        break
      // outros eventos: ack sem ação (não somos donos de todos os estados).
    }
  } catch (e) {
    return json(500, { error: String(e instanceof Error ? e.message : e) })
  }
  return json(200, { ok: true })
}
