import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, getChannels, getSetup, MotorError } from "@/lib/motor/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { ChannelsStatus, SetupStatus } from "@/lib/motor/types"
import { ConnectForm } from "./connect-form"
import { ChannelCard } from "./channel-card"

const OAUTH_MSG: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Canal conectado via OAuth — a Sapienza renova o token sozinha." },
  falha: { ok: false, text: "Não foi possível concluir a conexão via OAuth. Tente de novo." },
  erro: { ok: false, text: "Falha na autorização (sessão/estado inválido). Tente de novo." },
  indisponivel: { ok: false, text: "Conexão via OAuth indisponível agora — use o modo manual." },
}

export default async function CanaisPage({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  const ctx = await motorContext()
  const oauth = OAUTH_MSG[(await searchParams).oauth ?? ""]

  let channels: ChannelsStatus | null = null
  let setup: SetupStatus | null = null
  let unavailable: string | null = null
  try {
    ;[channels, setup] = await Promise.all([getChannels(ctx), getSetup(ctx)])
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            {produtoLabel("motor")}
          </Link>{" "}
          · Canais
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Canais de publicação</h1>
        {channels && (
          <p className="text-sm text-muted-foreground">
            {channels.tier === "scale"
              ? "Seu plano inclui todos os canais disponíveis."
              : `${channels.used ?? 0} de ${channels.limit} canais sociais em uso. Blog e webhook não contam.`}
          </p>
        )}
      </div>

      {oauth && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            oauth.ok ? "border-primary/40 bg-primary/10 text-foreground" : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {oauth.text}
        </div>
      )}

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : (
        <>
          {channels && channels.channels.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {channels.channels.map((c) => (
                <ChannelCard key={c.platform} platform={c.platform} enabled={c.enabled} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum canal conectado ainda.</p>
          )}

          {setup && <ConnectForm options={setup.available} />}

          <p className="text-sm text-muted-foreground">
            Não sabe onde pegar os tokens?{" "}
            <Link href="/motor/canais/guia" className="text-primary hover:underline">
              Veja o guia de cada canal →
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
