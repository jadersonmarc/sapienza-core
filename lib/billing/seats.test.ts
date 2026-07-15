import { describe, it, expect, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Testa seats (limite por maior tier ativo; contagem excluindo super-admin),
// add-member com o gate, e o bloqueio de downgrade. Requer TEST_DATABASE_URL.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("seats por plano", () => {
  let raw: ReturnType<typeof postgres>
  let seats: typeof import("@/lib/billing/seats")
  let members: typeof import("@/lib/tenant/members")
  let provisioning: typeof import("@/lib/provisioning/activate")

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of ["0000_control_plane.sql", "0001_product_rules_usage_agg.sql"]) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    seats = await import("@/lib/billing/seats")
    members = await import("@/lib/tenant/members")
    provisioning = await import("@/lib/provisioning/activate")
  })

  afterAll(async () => {
    await raw?.end()
  })

  async function newTenant(slug: string): Promise<string> {
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug) VALUES (${slug}, ${slug}) RETURNING id`
    return t.id
  }

  async function sub(tenantId: string, produto: string, tier: string, status = "active") {
    await raw`INSERT INTO public.subscriptions (tenant_id, produto, tier, status)
              VALUES (${tenantId}::uuid, ${produto}, ${tier}, ${status})
              ON CONFLICT (tenant_id, produto) DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status`
  }

  async function member(tenantId: string, email: string, role: string, superadmin = false) {
    const [u] = await raw<{ id: string }[]>`
      INSERT INTO public.users (email, password_hash, is_superadmin)
      VALUES (${email}, 'x', ${superadmin})
      ON CONFLICT (email) DO UPDATE SET is_superadmin = EXCLUDED.is_superadmin RETURNING id`
    await raw`INSERT INTO public.memberships (user_id, tenant_id, role)
              VALUES (${u.id}::uuid, ${tenantId}::uuid, ${role})
              ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`
    return u.id
  }

  it("limite = maior tier ativo entre produtos; super-admin não conta", async () => {
    const t = await newTenant("seats-a")
    await sub(t, "margot", "start")
    await sub(t, "motor", "pro") // maior tier ativo = pro → 3 seats
    await member(t, "owner-a@x.com", "owner")
    await member(t, "admin-a@x.com", "admin")
    await member(t, "sup-a@x.com", "member", true) // super-admin não conta

    expect(await seats.seatsLimit(t)).toBe(3)
    expect(await seats.seatsUsed(t)).toBe(2)
    const usage = await seats.seatsUsage(t)
    expect(usage).toMatchObject({ used: 2, limit: 3, atCap: false, tier: "pro" })
  })

  it("sem assinatura ativa → limite start (1)", async () => {
    const t = await newTenant("seats-b")
    await sub(t, "margot", "pro", "canceled") // inativa não conta
    expect(await seats.seatsLimit(t)).toBe(1)
  })

  it("add-member bloqueia no teto com SEAT_LIMIT_REACHED", async () => {
    const t = await newTenant("seats-c")
    await sub(t, "margot", "pro") // limite 3
    await member(t, "owner-c@x.com", "owner") // used = 1

    await members.addMember({ tenantId: t, email: "u2-c@x.com", role: "member" })
    await members.addMember({ tenantId: t, email: "u3-c@x.com", role: "member" })
    expect(await seats.seatsUsed(t)).toBe(3)

    await expect(members.addMember({ tenantId: t, email: "u4-c@x.com", role: "member" })).rejects.toMatchObject({
      code: "SEAT_LIMIT_REACHED",
    })
    // Repromover um membro existente não consome seat novo.
    await expect(members.addMember({ tenantId: t, email: "u3-c@x.com", role: "admin" })).resolves.toBeTruthy()
    expect(await seats.seatsUsed(t)).toBe(3)
  })

  it("downgrade bloqueado quando excede o limite do novo tier", async () => {
    const t = await newTenant("seats-d")
    await sub(t, "margot", "pro") // limite 3
    await member(t, "owner-d@x.com", "owner")
    await member(t, "u2-d@x.com", "member")
    await member(t, "u3-d@x.com", "member") // used = 3

    // pro → start baixaria o limite para 1 < 3 usuários → bloqueia.
    await expect(
      provisioning.activateSubscription({ tenantId: t, produto: "margot", tier: "start" }),
    ).rejects.toMatchObject({ code: "DOWNGRADE_BLOCKED_BY_SEATS" })

    // Continua em pro (mudança não efetivada).
    const [s] = await raw<{ tier: string }[]>`
      SELECT tier FROM public.subscriptions WHERE tenant_id = ${t}::uuid AND produto = 'margot'`
    expect(s.tier).toBe("pro")
  })
})
