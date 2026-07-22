import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, getConfig, channelStatus, MargotError } from "@/lib/margot/client"
import type { AgentConfig, ChannelStatus } from "@/lib/margot/types"
import { ConfigForm } from "./config-form"
import { ConnectPanel } from "./connect-panel"

export default async function ConfiguracaoPage() {
  const ctx = await margotContext()
  const canManage = ctx.role === "owner" || ctx.role === "admin"

  let status: ChannelStatus = { connected: false, state: "none", number: "" }
  let cfg: AgentConfig | null = null
  let unavailable: string | null = null
  try {
    status = await channelStatus(ctx)
    // getConfig 404 antes do canal existir — o agente só se configura depois de conectar.
    try {
      cfg = await getConfig(ctx)
    } catch (e) {
      if (!(e instanceof MargotError && e.status === 404)) throw e
    }
  } catch (e) {
    unavailable = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/margot" className="hover:underline">
            Margot
          </Link>{" "}
          · Configuração
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Configurar agente</h1>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : (
        <div className="space-y-8">
          <ConnectPanel initialStatus={status} canManage={canManage} />

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
      )}
    </div>
  )
}
