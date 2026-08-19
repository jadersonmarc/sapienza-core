"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { deleteClipAction, deleteClipVideoAction } from "../../actions"

/** Exclui UM clipe. Confirmação inline obrigatória, sem desfazer. Exclusão local:
 *  clipe publicado permanece na rede social. */
export function DeleteClipButton({ clipId }: { clipId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-destructive hover:underline"
      >
        Excluir
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs">Excluir? Se já publicado, permanece na rede (local). Sem desfazer.</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null)
              const r = await deleteClipAction(clipId)
              if (r.error) {
                setErr(r.error)
                return
              }
              router.refresh()
            })
          }
          className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Excluindo…" : "Confirmar"}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="text-xs hover:underline">
          Cancelar
        </button>
      </div>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}

/** Exclui o vídeo-fonte + TODOS os clipes derivados, em cascata. Confirmação mostra
 *  quantos clipes serão perdidos e a nota de exclusão local. Sem desfazer. */
export function DeleteSourceButton({ sourceId, clipCount }: { sourceId: string; clipCount: number }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        Excluir vídeo e clipes
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm">
        Apagar este vídeo e {clipCount === 1 ? "seu 1 clipe" : `seus ${clipCount} clipes`}? Clipes já publicados
        permanecem nas redes (a exclusão é só aqui). Não dá para desfazer.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null)
              const r = await deleteClipVideoAction(sourceId)
              // Sucesso redireciona (não retorna); só chega aqui em erro.
              if (r?.error) setErr(r.error)
            })
          }
          className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Excluindo…" : "Excluir tudo"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}
