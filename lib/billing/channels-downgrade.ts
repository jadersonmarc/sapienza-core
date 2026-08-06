import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"
import { tierRank } from "@/lib/billing/seats"
import { issueProductToken } from "@/lib/auth/product-jwt"
import type { ProdutoId } from "@/lib/pricing/load"

// Consulta os canais sociais conectados no motor. Chamada MÍNIMA e auto-contida (só
// token + fetch) de propósito: NÃO importa lib/motor/client, que puxa NextAuth no
// topo e envenenaria o grafo de imports do provisioning sob teste. UNCOUNTED espelha
// lib/channels/types do motor (blog/wordpress/webhook fora da contagem).
const UNCOUNTED = ["blog", "wordpress", "webhook"]

async function socialConnected(tenantId: string, ownerId: string): Promise<number> {
  const base = (process.env.MOTOR_API_URL ?? "http://localhost:3100").replace(/\/$/, "")
  const token = await issueProductToken({ userId: ownerId, tenantId, produto: "motor", role: "owner" })
  const res = await fetch(`${base}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`motor channels: ${res.status}`)
  const body = (await res.json()) as {
    used?: number
    channels?: { platform: string; enabled: boolean }[]
  }
  if (typeof body.used === "number") return body.used
  return (body.channels ?? []).filter((c) => !UNCOUNTED.includes(c.platform)).length
}

// Bloqueio de downgrade por CANAIS (análogo ao de seats, lib/provisioning/activate.ts).
// Canais sociais são capability de plano (plans.canais). Reduzir o tier do MOTOR abaixo
// do nº de canais sociais já conectados quebraria publicação de cliente ativo — então
// travamos o downgrade até o cliente desconectar o excedente (a escolha é DELE; nunca
// desconectamos por heurística). Grandfather de quem já está acima do limite fica a
// cargo do motor (só barra novas conexões, não desconecta).

export class ChannelDowngradeError extends Error {
  code = "DOWNGRADE_BLOCKED_BY_CHANNELS" as const
  constructor(message: string) {
    super(message)
    this.name = "ChannelDowngradeError"
  }
}

/** Owner do tenant (para montar o MotorCtx da consulta ao BFF). null se não houver. */
async function ownerOf(tenantId: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    SELECT user_id FROM public.memberships
    WHERE tenant_id = ${tenantId}::uuid AND role = 'owner'
    ORDER BY created_at LIMIT 1
  `)) as unknown as { user_id: string }[]
  return rows[0]?.user_id ?? null
}

/** canais permitidos por um tier do motor (plans.canais). */
async function channelsForTier(tier: string): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COALESCE(canais, 0) AS canais FROM public.plans
     WHERE produto = 'motor' AND tier = ${tier} LIMIT 1
  `)) as unknown as { canais: number }[]
  return rows[0]?.canais ?? 0
}

/**
 * Recusa a efetivação de um downgrade do MOTOR quando o tenant tem mais canais
 * sociais conectados do que o novo tier permite. Só age em downgrade de tier do
 * motor; upgrades/novos/outros produtos passam direto. Fail-closed: se não der para
 * consultar os canais, o downgrade é recusado (o superadmin repete).
 */
export async function assertChannelsAllowDowngrade(
  tenantId: string,
  produto: ProdutoId,
  toTier: string,
): Promise<void> {
  if (produto !== "motor") return

  const [current] = (await db.execute(sql`
    SELECT tier FROM public.subscriptions
    WHERE tenant_id = ${tenantId}::uuid AND produto = 'motor' AND status = 'active'
  `)) as unknown as { tier: string }[]
  if (!current) return // sem assinatura motor ativa → não é downgrade
  if (tierRank(toTier) >= tierRank(current.tier)) return // upgrade ou mesmo tier

  const limit = await channelsForTier(toTier)

  const owner = await ownerOf(tenantId)
  if (!owner) return // sem owner p/ consultar; nada a barrar (tenant sem operador)

  let used: number
  try {
    used = await socialConnected(tenantId, owner)
  } catch {
    // Fail-closed: não conseguimos verificar → não arriscamos quebrar publicação.
    throw new ChannelDowngradeError(
      "não foi possível verificar os canais conectados agora; tente novamente em instantes.",
    )
  }

  if (used > limit) {
    await db.transaction(async (tx) => {
      await emitEvent(tx, {
        type: "ChannelDowngradeBlocked",
        tenantId,
        produto,
        payload: { tenant_id: tenantId, from: current.tier, to: toTier, used, limit },
      })
    })
    throw new ChannelDowngradeError(
      `O plano ${toTier} permite ${limit} canal(is) social(is), mas há ${used} conectado(s). ` +
        `Desconecte ${used - limit} em Canais para concluir a redução.`,
    )
  }
}
