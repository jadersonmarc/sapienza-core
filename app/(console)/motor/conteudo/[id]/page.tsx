import Link from "next/link"
import { notFound } from "next/navigation"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, getContent, listAnalyses, listProposals, MotorError } from "@/lib/motor/client"
import type { Analysis, ContentFormat, ContentStatus, Proposal } from "@/lib/motor/types"
import { ItemActions } from "./item-actions"
import { DeleteButton } from "./delete-button"
import { ContentEditor } from "./content-editor"
import { ProposalsPanel } from "./proposals-panel"
import { PieceImage } from "./piece-image"
import { AnalyzePanel } from "./analyze-panel"

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
    // Análises/propostas degradam sem derrubar a página (o essencial é a peça).
    const [analyses, proposals] = await Promise.all([
      listAnalyses(ctx, id).catch(() => ({ analyses: [] as Analysis[], types: [] })),
      listProposals(ctx, id).catch((): Proposal[] => []),
    ])
    const isSocial = item.format === "linkedin" || item.format === "instagram"
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Eyebrow>
            <Link href="/motor/conteudo" className="hover:underline">
              Conteúdo
            </Link>{" "}
            · {FORMAT_LABEL[item.format] ?? "Peça"}
          </Eyebrow>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {item.revision?.title || item.slug}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">
              {FORMAT_LABEL[item.format] ?? item.format}
            </span>
            {!isSocial && <span className="font-mono text-xs">{item.slug}</span>}
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

        <div className="flex flex-wrap items-start justify-between gap-3">
          <ItemActions id={item.id} status={item.status} regenBlocked={item.regen_count >= REGEN_LIMIT} />
          <DeleteButton id={item.id} />
        </div>

        {item.publish_error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Falha na última publicação: {item.publish_error}
          </p>
        )}

        {/* Editor coeso, mostrado direto — o campo de texto É a peça (sem cópia
            só-leitura duplicada nem toggle escondendo a edição). */}
        <div className="max-w-3xl space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {isSocial ? "Texto do post" : "Conteúdo da peça"}
          </h2>
          {item.revision ? (
            <ContentEditor
              id={item.id}
              title={item.revision.title}
              bodyMarkdown={item.revision.body_markdown}
              excerpt={item.revision.excerpt ?? ""}
              isSocial={isSocial}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem revisão ainda. Use “Regenerar rascunho” acima para a IA escrever a primeira versão.
            </p>
          )}

          <PieceImage id={item.id} format={item.format} imageUrl={item.image_url} />
        </div>

        <ProposalsPanel id={item.id} currentBody={item.revision?.body_markdown ?? ""} proposals={proposals} />

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
