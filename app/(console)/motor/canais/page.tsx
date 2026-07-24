import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, getChannels, getSetup, MotorError } from "@/lib/motor/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { ChannelsStatus, SetupStatus } from "@/lib/motor/types"
import { ConnectForm } from "./connect-form"
import { ChannelCard } from "./channel-card"

export default async function CanaisPage() {
  const ctx = await motorContext()

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
            {channels.channels.length}/{channels.limit} canal(is) do plano em uso.
          </p>
        )}
      </div>

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
