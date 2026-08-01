import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { askStream, isAssistantConfigured } from "@/lib/insights/assistant"
import type { Subs } from "@/lib/insights/tools"
import { listConversations, createConversation, getMessages, appendMessage } from "@/lib/insights/store"
import { getContentStats, getTopPosts, getByConfig, motorContext } from "@/lib/motor/client"
import { getStats, margotContext } from "@/lib/margot/client"

export const runtime = "nodejs"

// POST /assistente/stream — resposta em streaming (text/plain) + persistência.
// Corpo: { conversationId?, message }. O histórico é carregado do BANCO (fonte da
// verdade), não do cliente; tenant+user vêm da SESSÃO. Cabeçalho x-conversation-id
// devolve o id (novo, quando a conversa é criada agora).
export async function POST(req: Request): Promise<Response> {
  if (!isAssistantConfigured()) return new Response("assistente indisponível", { status: 503 })
  const { active, user } = await currentContext()
  if (!active) return new Response("conta sem empresa vinculada", { status: 403 })

  const rawSubs = await tenantSubscriptions(active.id)
  const subs: Subs = {
    motor: rawSubs.some((x) => x.produto === "motor" && x.status === "active"),
    margot: rawSubs.some((x) => x.produto === "margot" && x.status === "active"),
  }
  if (!subs.motor && !subs.margot) return new Response("nenhum produto ativo", { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { conversationId?: string; message?: string }
  const message = (body.message ?? "").trim()
  if (!message) return new Response("mensagem vazia", { status: 400 })

  // Conversa: reusa a informada (se pertencer a este tenant+user) ou cria uma nova.
  let conversationId = body.conversationId ?? ""
  let history: Awaited<ReturnType<typeof getMessages>> = []
  if (conversationId) {
    history = await getMessages(conversationId, active.id, user.id)
    if (history.length === 0) conversationId = "" // não existe/não é dono → trata como nova
  }
  if (!conversationId) {
    conversationId = await createConversation(active.id, user.id, message)
  }

  // Persiste a pergunta ANTES de responder (guarda de posse embutida no append).
  await appendMessage(conversationId, active.id, user.id, "user", message)

  const deps = {
    editoraStats: async (period?: string) => getContentStats(await motorContext(), period),
    editoraTopPosts: async (period?: string, limit?: number) => getTopPosts(await motorContext(), period, limit),
    editoraByConfig: async (period?: string) => getByConfig(await motorContext(), period),
    atendenteStats: async (period?: string) => getStats(await margotContext(), period),
  }

  const stream = askStream([...history, { role: "user", content: message }], subs, deps, async (fullText) => {
    await appendMessage(conversationId, active.id, user.id, "assistant", fullText)
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      "x-conversation-id": conversationId,
    },
  })
}
