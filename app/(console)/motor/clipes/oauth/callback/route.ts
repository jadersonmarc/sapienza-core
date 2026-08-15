import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { motorContext, exchangeClipConnector } from "@/lib/motor/client"

export const runtime = "nodejs"

// Callback do OAuth do conector: valida o state (CSRF) contra o cookie, troca o code
// por token no motor (que grava cifrado) e volta para os Clipes.
export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const back = `${u.origin}/motor/clipes`
  const code = u.searchParams.get("code") ?? ""
  const state = u.searchParams.get("state") ?? ""

  const jar = await cookies()
  const raw = jar.get("clip_oauth")?.value
  jar.delete("clip_oauth")

  if (!raw || !code || !state) return NextResponse.redirect(`${back}?oauth=erro`)
  let saved: { nonce: string; provider: string }
  try {
    saved = JSON.parse(raw)
  } catch {
    return NextResponse.redirect(`${back}?oauth=erro`)
  }
  if (state !== saved.nonce) return NextResponse.redirect(`${back}?oauth=erro`)

  try {
    const ctx = await motorContext()
    await exchangeClipConnector(ctx, saved.provider, code)
    return NextResponse.redirect(`${back}?oauth=ok`)
  } catch {
    return NextResponse.redirect(`${back}?oauth=falha`)
  }
}
