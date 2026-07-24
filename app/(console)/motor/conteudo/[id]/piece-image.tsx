"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { generatePieceImageAction, setPieceImageAction, type ActionState } from "../../actions"
import type { ContentFormat } from "@/lib/motor/types"
import type { R2Purpose } from "@/lib/motor/media"
import { MediaPicker } from "./media-picker"

const initial: ActionState = {}

// Pasta da biblioteca por formato do canal da peça.
const FOLDER: Record<ContentFormat, R2Purpose> = {
  blog: "article",
  linkedin: "linkedin",
  instagram: "instagram",
}

/** Imagem on-brand da peça: gera no formato do canal ou troca por uma da
 *  biblioteca. É a imagem que o publish envia àquele canal. */
export function PieceImage({ id, format, imageUrl }: { id: string; format: ContentFormat; imageUrl: string | null }) {
  const router = useRouter()
  const [genState, genAction, generating] = useActionState(generatePieceImageAction, initial)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [swapping, startSwap] = useTransition()
  const [swapError, setSwapError] = useState<string | null>(null)

  function pick(url: string) {
    setPickerOpen(false)
    setSwapError(null)
    startSwap(async () => {
      const r = await setPieceImageAction(id, url)
      if (r.error) setSwapError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Imagem do canal</h2>

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="Imagem on-brand da peça" className="w-full max-w-xs rounded-xl border border-border" />
      ) : (
        <p className="text-sm text-muted-foreground">
          Sem imagem ainda. Gere a imagem on-brand do canal ou escolha uma da biblioteca.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form action={genAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={generating}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {generating ? "Gerando…" : imageUrl ? "Regerar imagem" : "Gerar imagem"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {pickerOpen ? "Fechar" : "Trocar pela biblioteca"}
        </button>
        {(generating || swapping) && <span className="text-xs text-muted-foreground">…</span>}
        {genState.error && <span className="text-xs text-destructive">{genState.error}</span>}
        {swapError && <span className="text-xs text-destructive">{swapError}</span>}
      </div>

      {pickerOpen && <MediaPicker folder={FOLDER[format]} onSelect={pick} />}
    </div>
  )
}
