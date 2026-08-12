import { redirect } from "next/navigation"
import { currentContext } from "@/lib/console/current"
import { roleInTenant, tenantSubscriptions } from "@/lib/tenant/context"
import { issueProductToken } from "@/lib/auth/product-jwt"
import type {
  AnalysesResult,
  AnalysisType,
  ChannelsStatus,
  ClipHoursQuota,
  ClipItemView,
  ClipSource,
  ContentDetail,
  ContentFormat,
  ContentItem,
  ContentStatus,
  EditorConfig,
  Platform,
  Proposal,
  SetupStatus,
  SocialCaption,
  SocialDraftsResult,
  SocialPlatform,
} from "./types"

// BFF do console → API do Motor. Server-only: emite o JWT curto do core
// (lib/auth/product-jwt) e chama o Motor em MOTOR_API_URL. Todo acesso é escopado
// ao tenant ATIVO resolvido no servidor; o Motor valida o JWT e isola por tenant.

const PRODUTO = "motor"

export class MotorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "MotorError"
  }
}

export type MotorCtx = { tenantId: string; userId: string; role: string }

// Timeout curto p/ CRUD; timeout longo p/ chamadas que rodam o Claude
// (análise, geração de rascunho, aplicar recomendação) — opus-4-8 com adaptive
// thinking passa de 25s com facilidade.
const DEFAULT_TIMEOUT_MS = 25_000
const AI_TIMEOUT_MS = 120_000

function baseUrl(): string {
  return (process.env.MOTOR_API_URL ?? "http://localhost:3100").replace(/\/$/, "")
}

/** Resolve tenant ativo + papel e garante assinatura motor ativa (redireciona se não). */
export async function motorContext(): Promise<MotorCtx> {
  const { user, active } = await currentContext()
  if (!active) redirect("/")
  const subs = await tenantSubscriptions(active.id)
  const subscribed = subs.some((s) => s.produto === "motor" && s.status === "active")
  if (!subscribed) redirect("/")
  const role = user.isSuperadmin ? "owner" : ((await roleInTenant(user.id, active.id)) ?? "member")
  return { tenantId: active.id, userId: user.id, role }
}

async function call<T>(
  ctx: MotorCtx,
  path: string,
  init?: RequestInit,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const token = await issueProductToken({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    produto: PRODUTO,
    role: ctx.role,
  })
  // Timeout: se o motor demorar, devolve MotorError (erro claro na UI) em vez de
  // pendurar a requisição do console até o proxy cortar com 503.
  let res: Response
  try {
    res = await fetch(baseUrl() + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError"
    throw new MotorError(504, timedOut ? "o serviço do Motor demorou a responder" : "falha ao falar com o Motor")
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      msg = body?.error ?? msg
    } catch {
      /* corpo não-JSON */
    }
    throw new MotorError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Fetch cru ao Motor com o JWT do produto, SEM lançar em !ok e sem forçar
 *  Content-Type (serve p/ proxyar status+corpo — inclusive 409 {inUse} — e p/
 *  multipart de upload). Usado pelas rotas de proxy do console. */
export async function motorRaw(ctx: MotorCtx, path: string, init?: RequestInit): Promise<Response> {
  const token = await issueProductToken({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    produto: PRODUTO,
    role: ctx.role,
  })
  return fetch(baseUrl() + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
    cache: "no-store",
  })
}

export async function listContent(ctx: MotorCtx): Promise<ContentItem[]> {
  const r = await call<{ items: ContentItem[] | null }>(ctx, "/api/v1/content")
  return r.items ?? []
}

export async function getContent(ctx: MotorCtx, id: string): Promise<ContentDetail> {
  return call<ContentDetail>(ctx, `/api/v1/content/${id}`)
}

export async function deleteContent(ctx: MotorCtx, id: string): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>(ctx, `/api/v1/content/${id}`, { method: "DELETE" })
}

