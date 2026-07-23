import Link from "next/link"
import { notFound } from "next/navigation"
import { Eyebrow } from "@/components/eyebrow"
import {
  motorContext,
  getContent,
  listSocialDrafts,
  listAnalyses,
  listProposals,
  previewImageUrl,
  MotorError,
} from "@/lib/motor/client"
import type { Analysis, ContentStatus, Proposal, SocialDraft } from "@/lib/motor/types"
import { ItemActions } from "./item-actions"
import { ContentEditor } from "./content-editor"
import { ProposalsPanel } from "./proposals-panel"
import { SocialPanel } from "./social-panel"
import { AnalyzePanel } from "./analyze-panel"

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "rascunho",
  in_review: "em aprovação",
  scheduled: "agendada",
  published: "publicada",
  archived: "arquivada",
}

// Limite de regenerações do plano (product_rules.max_regeneracoes_por_peca). Usado só
// como dica de UI — o Motor é a fonte de verdade e retorna 409 na 3ª tentativa.
const REGEN_LIMIT = 2

function when(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await motorContext()

  try {
    const item = await getContent(ctx, id)
    // Social/análises degradam sem derrubar a página (o essencial é a peça).
    const [social, analyses, proposals] = await Promise.all([
      listSocialDrafts(ctx, id).then((r) => r.drafts).catch((): SocialDraft[] => []),
      listAnalyses(ctx, id).catch(() => ({ analyses: [] as Analysis[], types: [] })),
      listProposals(ctx, id).catch((): Proposal[] => []),
    ])
    const title = item.revision?.title || item.slug
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Eyebrow>
            <Link href="/motor/conteudo" className="hover:underline">
              Conteúdo
            </Link>{" "}
            · Peça
          </Eyebrow>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {item.revision?.title || item.slug}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{item.slug}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs">{STATUS_LABEL[item.status]}</span>
            {item.status === "in_review" && (
              <span className="text-xs">aprovação até {when(item.review_deadline_at)} (silêncio = aprovado)</span>
            )}
            {item.status === "scheduled" && <span className="text-xs">agendada para {when(item.scheduled_at)}</span>}
            {item.published_at && <span className="text-xs">publicada em {when(item.published_at)}</span>}
            <span className="text-xs">
              regenerações {item.regen_count}/{REGEN_LIMIT}
            </span>
          </div>
        </div>

        <ItemActions id={item.id} status={item.status} regenBlocked={item.regen_count >= REGEN_LIMIT} />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Rascunho atual</h2>
            {item.revision ? (
              <article className="rounded-xl border border-border p-4">
                {item.revision.excerpt && (
                  <p className="mb-3 text-sm italic text-muted-foreground">{item.revision.excerpt}</p>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {item.revision.body_markdown}
                </pre>
              </article>
            ) : (
              <p className="text-sm text-muted-foreground">Sem revisão.</p>
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Prévia da imagem</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImageUrl({ text: title, pilar: item.pilar, archetype: "capa", format: "ig-feed" })}
              alt={`Prévia on-brand de ${title}`}
              className="w-full rounded-xl border border-border"
            />
            <p className="text-xs text-muted-foreground">Capa on-brand (4:5) gerada pelo Motor no publish.</p>
          </div>
        </div>

        {item.revision && (
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Editar peça</summary>
            <div className="mt-4">
              <ContentEditor
                id={item.id}
                title={item.revision.title}
                bodyMarkdown={item.revision.body_markdown}
                excerpt={item.revision.excerpt ?? ""}
              />
            </div>
          </details>
        )}

        <ProposalsPanel id={item.id} currentBody={item.revision?.body_markdown ?? ""} proposals={proposals} />

        <SocialPanel id={item.id} drafts={social} />

        <AnalyzePanel id={item.id} analyses={analyses.analyses} types={analyses.types} />
      </div>
    )
  } catch (e) {
    if (e instanceof MotorError && e.status === 404) notFound()
    const msg = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
    return (
      <div className="space-y-3">
        <Eyebrow>Conteúdo · Peça</Eyebrow>
        <p className="text-sm text-muted-foreground">Não foi possível carregar a peça ({msg}).</p>
      </div>
    )
  }
}
