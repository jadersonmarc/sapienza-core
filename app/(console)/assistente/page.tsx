import { Eyebrow } from "@/components/eyebrow"
import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { isAssistantConfigured } from "@/lib/insights/assistant"
import { Chat } from "./chat"

// Assistente conversacional de métricas — responde sobre Editora/Atendente via
// tool-use tipado (nunca SQL). Só disponível se o tenant assina algum produto.
export default async function AssistentePage() {
  const { active } = await currentContext()
  const subs = active ? await tenantSubscriptions(active.id) : []
  const motor = subs.some((x) => x.produto === "motor" && x.status === "active")
  const margot = subs.some((x) => x.produto === "margot" && x.status === "active")
  const enabled = isAssistantConfigured()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="space-y-2">
        <Eyebrow>Assistente</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Assistente de métricas</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte em linguagem natural sobre o desempenho — conteúdo e atendimento. O assistente lê
          os números direto dos relatórios; não inventa métrica.
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
        <Chat motor={motor} margot={margot} />
      )}
    </div>
  )
}