export async function updateContent(
  ctx: MotorCtx,
  id: string,
  body: { title: string; bodyMarkdown: string; excerpt?: string },
): Promise<{ revision_id: string }> {
  return call<{ revision_id: string }>(ctx, `/api/v1/content/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

// ── Propostas de IA ──────────────────────────────────────────────────────────

export async function applyRecommendation(
  ctx: MotorCtx,
  id: string,
  body: { type?: string; recommendation: string },
): Promise<{ proposal_id: string }> {
  return call<{ proposal_id: string }>(
    ctx,
    `/api/v1/content/${id}/apply-recommendation`,
    { method: "POST", body: JSON.stringify(body) },
    { timeoutMs: AI_TIMEOUT_MS },
  )
}

export async function listProposals(ctx: MotorCtx, id: string): Promise<Proposal[]> {
  const r = await call<{ proposals: Proposal[] | null }>(ctx, `/api/v1/content/${id}/proposals`)
  return r.proposals ?? []
}

export async function acceptProposal(ctx: MotorCtx, id: string, pid: string) {
  return call<{ ok: boolean }>(ctx, `/api/v1/content/${id}/proposals/${pid}`, { method: "POST" })
}

export async function discardProposal(ctx: MotorCtx, id: string, pid: string) {
  return call<{ ok: boolean }>(ctx, `/api/v1/content/${id}/proposals/${pid}`, { method: "DELETE" })
}

export async function createContent(
  ctx: MotorCtx,
  prompt: string,
  format: ContentFormat = "blog",
): Promise<{ id: string; slug: string }> {
  return call<{ id: string; slug: string }>(
    ctx,
    "/api/v1/content",
    { method: "POST", body: JSON.stringify({ prompt, format }) },
    { timeoutMs: AI_TIMEOUT_MS },
  )
}

/** Cria uma peça de MOTION (vídeo). Capability-gated no Motor (403 se o plano não
 *  tem motion). Roda geração + render em segundo plano; volta 202 { id, slug }. */
export async function createMotion(
  ctx: MotorCtx,
  prompt: string,
  channel: "instagram" | "linkedin" = "instagram",
  opts: { archetype?: string; audio?: string } = {},
): Promise<{ id: string; slug: string }> {
  return call<{ id: string; slug: string }>(
    ctx,
    "/api/v1/content/motion",
    { method: "POST", body: JSON.stringify({ prompt, channel, ...opts }) },
    { timeoutMs: AI_TIMEOUT_MS },
  )
}

export type BriefInput = {
  objetivo: string
  pontosChave?: string
  publico?: string
  tom?: string
  pilar?: string
}

export async function createFromBrief(ctx: MotorCtx, input: BriefInput): Promise<{ id: string; slug: string }> {
  return call<{ id: string; slug: string }>(
    ctx,
    "/api/v1/content/brief",
    { method: "POST", body: JSON.stringify(input) },
    { timeoutMs: AI_TIMEOUT_MS },
  )
}

export async function transitionContent(
  ctx: MotorCtx,
  id: string,
  to: ContentStatus,
  opts?: { scheduledAt?: string; note?: string },
): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>(ctx, `/api/v1/content/${id}/transition`, {
    method: "POST",
    body: JSON.stringify({ to, scheduledAt: opts?.scheduledAt, note: opts?.note }),
  })
}

export async function regenerateContent(
  ctx: MotorCtx,
  id: string,
  prompt?: string,
): Promise<{ async?: boolean; revisionId?: string }> {
  // Regeneração roda em segundo plano no Motor (202 { async: true }); o resultado
  // aparece na peça depois (generating → nova revisão, ou generate_error).
  return call<{ async?: boolean; revisionId?: string }>(
    ctx,
    `/api/v1/content/${id}/regenerate`,
    { method: "POST", body: JSON.stringify({ prompt }) },
    { timeoutMs: AI_TIMEOUT_MS },
  )
}

export async function publishContent(
  ctx: MotorCtx,
  id: string,
): Promise<{ async?: boolean }> {
  // Publicação é em segundo plano no Motor: responde 202 { async: true }. O
  // resultado (ou o erro) aparece na peça depois (status + publish_error).
  return call<{ async?: boolean }>(ctx, `/api/v1/content/${id}/publish`, { method: "POST", body: JSON.stringify({}) })
}

// Reprocessa só os canais que falharam numa publicação anterior (peça já
// publicada). 202 async, como o publish; resultado/erro aparece em publish_error.
export async function republishContent(ctx: MotorCtx, id: string): Promise<{ async?: boolean }> {
  return call<{ async?: boolean }>(ctx, `/api/v1/content/${id}/republish`, { method: "POST", body: "{}" })
}

export async function getChannels(ctx: MotorCtx): Promise<ChannelsStatus> {
  return call<ChannelsStatus>(ctx, "/api/v1/channels")
}

// OAuth de canal (o cliente conecta uma vez; o motor renova o token sozinho).
// getChannelOAuthUrl devolve null quando o app OAuth não está configurado (409) —
// o console então mostra só o colar-JSON manual (seam).
export async function getChannelOAuthUrl(ctx: MotorCtx, platform: string, state: string): Promise<string | null> {
  try {
    const r = await call<{ url: string }>(
      ctx,
      `/api/v1/channels/oauth?platform=${encodeURIComponent(platform)}&state=${encodeURIComponent(state)}`,
    )
    return r.url
  } catch (e) {
    if (e instanceof MotorError && e.status === 409) return null // não configurado
    throw e
  }
}

export async function exchangeChannelOAuth(ctx: MotorCtx, platform: string, code: string): Promise<void> {
  await call(ctx, "/api/v1/channels/oauth", { method: "POST", body: JSON.stringify({ platform, code }) })
}

// Desempenho das peças — série temporal diária + totais + quebra por pilar.
export type MotorStats = {
  period: string
  series: { day: string; impressions: number; reach: number; likes: number; comments: number; shares: number }[]
  totals: { impressions: number; reach: number; likes: number; comments: number; shares: number; posts: number }
  byPillar: { pilar: string | null; impressions: number; posts: number }[]
}

export async function getContentStats(ctx: MotorCtx, period?: string): Promise<MotorStats> {
  const q = period && /^\d{4}-\d{2}$/.test(period) ? `?period=${period}` : ""
  return call<MotorStats>(ctx, `/api/v1/content/stats${q}`)
}

export type TopPost = {
  slug: string
  title: string | null
  pilar: string | null
  format: string
  impressions: number
  likes: number
  comments: number
}

export async function getTopPosts(
  ctx: MotorCtx,
  period?: string,
  limit?: number,
): Promise<{ period: string; top: TopPost[] }> {
  const p = new URLSearchParams()
  if (period && /^\d{4}-\d{2}$/.test(period)) p.set("period", period)
  if (limit && Number.isFinite(limit)) p.set("limit", String(Math.trunc(limit)))
  const q = p.toString() ? `?${p.toString()}` : ""
  return call(ctx, `/api/v1/content/stats/top${q}`)
}

export type ByConfigRow = { config_version: number | null; posts: number; impressions: number; avg_impressions: number }

export async function getByConfig(ctx: MotorCtx, period?: string): Promise<{ period: string; byConfig: ByConfigRow[] }> {
  const q = period && /^\d{4}-\d{2}$/.test(period) ? `?period=${period}` : ""
  return call(ctx, `/api/v1/content/stats/by-config${q}`)
}

// Crescimento de conta (seguidores/alcance) — série diária + variação por canal.
export type ChannelGrowth = {
  platform: string
  series: { day: string; followers: number; reach: number }[]
  followersStart: number
  followersEnd: number
  delta: number
}

export async function getGrowth(ctx: MotorCtx, period?: string): Promise<{ period: string; growth: ChannelGrowth[] }> {
  const q = period && /^\d{4}-\d{2}$/.test(period) ? `?period=${period}` : ""
  return call(ctx, `/api/v1/content/stats/growth${q}`)
}

/** Gera a imagem on-brand da peça no formato do canal e a persiste. */
export async function generatePieceImage(ctx: MotorCtx, id: string): Promise<{ image_url: string }> {
  return call<{ image_url: string }>(ctx, `/api/v1/content/${id}/image`, { method: "POST", body: "{}" })
}

/** Troca a imagem da peça por uma URL da biblioteca de mídia. */
export async function setPieceImage(ctx: MotorCtx, id: string, imageUrl: string): Promise<{ image_url: string }> {
  return call<{ image_url: string }>(ctx, `/api/v1/content/${id}/image`, {
    method: "PUT",
    body: JSON.stringify({ imageUrl }),
  })
}

export async function connectChannel(
  ctx: MotorCtx,
  platform: Platform,
  credentials?: string,
): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>(ctx, "/api/v1/channels", {
    method: "POST",
    body: JSON.stringify({ platform, credentials }),
  })
}

export async function disconnectChannel(ctx: MotorCtx, platform: Platform): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>(ctx, "/api/v1/channels", {
    method: "DELETE",
    body: JSON.stringify({ platform }),
  })
}

export async function getSetup(ctx: MotorCtx): Promise<SetupStatus> {
  return call<SetupStatus>(ctx, "/api/v1/setup")
}

export async function getEditorConfig(ctx: MotorCtx): Promise<EditorConfig> {
  return call<EditorConfig>(ctx, "/api/v1/config")
}

export async function saveEditorConfig(ctx: MotorCtx, cfg: EditorConfig): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>(ctx, "/api/v1/config", { method: "PUT", body: JSON.stringify(cfg) })
}

export async function generateSocialCaption(
  ctx: MotorCtx,
  id: string,
  platform: SocialPlatform,
): Promise<SocialCaption> {
  return call<SocialCaption>(ctx, `/api/v1/content/${id}/social`, {
    method: "POST",
    body: JSON.stringify({ platform }),
  })
}

export async function listSocialDrafts(ctx: MotorCtx, id: string): Promise<SocialDraftsResult> {
  return call<SocialDraftsResult>(ctx, `/api/v1/content/${id}/social`)
}

export async function saveSocialCaption(
  ctx: MotorCtx,
  id: string,
  platform: SocialPlatform,
  body: string,
  hashtags: string[],
): Promise<SocialCaption> {
  return call<SocialCaption>(ctx, `/api/v1/content/${id}/social`, {
    method: "PUT",
    body: JSON.stringify({ platform, body, hashtags }),
  })
}

export async function listAnalyses(ctx: MotorCtx, id: string): Promise<AnalysesResult> {
  return call<AnalysesResult>(ctx, `/api/v1/content/${id}/analyze`)
}

export async function runAnalysis(ctx: MotorCtx, id: string, type: AnalysisType) {
  return call<{ type: AnalysisType; payload: unknown; model: string | null }>(
    ctx,
    `/api/v1/content/${id}/analyze`,
    { method: "POST", body: JSON.stringify({ type }) },
    { timeoutMs: AI_TIMEOUT_MS },
  )
}

/** URL do preview de imagem on-brand (proxied pelo console p/ não expor MOTOR_API_URL). */
export function previewImageUrl(params: {
  text: string
  archetype?: string
  format?: string
  pilar?: string | null
}): string {
  const q = new URLSearchParams({
    text: params.text,
    archetype: params.archetype ?? "capa",
    format: params.format ?? "ig-feed",
  })
  if (params.pilar) q.set("pilar", params.pilar)
  return `/motor/preview?${q.toString()}`
}

/** Server-only: busca o PNG do preview no Motor (rota pública /api/og). */
export async function fetchPreviewImage(search: URLSearchParams): Promise<Response> {
  const allowed = new URLSearchParams()
  for (const k of ["text", "archetype", "format", "pilar", "field", "index", "total", "kind", "caption"]) {
    const v = search.get(k)
    if (v) allowed.set(k, v)
  }
  return fetch(`${baseUrl()}/api/og?${allowed.toString()}`, { cache: "no-store" })
}

// ── Clipes Inteligentes ───────────────────────────────────────────────────────

/** Lista as fontes de vídeo do tenant + a cota de horas. */
export async function listClipSources(
  ctx: MotorCtx,
): Promise<{ sources: ClipSource[]; quota: ClipHoursQuota }> {
  return call<{ sources: ClipSource[]; quota: ClipHoursQuota }>(ctx, "/api/v1/content/clip")
}

/** Cria uma fonte por URL (o worker baixa, transcreve, analisa e gera os clipes). */
export async function createClipFromUrl(ctx: MotorCtx, url: string): Promise<{ id: string }> {
  return call<{ id: string }>(ctx, "/api/v1/content/clip", {
    method: "POST",
    body: JSON.stringify({ url }),
  })
}

/** Detalhe da fonte + seus clipes (grade ranqueada por score). */
export async function getClipSource(
  ctx: MotorCtx,
  id: string,
): Promise<{ source: ClipSource; clips: ClipItemView[] }> {
  return call<{ source: ClipSource; clips: ClipItemView[] }>(ctx, `/api/v1/content/clip/${id}`)
}
