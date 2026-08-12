import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, getClipSource, MotorError } from "@/lib/motor/client"
import type { ClipItemView } from "@/lib/motor/types"

const RENDER: Record<string, string> = {
  preparing: "preparando",
  queued: "na fila de render",
  rendering: "renderizando",
  done: "pronto",
  error: "falhou",
}

const STATUS: Record<string, string> = {
  draft: "rascunho",
  in_review: "em aprovação (48h)",
  scheduled: "agendado",
  published: "publicado",
  archived: "arquivado",
}

function ClipCard({ clip }: { clip: ClipItemView }) {
  const rendered = clip.render_status === "done"
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug">{clip.title || "Clipe"}</h3>
        {clip.score != null && (
          <span
            className="shrink-0 rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
            title="Ordenação relativa: melhores momentos deste vídeo"
          >
            {clip.score}
          </span>
        )}
      </div>
      {rendered && clip.video_url ? (
        <video src={clip.video_url} controls className="aspect-[9/16] w-full rounded-lg bg-black object-contain" />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
          {RENDER[clip.render_status ?? ""] ?? "processando"}…
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{STATUS[clip.status] ?? clip.status}</span>
        <Link href={`/motor/conteudo/${clip.id}`} className="font-medium text-primary hover:underline">
          Abrir / publicar
        </Link>
      </div>
    </div>
  )
}

export default async function ClipSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await motorContext()
  let clips: ClipItemView[] = []
  let origin = ""
  let status = ""
  let unavailable: string | null = null
  try {
    const r = await getClipSource(ctx, id)
    clips = r.clips
    origin = r.source.origin
    status = r.source.status
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor/clipes" className="hover:underline">
            Clipes Inteligentes
          </Link>{" "}
          · Vídeo
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight break-words">{origin || "Vídeo"}</h1>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : clips.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status === "error" ? "O processamento falhou." : "Ainda processando — os clipes aparecem aqui quando ficarem prontos."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {clips.map((c) => (
            <ClipCard key={c.id} clip={c} />
          ))}
        </div>
      )}
    </div>
  )
}
