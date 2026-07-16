import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, listContent, MotorError } from "@/lib/motor/client"
import type { ContentItem, ContentStatus } from "@/lib/motor/types"
import { NewContentForm } from "./new-form"
import { BriefForm } from "./brief-form"

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "rascunho",
  in_review: "em aprovação",
  scheduled: "agendada",
  published: "publicada",
  archived: "arquivada",
}

function when(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export default async function ConteudoPage() {
  const ctx = await motorContext()

  let items: ContentItem[] = []
  let unavailable: string | null = null
  try {
    items = await listContent(ctx)
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            Motor
          </Link>{" "}
          · Conteúdo
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Peças</h1>
      </div>

      <NewContentForm />
      <BriefForm />

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma peça ainda.</p>
      ) : (
        <div className="rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Peça</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Publicada</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-4 py-2">
                    <Link href={`/motor/conteudo/${it.id}`} className="hover:underline">
                      {it.slug}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        it.status === "published"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[it.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{when(it.published_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
