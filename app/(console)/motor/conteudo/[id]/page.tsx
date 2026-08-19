import Link from "next/link"
import { notFound } from "next/navigation"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, getContent, listAnalyses, listProposals, MotorError } from "@/lib/motor/client"
import type { Analysis, AnalysisType, ContentFormat, ContentStatus, Proposal } from "@/lib/motor/types"
import { ItemActions, RetryPublishButton } from "./item-actions"
import { DeleteButton } from "./delete-button"
import { ContentEditor } from "./content-editor"
import { ProposalsPanel } from "./proposals-panel"
import { PieceImage } from "./piece-image"
import { AnalyzePanel } from "./analyze-panel"
import { AutoRefresh } from "./auto-refresh"

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

// Fallback estático dos tipos de análise (mesmos labels do Motor) — usado quando o
// GET /analyze falha, p/ os botões continuarem aparecendo mesmo sem histórico.
const ANALYZER_TYPES: { type: AnalysisType; label: string }[] = [
  { type: "quality", label: "Qualidade" },
  { type: "seo", label: "SEO" },
  { type: "emotional", label: "Impacto emocional" },
  { type: "thematic", label: "Temática" },
]

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
    // Preservamos a mensagem de erro do GET /analyze p/ o painel avisar em vez de
    // sumir silenciosamente com os botões.
    const [analysesRes, proposals] = await Promise.all([
      listAnalyses(ctx, id)
        .then((r) => ({ ok: true as const, r }))
        .catch((e) => ({ ok: false as const, e })),
      listProposals(ctx, id).catch((): Proposal[] => []),
    ])
    const analyses: Analysis[] = analysesRes.ok ? analysesRes.r.analyses : []
    const analysisTypes =
      analysesRes.ok && analysesRes.r.types.length ? analysesRes.r.types : ANALYZER_TYPES
    const analysesError = analysesRes.ok
      ? null
      : analysesRes.e instanceof MotorError
        ? `${analysesRes.e.status} — ${analysesRes.e.message}`
        : "serviço indisponível"
    // Recomendações já aplicadas (têm proposta) — o painel de análise as remove da lista.
    const appliedRecommendations = proposals
      .map((p) => p.proposed_from?.recommendation)
      .filter((r): r is string => Boolean(r))
    const isSocial = item.format === "linkedin" || item.format === "instagram"
    // Peça de motion aguardando render (fila/renderizando) → auto-refresh até ficar pronta.
    const motionPending = item.is_motion && item.render_status !== "done" && item.render_status !== "error"
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
          <ItemActions
            id={item.id}
            status={item.status}
            regenBlocked={item.regen_count >= REGEN_LIMIT}
            isClip={item.is_clip === true}
            hasBrief={Boolean(item.brief && item.brief.trim())}
          />
          <DeleteButton id={item.id} />
        </div>

        {item.publish_error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Falha na última publicação: {item.publish_error}
            {item.status === "published" && <RetryPublishButton id={item.id} />}
          </div>
        )}

        {item.generating && (
          <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            Gerando rascunho com IA… pode levar até ~1min. Esta página atualiza sozinha quando ficar pronto.
          </p>
        )}

        {item.generate_error && !item.generating && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Falha ao gerar o rascunho: {item.generate_error}. Use “Regenerar rascunho” para tentar de novo.
          </p>
        )}

        {/* Peça de motion: vídeo renderizado + estado do render. */}
        {item.is_motion && (
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Peça em movimento (vídeo)</h2>
              {item.motion_preset && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs">
                  {item.motion_preset} · {item.motion_aspect}
                </span>
              )}
            </div>
            {item.render_status === "done" && item.video_url ? (
              <>
                <video
                  src={item.video_url}
                  controls
                  loop
                  playsInline
                  className="w-full max-w-xs rounded-xl border border-border"
                />
                {item.video_urls && Object.keys(item.video_urls).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Baixar:</span>
                    {Object.entries(item.video_urls).map(([aspect, url]) => (
                      <a
                        key={aspect}
                        href={url}
                        download
                        className="rounded border border-border px-2 py-1 hover:bg-muted"
                      >
                        {aspect}
                      </a>
                    ))}
                  </div>
                )}
              </>
            ) : item.render_status === "error" ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Falha ao renderizar o vídeo: {item.render_error ?? "erro desconhecido"}.
              </p>
            ) : (
              <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                {item.generating ? "Gerando o conteúdo…" : "Renderizando o vídeo…"} A página atualiza sozinha quando ficar
                pronto.
              </p>
            )}
          </div>
        )}

        {(item.generating || motionPending) && <AutoRefresh />}

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
          ) : item.generating ? (
            <p className="text-sm text-muted-foreground">A IA está escrevendo a primeira versão…</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem revisão ainda. Use “Regenerar rascunho” acima para a IA escrever a primeira versão.
            </p>
          )}

          <PieceImage id={item.id} format={item.format} imageUrl={item.image_url} />
        </div>

        <ProposalsPanel
          id={item.id}
          status={item.status}
          currentBody={item.revision?.body_markdown ?? ""}
          proposals={proposals}
        />

        <AnalyzePanel
          id={item.id}
          status={item.status}
          analyses={analyses}
          types={analysisTypes}
          appliedRecommendations={appliedRecommendations}
          loadError={analysesError}
        />
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
