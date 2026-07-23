import { redirect } from "next/navigation"
import { currentContext } from "@/lib/console/current"
import { roleInTenant, tenantSubscriptions } from "@/lib/tenant/context"
import { issueProductToken } from "@/lib/auth/product-jwt"
import type {
  AgentConfig,
  ChannelBinding,
  ChannelStatus,
  Conversation,
  Message,
  QRResponse,
  SetupStatus,
  WebhookSecret,
} from "./types"

// BFF do console → API do Margot. Server-only: emite o JWT curto do core
// (lib/auth/product-jwt) e chama o Margot em MARGOT_API_URL. Todo acesso é escopado
// ao tenant ATIVO resolvido no servidor; o Margot valida o JWT e isola por tenant.

const PRODUTO = "margot"

export class MargotError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "MargotError"
  }
}

export type MargotCtx = { tenantId: string; userId: string; role: string; isSuperadmin: boolean }

function baseUrl(): string {
  return (process.env.MARGOT_API_URL ?? "http://localhost:8081").replace(/\/$/, "")
}

/** Resolve tenant ativo + papel e garante assinatura margot ativa (redireciona se não). */
export async function margotContext(): Promise<MargotCtx> {
  const { user, active } = await currentContext()
  if (!active) redirect("/")
  const subs = await tenantSubscriptions(active.id)
  const subscribed = subs.some((s) => s.produto === "margot" && s.status === "active")
  if (!subscribed) redirect("/")
  const role = user.isSuperadmin ? "owner" : ((await roleInTenant(user.id, active.id)) ?? "member")
  return { tenantId: active.id, userId: user.id, role, isSuperadmin: user.isSuperadmin }
}

async function call<T>(ctx: MargotCtx, path: string, init?: RequestInit): Promise<T> {
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
    throw new MargotError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function listConversations(ctx: MargotCtx): Promise<Conversation[]> {
  const r = await call<{ conversations: Conversation[] | null }>(ctx, "/api/v1/conversations")
  return r.conversations ?? []
}

export async function listMessages(ctx: MargotCtx, convId: string): Promise<Message[]> {
  const r = await call<{ messages: Message[] | null }>(
    ctx,
    `/api/v1/conversations/${convId}/messages`,
  )
  return r.messages ?? []
}

export async function sendMessage(ctx: MargotCtx, convId: string, text: string) {
  return call<{ provider_id: string }>(ctx, `/api/v1/conversations/${convId}/send`, {
    method: "POST",
    body: JSON.stringify({ text }),
  })
}

export async function handoff(ctx: MargotCtx, convId: string, mode: "bot" | "human" = "human") {
  return call<{ ok: boolean; mode: string }>(ctx, `/api/v1/conversations/${convId}/handoff`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  })
}

export async function getConfig(ctx: MargotCtx): Promise<AgentConfig> {
  return call<AgentConfig>(ctx, "/api/v1/config")
}

export async function putConfig(ctx: MargotCtx, cfg: AgentConfig) {
  return call<{ ok: boolean }>(ctx, "/api/v1/config", { method: "PUT", body: JSON.stringify(cfg) })
}

/** Vincula (cria/edita) o canal do tenant a uma instância do Evolution. */
export async function bindChannel(ctx: MargotCtx, binding: ChannelBinding) {
  return call<{ ok: boolean }>(ctx, "/api/v1/channel", {
    method: "PUT",
    body: JSON.stringify(binding),
  })
}

/** Gera um novo segredo de webhook para a instância do tenant (mostrado uma vez). */
export async function rotateWebhookSecret(ctx: MargotCtx): Promise<WebhookSecret> {
  return call<WebhookSecret>(ctx, "/api/v1/channel/rotate-webhook-secret", { method: "POST" })
}

/** Provisiona a instância do WhatsApp e devolve o QR para escanear (self-serve). */
export async function connectChannel(ctx: MargotCtx): Promise<QRResponse> {
  return call<QRResponse>(ctx, "/api/v1/channel/connect", { method: "POST" })
}

/** Estado da conexão do WhatsApp (o console faz polling durante o onboarding). */
export async function channelStatus(ctx: MargotCtx): Promise<ChannelStatus> {
  return call<ChannelStatus>(ctx, "/api/v1/channel/status")
}

export async function getSetup(ctx: MargotCtx): Promise<SetupStatus> {
  return call<SetupStatus>(ctx, "/api/v1/setup")
}
