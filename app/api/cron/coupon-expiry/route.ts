import { runCouponExpiry } from "@/lib/coupons/expire"
import { cronAuthorized } from "@/lib/auth/webhook"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// POST /api/cron/coupon-expiry — varre resgates de cupom com fim vencido, devolve
// a recorrência do Asaas ao preço de tabela e encerra o resgate. Idempotente
// (status='active' guarda). Agendar 1×/dia. Protegido por x-webhook-secret.
export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return json(401, { error: "unauthorized" })
  const result = await runCouponExpiry()
  return json(200, result)
}
