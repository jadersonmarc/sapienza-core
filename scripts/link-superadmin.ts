import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// Garante o tenant interno "Sapienza" e vincula TODO superadmin como owner dele.
// Idempotente; roda no boot (Dockerfile), como migrate/pricing/coupons.
//
// Motivo: o layout do console só renderiza nav/conteúdo com um tenant ATIVO
// (lib/tenant/context.activeTenant). Um superadmin sem nenhum tenant acessível
// cai em "SEM ACESSO" — e num sistema ainda sem tenants (instalação nova) não
// conseguiria nem abrir o /super para criar o primeiro. Dar um tenant interno
// resolve o bootstrap e ainda dá ao superadmin um "lar" estável (em vez de cair
// no tenant de um cliente por padrão).

async function main(): Promise<void> {
  const [tenant] = (await db.execute(sql`
    INSERT INTO public.tenants (name, slug) VALUES ('Sapienza', 'sapienza')
    ON CONFLICT (slug) DO UPDATE SET name = public.tenants.name
    RETURNING id
  `)) as unknown as { id: string }[]

  await db.execute(sql`
    INSERT INTO public.memberships (user_id, tenant_id, role)
    SELECT u.id, ${tenant.id}::uuid, 'owner'
      FROM public.users u
     WHERE u.is_superadmin = true
    ON CONFLICT (user_id, tenant_id) DO NOTHING
  `)

  const [n] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM public.memberships m
      JOIN public.users u ON u.id = m.user_id
     WHERE m.tenant_id = ${tenant.id}::uuid AND u.is_superadmin = true
  `)) as unknown as { n: number }[]
  console.log(`tenant Sapienza (${tenant.id}) — ${n?.n ?? 0} superadmin(s) vinculado(s)`)
  process.exit(0)
}

main().catch((e) => {
  console.error("link-superadmin falhou:", e)
  process.exit(1)
})
