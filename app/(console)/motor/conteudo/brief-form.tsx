"use client"

import { useActionState } from "react"
import { createFromBriefAction, type ActionState } from "../actions"

const initial: ActionState = {}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"

// Produtor por brief (separado do "gerar rascunho" simples): objetivo + pontos-chave
// + público + tom + pilar → o Motor gera a peça via generateFromBrief.
export function BriefForm() {
  const [state, action, pending] = useActionState(createFromBriefAction, initial)

  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Nova peça por brief detalhado</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Objetivo / expectativa *</label>
          <textarea name="objetivo" required rows={2} placeholder="Ex.: apresentar o serviço de automação de prazos para advogados" className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Pontos-chave</label>
          <textarea name="pontosChave" rows={2} placeholder="Um por linha, se ajudar" className={field} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Público</label>
            <input name="publico" placeholder="Ex.: advogados de PME" className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Tom</label>
            <input name="tom" placeholder="Ex.: direto e prático" className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Pilar</label>
            <input name="pilar" placeholder="Ex.: pme" className={field} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Gerando…" : "Gerar do brief"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        </div>
      </form>
    </details>
  )
}
