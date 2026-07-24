"use client"

import { useActionState, useState } from "react"
import { createContentAction, type ActionState } from "../actions"
import type { ContentFormat } from "@/lib/motor/types"

const initial: ActionState = {}

const FORMAT_LABEL: Record<ContentFormat, string> = {
  blog: "Blog (artigo)",
  linkedin: "Post de LinkedIn",
  instagram: "Post de Instagram",
}

/** Cria uma peça no formato do canal. Só recebe formatos de canais CONECTADOS:
 *  um só → sem dropdown (a peça já nasce daquele canal); vários → escolhe. */
export function NewContentForm({ formats }: { formats: ContentFormat[] }) {
  const [state, action, pending] = useActionState(createContentAction, initial)
  const [format, setFormat] = useState<ContentFormat>(formats[0] ?? "blog")
  const single = formats.length <= 1

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Nova peça</label>

      {single ? (
        <>
          <input type="hidden" name="format" value={formats[0] ?? "blog"} />
          <span className="text-xs text-muted-foreground">
            {formats[0] === "blog" ? "Artigo de blog, com SEO." : `${FORMAT_LABEL[formats[0] ?? "blog"]} — post no tom do canal.`}
          </span>
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            name="format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ContentFormat)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {formats.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {format === "blog" ? "Artigo longo, com SEO." : "Post curto, no tom do canal."}
          </span>
        </div>
      )}

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
