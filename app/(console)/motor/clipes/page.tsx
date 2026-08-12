import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, listClipSources, MotorError } from "@/lib/motor/client"
import type { ClipSource, ClipHoursQuota } from "@/lib/motor/types"
import { ClipImportPanel } from "./import-panel"

// Rótulos pt-BR dos estágios da esteira (clip_sources.status).
const STAGE: Record<string, { label: string; done?: boolean; error?: boolean }> = {
  queued: { label: "Na fila" },
  downloading: { label: "Baixando" },
  probing: { label: "Analisando arquivo" },
  extracting_audio: { label: "Extraindo áudio" },
  transcribing: { label: "Transcrevendo" },
  analyzing: { label: "Escolhendo os melhores momentos" },
  generating: { label: "Gerando clipes" },
  done: { label: "Pronto", done: true },
  error: { label: "Falhou", error: true },
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

function QuotaBar({ q }: { q: ClipHoursQuota }) {
  const pct = q.limitMinutes > 0 ? Math.min(100, Math.round((q.usedMinutes / q.limitMinutes) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Horas de vídeo neste mês</span>
        <span>
          {(q.usedMinutes / 60).toFixed(1)}h de {(q.limitMinutes / 60).toFixed(0)}h
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default async function ClipesPage() {
  const ctx = await motorContext()
  let sources: ClipSource[] = []
  let quota: ClipHoursQuota | null = null
  let unavailable: string | null = null
  try {
    const r = await listClipSources(ctx)
    sources = r.sources
    quota = r.quota
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  const processing = sources.some((s) => s.status !== "done" && s.status !== "error")

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            Margot Editora
          </Link>{" "}
          · Clipes Inteligentes
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Clipes Inteligentes</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Transforme um vídeo longo (podcast, entrevista, webinar) em vários cortes verticais com legenda,
          já com a sua marca. Os melhores momentos entram na aprovação de 48h e saem publicados nos seus canais.
        </p>
      </div>

      {quota && <QuotaBar q={quota} />}

      <ClipImportPanel exhausted={!!quota && quota.remainingMinutes <= 0} autoRefresh={processing} />

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum vídeo ainda. Importe um acima para começar.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Vídeo</th>
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2 font-medium">Clipes</th>
                <th className="px-4 py-2 font-medium">Enviado</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const st = STAGE[s.status] ?? { label: s.status }
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/50">
                    <td className="px-4 py-2">
                      <Link href={`/motor/clipes/${s.id}`} className="hover:underline">
                        {s.kind === "url" ? s.origin : s.origin || "arquivo enviado"}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          st.error
                            ? "bg-destructive/15 text-destructive"
                            : st.done
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {st.label}
                      </span>
                      {st.error && s.error && (
                        <span className="ml-2 text-xs text-muted-foreground">{s.error}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{s.clips_count}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{when(s.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
