import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { askStream, isAssistantConfigured, type ChatTurn } from "@/lib/insights/assistant"
import type { Subs } from "@/lib/insights/tools"
import { getContentStats, motorContext } from "@/lib/motor/client"
import { getStats, margotContext } from "@/lib/margot/client"

export const runtime = "nodejs"

// POST /assistente/stream — resposta do assistente em streaming (text/plain). O
// histórico vem no corpo; o tenant é resolvido pela SESSÃO (nunca pelo modelo).
export async function POST(req: Request): Promise<Response> {
  if (!isAssistantConfigured()) return new Response("assistente indisponível", { status: 503 })
  const { active } = await currentContext()
  if (!active) return new Response("conta sem empresa vinculada", { status: 403 })

  const rawSubs = await tenantSubscriptions(active.id)
  const subs: Subs = {
    motor: rawSubs.some((x) => x.produto === "motor" && x.status === "active"),
    margot: rawSubs.some((x) => x.produto === "margot" && x.status === "active"),
  }
  if (!subs.motor && !subs.margot) return new Response("nenhum produto ativo", { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { history?: ChatTurn[] }
  const history = Array.isArray(body.history) ? body.history.filter((t) => t && (t.role === "user" || t.role === "assistant")) : []
  if (history.length === 0) return new Response("histórico vazio", { status: 400 })

  // deps resolvem o tenant da sessão (motorContext/margotContext) — não do modelo.
  const deps = {
    editoraStats: async (period?: string) => getContentStats(await motorContext(), period),
    atendenteStats: async () => getStats(await margotContext()),
  }

  const stream = askStream(history, subs, deps)
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  })
}
