import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, getEditorConfig, getChannels, MotorError } from "@/lib/motor/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { ContentFormat } from "@/lib/motor/types"
import { AgenteForm } from "./agente-form"

export default async function AgentePage() {
  const ctx = await motorContext()

  let cfg
  let formats: ContentFormat[] = []
  let unavailable: string | null = null
  try {
    cfg = await getEditorConfig(ctx)
    // Formatos disponíveis = os de canais conectados (a automação cria orientada a eles).
    const ch = await getChannels(ctx).catch(() => null)
    const connected = new Set((ch?.channels ?? []).filter((c) => c.enabled).map((c) => c.platform))
    if (connected.has("blog") || connected.has("wordpress") || connected.has("webhook")) formats.push("blog")
    if (connected.has("linkedin")) formats.push("linkedin")
    if (connected.has("instagram")) formats.push("instagram")
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            {produtoLabel("motor")}
          </Link>{" "}
          · Agente
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Agente de criação</h1>
        <p className="text-sm text-muted-foreground">
          Personalize como o agente cria as peças — voz da marca, tom, temas, formato e modelo. Vale para a geração
          automática e a criação manual.
        </p>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : cfg ? (
        <AgenteForm cfg={cfg} formats={formats} />
      ) : null}
    </div>
  )
}
