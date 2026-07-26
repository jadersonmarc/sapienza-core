import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { paymentProvider } from "@/lib/payments/asaas"
import type { ProdutoId } from "@/lib/pricing/load"

/**
 * Cancela as assinaturas recorrentes no provedor (Asaas) do tenant — para de
 * cobrar o cartão. Best-effort: falha de rede não impede o cancelamento local.
 * Filtra por `produto` quando informado.
 */
export async function cancelProviderSubscriptions(tenantId: string, produto?: ProdutoId): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT provider_sub_id FROM public.subscriptions
     WHERE tenant_id = ${tenantId}::uuid AND provider_sub_id IS NOT NULL
       AND (${produto ?? null}::text IS NULL OR produto = ${produto ?? null})
  `)) as unknown as { provider_sub_id: string }[]
  if (rows.length === 0) return
  const provider = paymentProvider()
  if (!provider.configured()) return
  // Combo: margot e motor compartilham a MESMA recorrência (mesmo provider_sub_id) —
  // deduplica para não cancelar a mesma assinatura duas vezes no Asaas.
  const ids = [...new Set(rows.map((r) => r.provider_sub_id))]
  for (const id of ids) {
    try {
      await provider.cancelSubscription(id)
    } catch (e) {
      console.error("[cancel] falha ao cancelar assinatura no Asaas:", id, e)
    }
  }
}

// Cancelamento MANUAL de assinatura (feito pelo superadmin quando o cliente pede
// por contato). Marca `canceled`: o gating dos produtos passa a bloquear (canOperate
// exige `active`) e o fechamento mensal ignora (só fecha `active`). A multa de
// fidelidade, se houver, é combinada/cobrada à parte pelo superadmin — não aqui.
//
// ATENÇÃO combo: margot e motor de um combo compartilham UMA recorrência. Cancelar
// só um produto derruba a cobrança do outro (mesmo provider_sub_id). Por ora, trate
// combo como cancelamento de CONTA (cancelAllSubscriptions).

export async function cancelSubscription(tenantId: string, produto: ProdutoId): Promise<boolean> {
  await cancelProviderSubscriptions(tenantId, produto)
  const rows = (await db.execute(sql`
    UPDATE public.subscriptions
       SET status = 'canceled', updated_at = now()
     WHERE tenant_id = ${tenantId}::uuid AND produto = ${produto} AND status <> 'canceled'
     RETURNING id
  `)) as unknown as { id: string }[]
  return rows.length > 0
}

/** Cancela a CONTA: todas as assinaturas do tenant de uma vez (bloqueia o acesso
 *  a todos os produtos). Devolve quantas foram canceladas. */
export async function cancelAllSubscriptions(tenantId: string): Promise<number> {
  await cancelProviderSubscriptions(tenantId)
  const rows = (await db.execute(sql`
    UPDATE public.subscriptions
       SET status = 'canceled', updated_at = now()
     WHERE tenant_id = ${tenantId}::uuid AND status <> 'canceled'
     RETURNING id
  `)) as unknown as { id: string }[]
  return rows.length
}
