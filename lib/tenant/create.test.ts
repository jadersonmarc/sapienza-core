import { describe, it, expect, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import bcrypt from "bcryptjs"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { validatePasswordStrength } from "@/lib/auth/password"

// Onboarding pelo console: createTenant (tenant + owner + membership) e o
// happy-path do activateSubscription (schema + eventos). Requer TEST_DATABASE_URL.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("onboarding (superadmin)", () => {
  let raw: ReturnType<typeof postgres>
  let createTenant: typeof import("@/lib/tenant/create")["createTenant"]
  let activateSubscription: typeof import("@/lib/provisioning/activate")["activateSubscription"]

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of ["0000_control_plane.sql", "0001_product_rules_usage_agg.sql", "0002_billing_identity.sql", "0003_invoice_payment.sql"]) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    ;({ createTenant } = await import("@/lib/tenant/create"))
    ;({ activateSubscription } = await import("@/lib/provisioning/activate"))
  })
  afterAll(async () => {
    await raw?.end()
  })

  it("createTenant cria tenant + owner + membership com senha usável", async () => {
    const { tenantId, slug, ownerEmail, ownerPassword } = await createTenant({
      name: "Empresa Ação Ltda",
      ownerEmail: "  Dono@ACME.com ",
    })
    expect(slug).toBe("empresa-acao-ltda") // acento removido, minúsculo, hifens
    expect(ownerEmail).toBe("dono@acme.com") // normalizado
    expect(validatePasswordStrength(ownerPassword)).toBeNull() // senha forte

    const [tenant] = await raw<{ name: string }[]>`SELECT name FROM public.tenants WHERE id=${tenantId}::uuid`
    expect(tenant.name).toBe("Empresa Ação Ltda")

    const [u] = await raw<{ password_hash: string; is_superadmin: boolean }[]>`
      SELECT password_hash, is_superadmin FROM public.users WHERE email='dono@acme.com'`
    expect(u.is_superadmin).toBe(false)
    expect(await bcrypt.compare(ownerPassword, u.password_hash)).toBe(true) // a senha loga

    const [m] = await raw<{ role: string }[]>`
      SELECT m.role FROM public.memberships m
      JOIN public.users u ON u.id = m.user_id
      WHERE u.email='dono@acme.com' AND m.tenant_id=${tenantId}::uuid`
    expect(m.role).toBe("owner")
  })

  it("createTenant é idempotente por e-mail/slug (re-salvar não duplica)", async () => {
    const a = await createTenant({ name: "Repetido", ownerEmail: "rep@x.com" })
    const b = await createTenant({ name: "Repetido", ownerEmail: "rep@x.com" })
    expect(b.tenantId).toBe(a.tenantId)
    const [{ n }] = await raw<{ n: number }[]>`SELECT count(*)::int AS n FROM public.users WHERE email='rep@x.com'`
    expect(n).toBe(1)
  })

  it("activateSubscription ativa margot/pro: cria o schema e emite os eventos", async () => {
    // pricing mínimo para o gate de seats (lê plans no downgrade; upgrade/novo não bloqueia).
    await raw`INSERT INTO public.product_rules (produto, rules) VALUES ('margot','{}') ON CONFLICT DO NOTHING`
    const { tenantId } = await createTenant({ name: "Ativa", ownerEmail: "ativa@x.com" })

    const { schema } = await activateSubscription({ tenantId, produto: "margot", tier: "pro" })
    expect(schema).toMatch(/^tenant_[0-9a-f]{32}$/)

    const [sub] = await raw<{ status: string; tier: string }[]>`
      SELECT status, tier FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid AND produto='margot'`
    expect(sub.status).toBe("active")
    expect(sub.tier).toBe("pro")

    const [{ exists }] = await raw<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=${schema}) AS exists`
    expect(exists).toBe(true)

    const events = await raw<{ type: string }[]>`
      SELECT type FROM public.event_outbox WHERE tenant_id=${tenantId}::uuid ORDER BY id`
    expect(events.map((e) => e.type)).toEqual(["TenantProvisioned", "SubscriptionActivated"])
  })
})
