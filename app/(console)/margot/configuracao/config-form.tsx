"use client"

import { useActionState } from "react"
import { saveConfigAction, type ActionState } from "../actions"
import type { AgentConfig } from "@/lib/margot/types"

const initial: ActionState = {}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

// Modelos oferecidos. O id interno segue o que o Margot (Go) passa à Anthropic;
// a pessoa escolhe entre o rápido/econômico e o mais capaz.
const MODELOS = [
  { value: "claude-haiku-4-5", label: "Haiku — rápido e econômico (padrão)" },
  { value: "claude-sonnet-5", label: "Sonnet — mais capaz, respostas mais ricas" },
]

export function ConfigForm({ cfg }: { cfg: AgentConfig }) {
  const [state, action, pending] = useActionState(saveConfigAction, initial)
  const modelDefault = cfg.ai_model.includes("sonnet") ? "claude-sonnet-5" : "claude-haiku-4-5"

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
          <select id="ai_model" name="ai_model" defaultValue={modelDefault} className={field}>
            {MODELOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="fallback">
          Fallback (quando a IA não responde)
        </label>
        <input id="fallback" name="fallback" defaultValue={cfg.fallback} className={field} />
      </div>

      <div className="space-y-1 sm:max-w-[50%]">
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
