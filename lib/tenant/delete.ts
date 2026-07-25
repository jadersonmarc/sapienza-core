import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { schemaName } from "@/lib/provisioning/activate"
import { cancelProviderSubscriptions } from "@/lib/provisioning/cancel"

// Exclusão DEFINITIVA de um tenant (super-admin). Remove o data plane (schema
// tenant_<id>) e as linhas de control-plane. Destrutivo e irreversível.
//
// FKs em public.* são ON DELETE CASCADE (memberships, subscriptions, invoices,
// usage_counters, product_endpoints) — deletar o tenant leva tudo junto; o
// audit_log fica com tenant_id nulo (histórico preservado). O owner (users) é
// removido só se não pertencer a nenhum outro tenant.

export async function deleteTenant(tenantId: string): Promise<boolean> {
  const schema = schemaName(tenantId)
  // Antes de destruir: para a cobrança recorrente no cartão (Asaas). Best-effort;
  // fora da tx porque é chamada externa.
  await cancelProviderSubscriptions(tenantId)
  return db.transaction(async (tx) => {
    // Usuários ligados a este tenant (para limpar os que ficarem órfãos).
    const users = (await tx.execute(sql`
      SELECT user_id FROM public.memberships WHERE tenant_id = ${tenantId}::uuid
    `)) as unknown as { user_id: string }[]

    const del = (await tx.execute(sql`
      DELETE FROM public.tenants WHERE id = ${tenantId}::uuid RETURNING id
    `)) as unknown as { id: string }[]
    if (del.length === 0) return false // não existe

    // Data plane (tabelas do Margot/Motor) — pode não existir se nunca provisionou.
    await tx.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`))

    // Remove os usuários que ficaram sem nenhum vínculo (as memberships já caíram
    // no cascade). Nunca apaga superadmin.
    for (const u of users) {
      await tx.execute(sql`
        DELETE FROM public.users
         WHERE id = ${u.user_id}::uuid AND is_superadmin = false
           AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = ${u.user_id}::uuid)
      `)
    }
    return true
  })
}
