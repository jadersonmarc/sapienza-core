import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { motorContext, exchangeChannelOAuth } from "@/lib/motor/client"

export const runtime = "nodejs"

// Callback do OAuth: valida o state (CSRF) contra o cookie, troca o code por token
// no motor (que grava credencial + expiry + refresh) e volta para Canais. O platform
// vem do cookie (sobrevive ao round-trip); o state só do provedor precisa bater.
export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const back = `${u.origin}/motor/canais`
  const code = u.searchParams.get("code") ?? ""
  const state = u.searchParams.get("state") ?? ""

  const jar = await cookies()
  const raw = jar.get("motor_oauth")?.value
  jar.delete("motor_oauth")

  if (!raw || !code || !state) return NextResponse.redirect(`${back}?oauth=erro`)
  let saved: { nonce: string; platform: string }
  try {
    saved = JSON.parse(raw)
  } catch {
    return NextResponse.redirect(`${back}?oauth=erro`)
  }
  if (state !== saved.nonce) return NextResponse.redirect(`${back}?oauth=erro`) // CSRF

  try {
    const ctx = await motorContext()
    await exchangeChannelOAuth(ctx, saved.platform, code)
    return NextResponse.redirect(`${back}?oauth=ok`)
  } catch {
    return NextResponse.redirect(`${back}?oauth=falha`)
  }
}
