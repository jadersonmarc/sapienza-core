import { secretMatches } from "@/lib/auth/webhook"
import { checkoutSignup, CheckoutError } from "@/lib/signup/checkout"
import type { ProdutoId } from "@/lib/pricing/load"

export const runtime = "nodejs"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// POST /api/public/checkout — assinatura self-service vinda do site (spa-sapienza),
// server-to-server. Fora do matcher do middleware (sem sessão); protegido pelo
// segredo compartilhado com o site (CHECKOUT_SECRET) para só ele poder chamar.
export async function POST(req: Request): Promise<Response> {
  const expected = process.env.CHECKOUT_SECRET
  if (!expected || !secretMatches(req.headers.get("x-checkout-secret"), expected)) {
    return json(401, { error: "unauthorized" })
  }

  const b = (await req.json().catch(() => null)) as {
    name?: string
    taxId?: string
    email?: string
    password?: string
    produto?: string
    tier?: string
  } | null
  if (!b) return json(400, { error: "invalid payload" })

  try {
    const { paymentUrl } = await checkoutSignup({
      name: String(b.name ?? ""),
      taxId: String(b.taxId ?? ""),
      email: String(b.email ?? ""),
      password: String(b.password ?? ""),
      produto: String(b.produto ?? "") as ProdutoId,
      tier: String(b.tier ?? ""),
    })
    return json(200, { paymentUrl })
  } catch (e) {
    if (e instanceof CheckoutError) return json(422, { error: e.message })
    return json(500, { error: String(e instanceof Error ? e.message : e) })
  }
}
