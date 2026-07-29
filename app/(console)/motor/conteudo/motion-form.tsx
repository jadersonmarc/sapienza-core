"use client"

import { useActionState } from "react"
import { createMotionAction, type ActionState } from "../actions"

const initial: ActionState = {}

// Peça em movimento (vídeo). A Margot escolhe o formato animado e escreve o conteúdo
// a partir do brief; renderiza em vídeo (segundo plano) e entra em aprovação.
export function MotionForm() {
  const [state, action, pending] = useActionState(createMotionAction, initial)
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Peça em movimento (vídeo)</label>
      <span className="text-xs text-muted-foreground">
        A Margot escolhe o formato animado adequado e escreve o conteúdo a partir do seu brief.
        Renderiza em vídeo e entra na janela de aprovação.
      </span>
      <textarea
        name="prompt"
        required
        rows={2}
        placeholder="Tema da peça (ex.: convite para o webinar de automação)…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Gerando…" : "Gerar peça em movimento"}
        </button>
        {pending && <span className="text-sm text-muted-foreground">gerando + renderizando — pode levar alguns minutos</span>}
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  )
}
