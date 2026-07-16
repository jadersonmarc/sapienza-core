import { redirect } from "next/navigation"
import { currentContext } from "@/lib/console/current"
import { roleInTenant, tenantSubscriptions } from "@/lib/tenant/context"
import { issueProductToken } from "@/lib/auth/product-jwt"
import type {
  AnalysesResult,
  AnalysisType,
  ChannelsStatus,
  ContentDetail,
  ContentItem,
  ContentStatus,
  Platform,
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

async function call<T>(ctx: MotorCtx, path: string, init?: RequestInit): Promise<T> {
  const token = await issueProductToken({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    produto: PRODUTO,
    role: ctx.role,
  })
  const res = await fetch(baseUrl() + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: "no-store",
  })
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

export async function listContent(ctx: MotorCtx): Promise<ContentItem[]> {
  const r = await call<{ items: ContentItem[] | null }>(ctx, "/api/v1/content")
  return r.items ?? []
}

export async function getContent(ctx: MotorCtx, id: string): Promise<ContentDetail> {
  return call<ContentDetail>(ctx, `/api/v1/content/${id}`)
}

export async function createContent(ctx: MotorCtx, prompt: string): Promise<{ id: string; slug: string }> {
  return call<{ id: string; slug: string }>(ctx, "/api/v1/content", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  })
}

export type BriefInput = {
  objetivo: string
  pontosChave?: string
  publico?: string
  tom?: string
  pilar?: string
}

export async function createFromBrief(ctx: MotorCtx, input: BriefInput): Promise<{ id: string; slug: string }> {
  return call<{ id: string; slug: string }>(ctx, "/api/v1/content/brief", {
    method: "POST",
    body: JSON.stringify(input),
  })
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
): Promise<{ revisionId: string }> {
  return call<{ revisionId: string }>(ctx, `/api/v1/content/${id}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  })
}

export async function publishContent(
  ctx: MotorCtx,
  id: string,
): Promise<{ published: { platform: Platform; url: string }[] }> {
  return call<{ published: { platform: Platform; url: string }[] }>(
    ctx,
    `/api/v1/content/${id}/publish`,
    { method: "POST", body: JSON.stringify({}) },
  )
}

export async function getChannels(ctx: MotorCtx): Promise<ChannelsStatus> {
  return call<ChannelsStatus>(ctx, "/api/v1/channels")
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

export async function getSetup(ctx: MotorCtx): Promise<SetupStatus> {
  return call<SetupStatus>(ctx, "/api/v1/setup")
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
