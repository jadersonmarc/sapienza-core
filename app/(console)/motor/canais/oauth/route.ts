import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { randomBytes } from "node:crypto"
import { motorContext, getChannelOAuthUrl } from "@/lib/motor/client"

export const runtime = "nodejs"

// Início do OAuth de canal: gera um state (CSRF) em cookie httpOnly, pede a URL de
// autorização ao motor e redireciona o usuário ao provedor. Só canais sociais.
const SOCIAL = new Set(["instagram", "facebook", "linkedin"])

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const platform = u.searchParams.get("platform") ?? ""
  const back = `${u.origin}/motor/canais`
  if (!SOCIAL.has(platform)) return NextResponse.redirect(`${back}?oauth=erro`)

  const ctx = await motorContext()
  const nonce = randomBytes(16).toString("hex")
  const url = await getChannelOAuthUrl(ctx, platform, nonce)
  if (!url) return NextResponse.redirect(`${back}?oauth=indisponivel`) // app OAuth não configurado (seam)

  const jar = await cookies()
  jar.set("motor_oauth", JSON.stringify({ nonce, platform }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // sobrevive ao redirect de volta do provedor (navegação top-level)
    path: "/",
    maxAge: 600,
  })
  return NextResponse.redirect(url)
}
