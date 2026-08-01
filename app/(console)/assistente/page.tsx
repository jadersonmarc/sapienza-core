import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { isAssistantConfigured, type ChatTurn } from "@/lib/insights/assistant"
import { listConversations, getMessages, type Conversation } from "@/lib/insights/store"
import { Chat } from "./chat"

// Assistente conversacional de métricas — tool-use tipado (nunca SQL). Histórico
// persistido por tenant×usuário; ?c=<id> abre uma conversa.
export default async function AssistentePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { active, user } = await currentContext()
  const subs = active ? await tenantSubscriptions(active.id) : []
  const motor = subs.some((x) => x.produto === "motor" && x.status === "active")
  const margot = subs.some((x) => x.produto === "margot" && x.status === "active")
  const enabled = isAssistantConfigured()
  const { c } = await searchParams

  let conversations: Conversation[] = []
  let messages: ChatTurn[] = []
  let activeConvId = ""
  if (enabled && active && (motor || margot)) {
    conversations = await listConversations(active.id, user.id)
    if (c) {
      messages = await getMessages(c, active.id, user.id)
      if (messages.length > 0) activeConvId = c
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="space-y-2">
        <Eyebrow>Assistente</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Assistente de métricas</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte em linguagem natural sobre o desempenho — conteúdo e atendimento. Lê os números
          direto dos relatórios; não inventa métrica.
        </p>
      </div>

      {!enabled ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Assistente indisponível — falta configurar <span className="font-mono">ANTHROPIC_API_KEY</span> no serviço.
        </p>
      ) : !motor && !margot ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Nenhum produto ativo para analisar. Assine a Margot Editora ou Atendente para usar o assistente.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <aside className="space-y-2">
            <Link
              href="/assistente"
              className="block rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
            >
              + Nova conversa
            </Link>
            <ul className="space-y-1">
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <Link
                    href={`/assistente?c=${conv.id}`}
                    className={`block truncate rounded-lg px-3 py-2 text-sm hover:bg-muted ${
                      conv.id === activeConvId ? "bg-muted font-medium" : ""
                    }`}
                    title={conv.title}
                  >
                    {conv.title || "Conversa"}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
          <Chat motor={motor} margot={margot} conversationId={activeConvId || null} initialMessages={messages} />
        </div>
      )}
    </div>
  )
}
