"use client"

import { useActionState, useState } from "react"
import { connectChannelAction, type ActionState } from "../actions"
import type { Platform } from "@/lib/motor/types"

const initial: ActionState = {}

type Option = { platform: Platform; requires: string[] }

const SOCIAL = new Set<Platform>(["instagram", "facebook", "linkedin"])

/** Conecta um canal disponível. Canais sociais têm o caminho recomendado via OAuth
 *  (1 clique; a Sapienza renova o token sozinha); o colar-JSON fica como avançado.
 *  Blog/WordPress/webhook seguem só no manual. */
export function ConnectForm({ options }: { options: Option[] }) {
  const [state, action, pending] = useActionState(connectChannelAction, initial)
  const [selected, setSelected] = useState<Platform>(options[0]?.platform)

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Todos os canais do plano já estão conectados.</p>
  }

  const isSocial = SOCIAL.has(selected)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Conectar canal</label>
      <select
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value={selected}
        onChange={(e) => setSelected(e.target.value as Platform)}
      >
        {options.map((o) => (
          <option key={o.platform} value={o.platform}>
            {o.platform}
            {o.requires.length > 0 ? ` — requer ${o.requires.join(", ")}` : " — sem credenciais"}
          </option>
        ))}
      </select>

      {isSocial && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <a
            href={`/motor/canais/oauth?platform=${selected}`}
            className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Conectar {selected} via OAuth (recomendado)
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            1 clique, sem colar token — e a Sapienza renova a autorização sozinha. Requer o app OAuth
            configurado; se não estiver, use o modo manual abaixo.
          </p>
        </div>
      )}

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="platform" value={selected} />
        {isSocial && (
          <p className="text-xs text-muted-foreground">Ou conecte manualmente (avançado), colando o token:</p>
        )}
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
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Conectando…" : isSocial ? "Conectar manualmente" : "Conectar"}
          </button>
          {state.ok && <span className="text-sm text-primary">Canal conectado.</span>}
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        </div>
      </form>
    </div>
  )
}
