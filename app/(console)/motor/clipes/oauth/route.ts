import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { randomBytes } from "node:crypto"
import { motorContext, getClipConnectorUrl } from "@/lib/motor/client"

export const runtime = "nodejs"

// Início do OAuth de um conector de nuvem: gera state (CSRF) em cookie httpOnly, pede
// a URL de autorização ao motor e redireciona o usuário ao provedor.
const PROVIDERS = new Set(["gdrive", "dropbox"])

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const provider = u.searchParams.get("provider") ?? ""
  const back = `${u.origin}/motor/clipes`
  if (!PROVIDERS.has(provider)) return NextResponse.redirect(`${back}?oauth=erro`)

  const ctx = await motorContext()
  const nonce = randomBytes(16).toString("hex")
  const url = await getClipConnectorUrl(ctx, provider, nonce)
  if (!url) return NextResponse.redirect(`${back}?oauth=indisponivel`)

  const jar = await cookies()
  jar.set("clip_oauth", JSON.stringify({ nonce, provider }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })
  return NextResponse.redirect(url)
}
