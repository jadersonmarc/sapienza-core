"use client"

import { useActionState } from "react"
import { createContentAction, type ActionState } from "../actions"

const initial: ActionState = {}

/** Cria uma peça a partir de um tema (o Motor gera o rascunho via IA/seam). */
export function NewContentForm() {
  const [state, action, pending] = useActionState(createContentAction, initial)

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Nova peça</label>
      <textarea
        name="prompt"
        required
        rows={2}
        placeholder="Tema da peça (ex.: 5 sinais de que sua PME precisa de um CRM)…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Gerando…" : "Gerar rascunho"}
        </button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  )
}
