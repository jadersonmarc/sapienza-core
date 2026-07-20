import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, getConfig, MargotError } from "@/lib/margot/client"
import type { AgentConfig } from "@/lib/margot/types"
import { ConfigForm } from "./config-form"
import { ChannelForm } from "./channel-form"

export default async function ConfiguracaoPage() {
  const ctx = await margotContext()

  let cfg: AgentConfig | null = null
  let noChannel = false
  let unavailable: string | null = null
  try {
    cfg = await getConfig(ctx)
  } catch (e) {
    // 404 = canal ainda não vinculado (estado de onboarding), não indisponibilidade.
    if (e instanceof MargotError && e.status === 404) noChannel = true
    else unavailable = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
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
          {/* Vínculo do canal — só superadmin Sapienza. Cria (noChannel) ou edita. */}
          {ctx.isSuperadmin ? (
            <ChannelForm cfg={cfg} />
          ) : (
            noChannel && (
              <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                Canal ainda não vinculado pela Sapienza. Assim que o WhatsApp for conectado, a
                configuração do agente fica disponível aqui.
              </p>
            )
          )}

          {/* Configuração do agente — owner/admin. Só quando o canal já existe. */}
          {cfg ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Comportamento do agente</h2>
              <ConfigForm cfg={cfg} />
            </div>
          ) : (
            ctx.isSuperadmin &&
            noChannel && (
              <p className="text-sm text-muted-foreground">
                Vincule o canal acima para liberar a configuração do agente.
              </p>
            )
          )}
        </div>
      )}
    </div>
  )
}
