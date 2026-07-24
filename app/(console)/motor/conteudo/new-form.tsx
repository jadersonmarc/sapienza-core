"use client"

import { useActionState, useState } from "react"
import { createContentAction, type ActionState } from "../actions"
import type { ContentFormat } from "@/lib/motor/types"

const initial: ActionState = {}

/** Cria uma peça a partir de um tema, no FORMATO do canal escolhido — o Motor gera
 *  o rascunho já no formato certo (blog = artigo com SEO; linkedin/instagram = post
 *  curto no tom do canal). O formato começa no canal social conectado, quando há um. */
export function NewContentForm({ socialChannels = [] }: { socialChannels?: ("linkedin" | "instagram")[] }) {
  const [state, action, pending] = useActionState(createContentAction, initial)
  const [format, setFormat] = useState<ContentFormat>(socialChannels[0] ?? "blog")

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Nova peça</label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          name="format"
          value={format}
          onChange={(e) => setFormat(e.target.value as ContentFormat)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="blog">Blog (artigo)</option>
          <option value="linkedin">
            Post de LinkedIn{socialChannels.includes("linkedin") ? " (conectado)" : ""}
          </option>
          <option value="instagram">
            Post de Instagram{socialChannels.includes("instagram") ? " (conectado)" : ""}
          </option>
        </select>
        <span className="text-xs text-muted-foreground">
          {format === "blog" ? "Artigo longo, com SEO." : "Post curto, no tom do canal."}
        </span>
      </div>

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
