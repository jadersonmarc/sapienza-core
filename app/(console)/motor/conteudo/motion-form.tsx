"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import { createMotionAction, type ActionState } from "../actions"

const initial: ActionState = {}

// Peça em movimento (vídeo). A Margot escolhe o formato animado e escreve o conteúdo
// a partir do brief; renderiza em vídeo (segundo plano) e entra em aprovação.
export function MotionForm() {
  const [state, action, pending] = useActionState(createMotionAction, initial)
  const fileRef = useRef<HTMLInputElement>(null)
  const [imageUrl, setImageUrl] = useState("")
  const [uploading, startUpload] = useTransition()
  const [imgErr, setImgErr] = useState<string | null>(null)

  function onPickImage() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setImgErr(null)
    startUpload(async () => {
      const fd = new FormData()
      fd.set("file", file)
      const res = await fetch("/motor/midia/api/upload", { method: "POST", body: fd })
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !body.url) {
        setImgErr(body.error ?? "falha ao enviar a imagem")
        return
      }
      setImageUrl(body.url)
    })
  }

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
      {/* Imagem de fundo opcional (item 7). Reusa o upload de mídia (bucket-por-tenant,
          validação, erro pt-BR). Sem imagem, a peça renderiza como hoje. */}
      <input type="hidden" name="imageUrl" value={imageUrl} />
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">Imagem de fundo (opcional):</span>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="text-xs" />
        <button
          type="button"
          onClick={onPickImage}
          disabled={uploading}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {uploading ? "Enviando…" : "Enviar imagem"}
        </button>
        {imageUrl && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            ✓ imagem anexada
            <button type="button" onClick={() => setImageUrl("")} className="text-destructive hover:underline">
              remover
            </button>
          </span>
        )}
        {imgErr && <span className="text-xs text-destructive">{imgErr}</span>}
      </div>

      {/* Estilo da legenda (item 8a) — restrito aos tokens da marca. "Padrão da marca"
          herda o default do tenant (Brand Kit); render idêntico ao atual quando nada é
          escolhido. Tamanho e posição não mudam aqui (layout dos presets é fixo). */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">Legenda:</span>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Fonte:</span>
          <select name="captionFont" defaultValue="" className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="">Padrão da marca</option>
            <option value="display">Display</option>
            <option value="sans">Sans</option>
            <option value="mono">Mono</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Cor:</span>
          <select name="captionColor" defaultValue="" className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="">Padrão da marca</option>
            <option value="default">Padrão</option>
            <option value="accent">Acento</option>
            <option value="signal">Destaque</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Realce:</span>
          <select name="captionHighlight" defaultValue="" className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="">Padrão da marca</option>
            <option value="accent">Acento</option>
            <option value="signal">Destaque</option>
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
