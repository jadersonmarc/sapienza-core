"use client"

import { useState, useTransition } from "react"
import { purgeFailedClipsAction } from "../actions"

// Caso 1 do item 6: limpar TODAS as falhas numa ação só. Fonte em falha não tem
// trabalho a perder → sem confirmação elaborada. O botão só existe quando há falhas
// (some com N=0 — botão inerte é ruído).
export function PurgeFailedButton({ count }: { count: number }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (count <= 0) return null

  function onPurge() {
    setMsg(null)
    setErr(null)
    start(async () => {
      const r = await purgeFailedClipsAction()
      if (r.error) setErr(r.error)
      else if (r.message) setMsg(r.message)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onPurge}
        disabled={pending}
        className="rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        {pending ? "Limpando…" : `Limpar todas as falhas (${count})`}
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}
