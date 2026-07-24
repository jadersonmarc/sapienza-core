"use client"

import { useEffect, useState } from "react"
import { fileNameFromKey, type R2Purpose } from "@/lib/motor/media"

type MediaObject = { key: string; url: string }

/** Seletor enxuto: lista as imagens de uma pasta da biblioteca (via o proxy do
 *  console) e devolve a URL escolhida. Reusa /motor/midia/api. */
export function MediaPicker({ folder, onSelect }: { folder: R2Purpose; onSelect: (url: string) => void }) {
  const [objects, setObjects] = useState<MediaObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/motor/midia/api?folder=${folder}`)
      .then((r) => r.json())
      .then((d: { objects?: MediaObject[]; error?: string }) => {
        if (!active) return
        if (d.error) setError(d.error)
        else setObjects(d.objects ?? [])
      })
      .catch(() => active && setError("Falha ao listar imagens."))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [folder])

  if (loading) return <p className="text-xs text-muted-foreground">Carregando biblioteca…</p>
  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (objects.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma imagem nesta pasta.</p>

  return (
    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-border p-2">
      {objects.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onSelect(o.url)}
          className="overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={fileNameFromKey(o.key)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={o.url} alt={fileNameFromKey(o.key)} loading="lazy" className="aspect-square w-full object-cover" />
        </button>
      ))}
    </div>
  )
}
