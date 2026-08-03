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
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Canal:</span>
          <select name="channel" defaultValue="instagram" className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="instagram">Instagram</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Estilo:</span>
          <select name="archetype" defaultValue="" className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="">Automático</option>
            <option value="highlight">Destaque</option>
            <option value="list">Lista / passos</option>
            <option value="myth_fact">Mito × verdade</option>
            <option value="before_after">Antes / depois</option>
            <option value="qa">Pergunta → resposta</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Trilha:</span>
          <select name="audio" defaultValue="" className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="">Automático</option>
            <option value="none">Sem trilha</option>
            <option value="calm">Sóbria</option>
            <option value="upbeat">Dinâmica</option>
            <option value="bold">Impactante</option>
          </select>
        </label>
      </div>
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
