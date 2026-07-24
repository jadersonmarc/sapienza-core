"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { connectChannelAction, disconnectChannelAction, type ActionState } from "../actions"
import type { Platform } from "@/lib/motor/types"

const initial: ActionState = {}

/** Card de um canal conectado: trocar de conta (reenvia credenciais, sobrescreve o
 *  token) ou desconectar (libera o slot do plano). Espelha o "reconectar" do
 *  Atendente. A desconexão pede confirmação porque zera a credencial guardada. */
export function ChannelCard({ platform, enabled }: { platform: Platform; enabled: boolean }) {
  const [swapState, swapAction, swapping] = useActionState(connectChannelAction, initial)
  const [offState, offAction, disconnecting] = useActionState(disconnectChannelAction, initial)
  const [showSwap, setShowSwap] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{platform}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {enabled ? "ativo" : "inativo"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setShowSwap((v) => !v)}
          className="text-primary hover:underline"
        >
          {showSwap ? "Cancelar" : "Trocar conta / reconectar"}
        </button>
        {confirming ? (
          <form action={offAction} className="flex items-center gap-2">
            <input type="hidden" name="platform" value={platform} />
            <span className="text-muted-foreground">Desconectar?</span>
            <button
              type="submit"
              disabled={disconnecting}
              className="rounded bg-destructive px-2 py-0.5 font-medium text-destructive-foreground disabled:opacity-50"
            >
              {disconnecting ? "Desconectando…" : "Confirmar"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-muted-foreground hover:underline">
              Não
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-destructive hover:underline">
            Desconectar
          </button>
        )}
        {offState.error && <span className="text-destructive">{offState.error}</span>}
      </div>

      {showSwap && (
        <form action={swapAction} className="flex flex-col gap-2 border-t border-border pt-3">
          <input type="hidden" name="platform" value={platform} />
          <label className="text-xs text-muted-foreground">
            Cole as novas credenciais para trocar a conta ({platform}). Onde pegar?{" "}
            <Link href="/motor/canais/guia" className="text-primary hover:underline">
              veja o guia
            </Link>
            .
          </label>
          <textarea
            name="credentials"
            rows={3}
            placeholder="Credenciais do canal (JSON ou token)."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={swapping}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {swapping ? "Salvando…" : "Salvar nova conta"}
            </button>
            {swapState.ok && <span className="text-xs text-primary">Conta atualizada.</span>}
            {swapState.error && <span className="text-xs text-destructive">{swapState.error}</span>}
          </div>
        </form>
      )}
    </li>
  )
}
