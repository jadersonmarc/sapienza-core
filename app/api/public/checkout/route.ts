import { secretMatches } from "@/lib/auth/webhook"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// POST /api/public/checkout — LEGADO. A assinatura passou a ser no console
// (/assinar): o cartão é digitado na nossa página e a recorrência entra pelo
// Asaas. Este endereço server-to-server não recebe dados de cartão; mantido só
// com o gate de segredo para não quebrar integrações antigas — responde 410.
export async function POST(req: Request): Promise<Response> {
  const expected = process.env.CHECKOUT_SECRET
  if (!expected || !secretMatches(req.headers.get("x-checkout-secret"), expected)) {
    return json(401, { error: "unauthorized" })
  }
  return json(410, { error: "checkout movido para o console: /assinar" })
}
