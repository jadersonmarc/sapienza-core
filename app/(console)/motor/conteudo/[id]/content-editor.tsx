"use client"

import { useActionState } from "react"
import { saveContentAction, type ActionState } from "../../actions"

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm"

// Edição manual da peça: título, resumo e corpo (markdown). Salvar cria uma nova
// revisão e a torna a atual (PUT /content/{id} no Motor).
export function ContentEditor({
  id,
  title,
  bodyMarkdown,
  excerpt,
  isSocial = false,
}: {
  id: string
  title: string
  bodyMarkdown: string
  excerpt: string
  isSocial?: boolean
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveContentAction, {})

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{isSocial ? "Título (interno)" : "Título"}</span>
        <input name="title" defaultValue={title} required className={field} />
      </label>
      {isSocial ? (
        // Post social não tem resumo/SEO — preserva o valor existente sem poluir a UI.
        <input type="hidden" name="excerpt" defaultValue={excerpt} />
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Resumo (opcional)</span>
          <input name="excerpt" defaultValue={excerpt} className={field} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{isSocial ? "Texto do post" : "Corpo (markdown)"}</span>
        <textarea
          name="bodyMarkdown"
          defaultValue={bodyMarkdown}
          rows={isSocial ? 8 : 16}
          required
          className={`${field} font-mono`}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar edição"}
        </button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        {state.ok && <span className="text-sm text-muted-foreground">Nova revisão salva.</span>}
      </div>
    </form>
  )
}
