"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { connectChannelAction, type ConnectState } from "../actions"
import type { ChannelStatus } from "@/lib/margot/types"

const initial: ConnectState = {}

// Conexão do WhatsApp por QR (self-serve). O assinante clica em conectar, o
// backend cria a instância + webhook e devolve o QR; aqui fazemos o polling do
// status até `connected`. O assinante nunca vê instância nem segredo.
export function ConnectPanel({
  initialStatus,
  canManage,
}: {
  initialStatus: ChannelStatus
  canManage: boolean
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(connectChannelAction, initial)
  const [status, setStatus] = useState<ChannelStatus>(initialStatus)

  // Enquanto há um QR na tela e ainda não conectou, faz polling do status.
  useEffect(() => {
    if (status.connected || !state.qr) return
    const id = setInterval(async () => {
      try {
        const r = await fetch("/margot/channel-status", { cache: "no-store" })
        if (!r.ok) return
        const s = (await r.json()) as ChannelStatus
        setStatus(s)
        if (s.connected) {
          clearInterval(id)
          router.refresh() // recarrega a página: a config do agente passa a aparecer
        }
      } catch {
        /* mantém tentando */
      }
    }, 3000)
    return () => clearInterval(id)
  }, [state.qr, status.connected, router])

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Conexão do WhatsApp</h2>
        <p className="text-xs text-muted-foreground">
          Use um número <strong>dedicado</strong> para o atendimento — nunca o WhatsApp pessoal do
          responsável.
        </p>
      </div>

      {status.connected ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            ✓
          </span>
          <span>
            WhatsApp conectado{status.number ? ` — ${status.number}` : ""}.
          </span>
        </div>
      ) : !canManage ? (
        <p className="text-sm text-muted-foreground">
          O WhatsApp ainda não está conectado. Um administrador da conta precisa conectá-lo.
        </p>
      ) : (
        <div className="space-y-4">
          {!state.qr && (
            <form action={action}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {pending ? "Gerando QR…" : "Conectar WhatsApp"}
              </button>
            </form>
          )}
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.qr && (
            <div className="space-y-2">
              <p className="text-sm">
                Abra o WhatsApp do número dedicado → <strong>Aparelhos conectados</strong> →{" "}
                <strong>Conectar um aparelho</strong> → escaneie o código:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.qr}
                alt="QR code para conectar o WhatsApp"
                className="h-56 w-56 rounded-lg border border-border bg-white p-2"
              />
              <p className="text-xs text-muted-foreground">
                Aguardando a leitura… ({status.state || "connecting"})
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
