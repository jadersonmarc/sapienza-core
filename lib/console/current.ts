import { redirect } from "next/navigation"
import { eq, sql } from "drizzle-orm"
import { auth } from "@/auth"
import { db, schema } from "@/lib/db"
import { accessibleTenants, activeTenant, type TenantSummary } from "@/lib/tenant/context"
import { loadPricing } from "@/lib/pricing/load"

export type CurrentContext = {
  user: { id: string; email: string; isSuperadmin: boolean }
  tenants: TenantSummary[]
  active: TenantSummary | null
}

/** Exige login e resolve tenants acessíveis + tenant ativo. */
export async function currentContext(): Promise<CurrentContext> {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const user = {
    id: session.user.id,
    email: session.user.email ?? "",
    isSuperadmin: session.user.isSuperadmin ?? false,
  }
  // Revogação de sessão: o JWT carrega o session_version do login; se o valor no
  // banco divergir (bump manual), a sessão é inválida → força novo login. Checagem
  // no runtime Node (o callback edge não acessa o DB).
  const [row] = await db
    .select({ v: schema.users.sessionVersion })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1)
  if (!row || row.v !== (session.user.sessionVersion ?? 0)) redirect("/login")
  const tenants = await accessibleTenants(user.id, user.isSuperadmin)
  const active = await activeTenant(user.id, user.isSuperadmin)
  return { user, tenants, active }
}

export type ProductCard = {
  produto: "margot" | "motor"
  nome: string
  metric: string
  tier: string
  status: string
  incluso: number
  count: number
  excedenteUnitario: number
  hardCap: boolean
}

/** Cards dos produtos ASSINADOS pelo tenant, com uso do mês corrente. */
export async function subscribedProducts(tenantId: string): Promise<ProductCard[]> {
  const pricing = loadPricing()
  const period = new Date().toISOString().slice(0, 7)

  const subs = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, tenantId))

  const cards: ProductCard[] = []
  for (const s of subs) {
    const def = pricing.produtos[s.produto]
    const tier = def.tiers.find((t) => t.id === s.tier)

    // Uso do produto no período corrente (PK composta → SQL cru).
    const rows = (await db.execute(sql`
      SELECT count FROM public.usage_counters
      WHERE tenant_id = ${tenantId}::uuid AND produto = ${s.produto}
        AND period = ${period} AND metric = ${def.metric}
    `)) as unknown as { count: number }[]

    cards.push({
      produto: s.produto,
      nome: def.nome,
      metric: def.metric,
      tier: s.tier,
      status: s.status,
      incluso: tier?.incluso ?? 0,
      count: rows[0]?.count ?? 0,
      excedenteUnitario: def.excedente_unitario,
      hardCap: s.hardCap,
    })
  }
  return cards
}
