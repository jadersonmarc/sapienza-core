"use client"

import { useActionState } from "react"
import { connectChannelAction, type ActionState } from "../actions"
import type { Platform } from "@/lib/motor/types"

const initial: ActionState = {}

type Option = { platform: Platform; requires: string[] }

/** Conecta um canal disponível. Credenciais viajam como um blob opaco (o Motor
 *  cifra por tenant); o blog não exige credenciais. */
export function ConnectForm({ options }: { options: Option[] }) {
  const [state, action, pending] = useActionState(connectChannelAction, initial)

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Todos os canais do plano já estão conectados.</p>
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Conectar canal</label>
      <select
        name="platform"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        defaultValue={options[0].platform}
      >
        {options.map((o) => (
          <option key={o.platform} value={o.platform}>
            {o.platform}
            {o.requires.length > 0 ? ` — requer ${o.requires.join(", ")}` : " — sem credenciais"}
          </option>
        ))}
      </select>
      <textarea
        name="credentials"
        rows={3}
        placeholder="Credenciais do canal (JSON ou token). Deixe vazio para o blog."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Conectando…" : "Conectar"}
        </button>
        {state.ok && <span className="text-sm text-primary">Canal conectado.</span>}
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  )
}
