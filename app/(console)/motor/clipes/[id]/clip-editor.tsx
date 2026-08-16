"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { editClipAction } from "../../actions"
import type { ClipItemView } from "@/lib/motor/types"

/** Editor-lite de um clipe: ajusta início/fim (s), aspecto, marca e posição da
 *  legenda; salva e re-renderiza. Só aparece antes de publicar. */
export function ClipEditor({ clip, can4k }: { clip: ClipItemView; can4k: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const [inS, setInS] = useState(((clip.in_ms ?? 0) / 1000).toFixed(1))
  const [outS, setOutS] = useState(((clip.out_ms ?? 0) / 1000).toFixed(1))
  const [aspect, setAspect] = useState<"9x16" | "16x9">(clip.clip_aspect === "16x9" ? "16x9" : "9x16")
  const [brandOn, setBrandOn] = useState(clip.brand_on ?? true)
  const [hd, setHd] = useState(clip.hd ?? false)
  const [caption, setCaption] = useState<"bottom" | "center" | "top">("bottom")

  const field = "w-full rounded-md border border-border bg-background px-2 py-1 text-xs"

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Ajustar corte
      </button>
    )
  }

  function save() {
    setErr(null)
    const inMs = Math.round(parseFloat(inS) * 1000)
    const outMs = Math.round(parseFloat(outS) * 1000)
    if (!(outMs > inMs)) {
      setErr("o fim precisa ser depois do início")
      return
    }
    start(async () => {
      const res = await editClipAction(clip.id, { inMs, outMs, aspect, brandOn, captionPosition: caption, hd })
      if (res.error) {
        setErr(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">
          Início (s)
          <input value={inS} onChange={(e) => setInS(e.target.value)} inputMode="decimal" className={field} />
        </label>
        <label className="text-xs text-muted-foreground">
          Fim (s)
          <input value={outS} onChange={(e) => setOutS(e.target.value)} inputMode="decimal" className={field} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">
          Formato
          <select value={aspect} onChange={(e) => setAspect(e.target.value as "9x16" | "16x9")} className={field}>
            <option value="9x16">Vertical 9:16</option>
            <option value="16x9">Horizontal 16:9</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Legenda
          <select value={caption} onChange={(e) => setCaption(e.target.value as "bottom" | "center" | "top")} className={field}>
            <option value="bottom">Embaixo</option>
            <option value="center">Centro</option>
            <option value="top">Em cima</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={brandOn} onChange={(e) => setBrandOn(e.target.checked)} />
        Aplicar minha marca (logo)
      </label>
      {can4k && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={hd} onChange={(e) => setHd(e.target.checked)} />
          Exportar em 4K (Premium)
        </label>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Re-renderizando…" : "Salvar e re-renderizar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
