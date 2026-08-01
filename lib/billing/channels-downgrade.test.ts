import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import postgres from "postgres"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Testa o bloqueio de downgrade por CANAIS (análogo ao de seats). A chamada ao motor
// é um fetch auto-contido — mockamos o fetch global para controlar quantos sociais
// estão conectados (mockUsed). Requer TEST_DATABASE_URL.

let mockUsed = 0
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ used: mockUsed, channels: [] }), { status: 200 })),
)

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("bloqueio de downgrade por canais", () => {
  let raw: ReturnType<typeof postgres>
  let mod: typeof import("@/lib/billing/channels-downgrade")

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    process.env.PRODUCT_JWT_SECRET = "test-secret-para-o-harness"
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of ["0000_control_plane.sql", "0001_product_rules_usage_agg.sql"]) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    // Capability de canais por tier do motor (start 1 / pro 2 / scale 3).
    for (const [tier, canais] of [["start", 1], ["pro", 2], ["scale", 3]] as const) {
      await raw`INSERT INTO public.plans (produto, tier, metric, mensal, incluso, canais, excedente_unitario, piso)
                VALUES ('motor', ${tier}, 'peca', 100, 10, ${canais}, 1, 0)`
    }
    mod = await import("@/lib/billing/channels-downgrade")
  })

  afterAll(async () => {
    await raw?.end()
  })

  async function tenantWithMotor(tier: string): Promise<string> {
    const slug = "cd-" + Math.random().toString(36).slice(2)
    const [t] = await raw<{ id: string }[]>`INSERT INTO public.tenants (name, slug) VALUES (${slug}, ${slug}) RETURNING id`
    await raw`INSERT INTO public.subscriptions (tenant_id, produto, tier, status) VALUES (${t.id}::uuid, 'motor', ${tier}, 'active')`
    const [u] = await raw<{ id: string }[]>`INSERT INTO public.users (email, password_hash) VALUES (${slug + "@x.com"}, 'x') RETURNING id`
    await raw`INSERT INTO public.memberships (user_id, tenant_id, role) VALUES (${u.id}::uuid, ${t.id}::uuid, 'owner')`
    return t.id
  }

  it("pro→start com 2 sociais conectados: bloqueia pedindo desconectar 1", async () => {
    const t = await tenantWithMotor("pro")
    mockUsed = 2
    await expect(mod.assertChannelsAllowDowngrade(t, "motor", "start")).rejects.toBeInstanceOf(mod.ChannelDowngradeError)
    // Emitiu o evento de bloqueio.
    const [ev] = await raw<{ payload: { used: number; limit: number } }[]>`
      SELECT payload FROM public.event_outbox WHERE type = 'ChannelDowngradeBlocked' AND tenant_id = ${t}::uuid`
    expect(ev.payload.used).toBe(2)
    expect(ev.payload.limit).toBe(1)
  })

  it("pro→start dentro do limite (1 conectado): passa", async () => {
    const t = await tenantWithMotor("pro")
    mockUsed = 1
    await expect(mod.assertChannelsAllowDowngrade(t, "motor", "start")).resolves.toBeUndefined()
  })

  it("upgrade (start→pro) nunca é barrado, mesmo com muitos canais", async () => {
    const t = await tenantWithMotor("start")
    mockUsed = 5
    await expect(mod.assertChannelsAllowDowngrade(t, "motor", "pro")).resolves.toBeUndefined()
  })

  it("produto que não é motor passa direto", async () => {
    const t = await tenantWithMotor("pro")
    mockUsed = 9
    await expect(mod.assertChannelsAllowDowngrade(t, "margot", "start")).resolves.toBeUndefined()
  })
})
