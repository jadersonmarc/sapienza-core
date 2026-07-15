import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, getConfig, MargotError } from "@/lib/margot/client"
import type { AgentConfig } from "@/lib/margot/types"
import { ConfigForm } from "./config-form"

export default async function ConfiguracaoPage() {
  const ctx = await margotContext()

  let cfg: AgentConfig | null = null
  let unavailable: string | null = null
  try {
    cfg = await getConfig(ctx)
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
        <p className="text-sm text-muted-foreground">
          {unavailable.startsWith("404")
            ? "Canal ainda não provisionado para este tenant."
            : `Serviço indisponível (${unavailable}).`}
        </p>
      ) : (
        cfg && <ConfigForm cfg={cfg} />
      )}
    </div>
  )
}
