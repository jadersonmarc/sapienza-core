import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, getConfig, channelStatus, MargotError } from "@/lib/margot/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { AgentConfig, ChannelStatus } from "@/lib/margot/types"
import { ConfigForm } from "./config-form"
import { ConnectPanel } from "./connect-panel"
import { BindPanel } from "./bind-panel"

export default async function ConfiguracaoPage() {
  const ctx = await margotContext()
  const canManage = ctx.role === "owner" || ctx.role === "admin"

  let status: ChannelStatus = { connected: false, state: "none", number: "" }
  let cfg: AgentConfig | null = null
  let statusWarn: string | null = null

  // Status do canal NÃO pode bloquear a tela: se a instância foi removida no
  // Evolution (ou o serviço oscilou), ainda queremos mostrar o reconectar.
  try {
    status = await channelStatus(ctx)
  } catch (e) {
    statusWarn = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }
  // getConfig 404 antes do canal existir — o agente só se configura depois de conectar.
  try {
    cfg = await getConfig(ctx)
  } catch (e) {
    if (!(e instanceof MargotError && e.status === 404)) {
      statusWarn = statusWarn ?? (e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível")
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/margot" className="hover:underline">
            {produtoLabel("margot")}
          </Link>{" "}
          · Configuração
        </Eyebrow>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Configurar agente</h1>
          <Link href="/margot/configuracao/guia" className="text-sm text-primary hover:underline">
            Como configurar a IA →
          </Link>
        </div>
      </div>

      <div className="space-y-8">
        {statusWarn && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Não foi possível ler o status do canal ({statusWarn}). Se você removeu a instância no Evolution,
            reconecte abaixo para recriá-la.
          </p>
        )}

        <ConnectPanel initialStatus={status} canManage={canManage} />

        {ctx.isSuperadmin && <BindPanel />}

        {/* A configuração do agente aparece assim que o canal existe (após conectar). */}
        {cfg ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Comportamento do agente</h2>
            <ConfigForm cfg={cfg} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Conecte o WhatsApp acima para configurar o comportamento do agente.
          </p>
        )}
      </div>
    </div>
  )
}
