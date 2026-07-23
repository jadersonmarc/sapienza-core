import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, listContent, MotorError } from "@/lib/motor/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { ContentItem } from "@/lib/motor/types"

type Kind = "aprovacao" | "agendada" | "publicada"
type Entry = { item: ContentItem; date: Date; kind: Kind }

const KIND_LABEL: Record<Kind, string> = {
  aprovacao: "aprovação até",
  agendada: "publica em",
  publicada: "publicada em",
}

// Data relevante de cada peça na agenda editorial:
//  in_review → deadline da janela de 48h (silêncio = publica)
//  scheduled → data agendada · published → data de publicação.
function entryFor(item: ContentItem): Entry | null {
  if (item.status === "in_review" && item.review_deadline_at)
    return { item, date: new Date(item.review_deadline_at), kind: "aprovacao" }
  if (item.status === "scheduled" && item.scheduled_at)
    return { item, date: new Date(item.scheduled_at), kind: "agendada" }
  if (item.status === "published" && item.published_at)
    return { item, date: new Date(item.published_at), kind: "publicada" }
  return null
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
}
function timeLabel(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function groupByDay(entries: Entry[]): { day: string; rows: Entry[] }[] {
  const map = new Map<string, Entry[]>()
  for (const e of entries) {
    const key = e.date.toISOString().slice(0, 10)
    const bucket = map.get(key) ?? []
    bucket.push(e)
    map.set(key, bucket)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, rows]) => ({ day: dayLabel(rows[0].date), rows: rows.sort((x, y) => +x.date - +y.date) }))
}

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  if (entries.length === 0) return null
  const groups = groupByDay(entries)
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {groups.map((g) => (
        <div key={g.day} className="rounded-xl border border-border">
          <div className="border-b border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {g.day}
          </div>
          <ul>
            {g.rows.map((e) => (
              <li key={e.item.id} className="flex items-center gap-3 border-t border-border px-4 py-2 first:border-t-0">
                <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{timeLabel(e.date)}</span>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                    e.kind === "publicada" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {KIND_LABEL[e.kind]}
                </span>
                <Link href={`/motor/conteudo/${e.item.id}`} className="truncate text-sm hover:underline">
                  {e.item.title || e.item.slug}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default async function CalendarioPage() {
  const ctx = await motorContext()

  let items: ContentItem[] = []
  let unavailable: string | null = null
  try {
    items = await listContent(ctx)
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  const entries = items.map(entryFor).filter((e): e is Entry => e !== null)
  const upcoming = entries.filter((e) => e.kind !== "publicada").sort((a, b) => +a.date - +b.date)
  const published = entries.filter((e) => e.kind === "publicada").sort((a, b) => +b.date - +a.date)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            {produtoLabel("motor")}
          </Link>{" "}
          · Calendário
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Calendário editorial</h1>
        <p className="text-sm text-muted-foreground">
          Aprovações (janela 48h), agendamentos e publicações recentes.
        </p>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma peça em aprovação, agendada ou publicada.</p>
      ) : (
        <>
          <Section title="Próximas (aprovação / agendadas)" entries={upcoming} />
          <Section title="Publicadas recentemente" entries={published} />
        </>
      )}
    </div>
  )
}
