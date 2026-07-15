import { cookies } from "next/headers"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"

// Resolução do tenant ativo no console (padrão de lib/agent/tenant.ts do spa).
// Superadmin Sapienza enxerga todos os tenants; demais, só onde têm membership.

export const ACTIVE_TENANT_COOKIE = "active_tenant"

export type TenantSummary = { id: string; name: string; slug: string; role: string | null }

/** Tenants acessíveis ao usuário. Superadmin vê todos; senão via memberships. */
export async function accessibleTenants(userId: string, isSuperadmin: boolean): Promise<TenantSummary[]> {
  if (isSuperadmin) {
    const rows = await db.select().from(schema.tenants).orderBy(schema.tenants.name)
    return rows.map((t) => ({ id: t.id, name: t.name, slug: t.slug, role: "superadmin" }))
  }
  const rows = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(schema.tenants.name)
  return rows
}

/** Tenant ativo: cookie se acessível, senão o primeiro acessível. */
export async function activeTenant(
  userId: string,
  isSuperadmin: boolean,
): Promise<TenantSummary | null> {
  const list = await accessibleTenants(userId, isSuperadmin)
  if (list.length === 0) return null
  const cookie = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value
  return list.find((t) => t.id === cookie) ?? list[0]
}

/** Assinaturas (produto/tier/status) de um tenant. */
export async function tenantSubscriptions(tenantId: string) {
  return db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, tenantId))
}

/** Membership role do usuário num tenant (null se não for membro). */
export async function roleInTenant(userId: string, tenantId: string): Promise<string | null> {
  const [m] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, tenantId)))
    .limit(1)
  return m?.role ?? null
}
