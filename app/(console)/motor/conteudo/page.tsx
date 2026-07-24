import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { Button } from "@/components/ui/button"
import { motorContext, listContent, MotorError } from "@/lib/motor/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { ContentFormat, ContentItem, ContentStatus } from "@/lib/motor/types"

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "rascunho",
  in_review: "em aprovação",
  scheduled: "agendada",
  published: "publicada",
  archived: "arquivada",
}

const FORMAT_LABEL: Record<ContentFormat, string> = {
  blog: "Blog",
  linkedin: "LinkedIn",
  instagram: "Instagram",
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>
            <Link href="/motor" className="hover:underline">
              {produtoLabel("motor")}
            </Link>{" "}
            · Conteúdo
          </Eyebrow>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Peças</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "peça" : "peças"}
          </p>
        </div>
        <Button asChild>
          <Link href="/motor/conteudo/new">Nova peça</Link>
        </Button>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
          Nenhuma peça ainda. Crie a primeira em “Nova peça”.
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`/motor/conteudo/${it.id}`}
              className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{it.title || it.slug}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">
                    {FORMAT_LABEL[it.format] ?? it.format}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5">{STATUS_LABEL[it.status]}</span>
                  {it.published_at && (
                    <span>
                      publicada em{" "}
                      {new Date(it.published_at).toLocaleDateString("pt-BR", { dateStyle: "short" })}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">Editar →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
