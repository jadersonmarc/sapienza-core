"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClipFromUrlAction, type ActionState } from "../actions"

const initial: ActionState = {}

/** Importa um vídeo por URL (server action) ou por upload (proxy /motor/clipes/upload).
 *  Enquanto houver vídeo processando, atualiza a página sozinho a cada 5s. */
export function ClipImportPanel({ exhausted, autoRefresh }: { exhausted: boolean; autoRefresh: boolean }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createClipFromUrlAction, initial)
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, startUpload] = useTransition()
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  // Polling leve enquanto algo processa (a esteira é assíncrona).
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
  }, [autoRefresh, router])

  function onUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploadErr(null)
    startUpload(async () => {
      const fd = new FormData()
      fd.set("file", file)
      const res = await fetch("/motor/clipes/upload", { method: "POST", body: fd })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setUploadErr(body.error ?? "falha ao enviar o arquivo")
        return
      }
      if (fileRef.current) fileRef.current.value = ""
      router.refresh()
    })
  }

  const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      {exhausted && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Sua cota de horas de vídeo do mês acabou. Faça upgrade para processar mais vídeo.
        </div>
      )}

      <form ref={formRef} action={action} className="space-y-2">
        <label className="text-sm font-medium" htmlFor="clip-url">
          Importar por URL (YouTube, Vimeo, …)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="clip-url"
            name="url"
            type="url"
            placeholder="https://youtu.be/…"
            className={field}
            disabled={exhausted}
          />
          <button
            type="submit"
            disabled={pending || exhausted}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Enfileirando…" : "Importar"}
          </button>
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      </form>

      <div className="space-y-2 border-t border-border pt-4">
        <label className="text-sm font-medium" htmlFor="clip-file">
          Ou enviar um arquivo (MP4, MOV, WEBM — até 500 MB)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="clip-file"
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="text-sm"
            disabled={exhausted}
          />
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading || exhausted}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {uploading ? "Enviando…" : "Enviar arquivo"}
          </button>
        </div>
        {uploadErr && <p className="text-sm text-destructive">{uploadErr}</p>}
        <p className="text-xs text-muted-foreground">Para vídeos maiores, use a importação por URL.</p>
      </div>
    </div>
  )
}
