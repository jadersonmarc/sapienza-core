"use client"

import { useActionState } from "react"
import { saveConfigAction, type ActionState } from "../actions"
import type { AgentConfig } from "@/lib/margot/types"

const initial: ActionState = {}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

export function ConfigForm({ cfg }: { cfg: AgentConfig }) {
  const [state, action, pending] = useActionState(saveConfigAction, initial)

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label className={label} htmlFor="system_prompt">
          Prompt do sistema
        </label>
        <textarea id="system_prompt" name="system_prompt" rows={5} defaultValue={cfg.system_prompt} className={field} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={label} htmlFor="tone">
            Tom
          </label>
          <input id="tone" name="tone" defaultValue={cfg.tone} className={field} />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="ai_model">
            Modelo
          </label>
          <input id="ai_model" name="ai_model" defaultValue={cfg.ai_model} className={field} />
        </div>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="fallback">
          Fallback (quando a IA não responde)
        </label>
        <input id="fallback" name="fallback" defaultValue={cfg.fallback} className={field} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={label} htmlFor="max_tokens">
            Máx. tokens
          </label>
          <input
            id="max_tokens"
            name="max_tokens"
            type="number"
            min={1}
            defaultValue={cfg.max_tokens}
            className={field}
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="driver">
            Driver de WhatsApp
          </label>
          <select id="driver" name="driver" defaultValue={cfg.driver || "evolution"} className={field}>
            <option value="evolution">evolution (padrão)</option>
            <option value="meta">meta (oficial — plugável)</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="dedicated_number_confirmed"
          defaultChecked={cfg.dedicated_number_confirmed}
          className="h-4 w-4"
        />
        Número dedicado confirmado (nunca o número pessoal/principal)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        {state.ok && <span className="text-sm text-muted-foreground">Configuração salva.</span>}
      </div>
    </form>
  )
}
