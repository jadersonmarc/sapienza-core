"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { correctTranscriptAction } from "../../actions"

/** Corrige um termo que o reconhecimento de fala errou (nome próprio, sigla, jargão)
 *  e propaga para a transcrição e todos os clipes ainda não publicados do vídeo. */
export function CorrectionForm({ sourceId }: { sourceId: string }) {
  const router = useRouter()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const field = "rounded-md border border-border bg-background px-2 py-1 text-sm"

  function run() {
    setErr(null)
    setMsg(null)
    start(async () => {
      const res = await correctTranscriptAction(sourceId, from, to)
      if (res.error) {
        setErr(res.error)
        return
      }
      if (!res.corrected) {
        setMsg(`Nenhuma ocorrência de "${from}" encontrada.`)
        return
      }
      setMsg(`Corrigido ${res.corrected}× — ${res.requeued} clipe(s) re-renderizando.`)
      setFrom("")
      setTo("")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <span className="text-sm font-medium">Corrigir uma palavra em todo o vídeo</span>
      <p className="text-xs text-muted-foreground">
        Se a legenda escreveu errado um nome, sigla ou termo, corrija aqui — vale para a transcrição e todos os clipes.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="como saiu"
          className={field}
        />
        <span className="text-muted-foreground">→</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="como deveria ser" className={field} />
        <button
          type="button"
          onClick={run}
          disabled={pending || !from.trim() || !to.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {pending ? "Corrigindo…" : "Corrigir"}
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  )
}
