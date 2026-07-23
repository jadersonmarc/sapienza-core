import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import type { ProdutoId } from "@/lib/pricing/load"

// Cancelamento MANUAL de assinatura (feito pelo superadmin quando o cliente pede
// por contato). Marca `canceled`: o gating dos produtos passa a bloquear (canOperate
// exige `active`) e o fechamento mensal ignora (só fecha `active`). A multa de
// fidelidade, se houver, é combinada/cobrada à parte pelo superadmin — não aqui.

export async function cancelSubscription(tenantId: string, produto: ProdutoId): Promise<boolean> {
  const rows = (await db.execute(sql`
    UPDATE public.subscriptions
       SET status = 'canceled', updated_at = now()
     WHERE tenant_id = ${tenantId}::uuid AND produto = ${produto} AND status <> 'canceled'
     RETURNING id
  `)) as unknown as { id: string }[]
  return rows.length > 0
}
