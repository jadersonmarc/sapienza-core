import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// Testa o consumer `mailer`: drena o event_outbox, envia 1 e-mail por evento que
// gera e-mail, resolve o destinatário (owner do tenant ou email do payload) e é
// idempotente (não reenvia). Requer TEST_DATABASE_URL; pula caso ausente.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("consumer de e-mail (mailer)", () => {
  let raw: ReturnType<typeof postgres>
  let db: typeof import("@/lib/db")["db"]
  let emitEvent: typeof import("@/lib/events/emit")["emitEvent"]
  let dispatchAll: typeof import("@/lib/email/consumer")["dispatchAll"]
  let setMailer: typeof import("@/lib/email/mailer")["setMailer"]
  let FakeMailer: typeof import("@/lib/email/mailer")["FakeMailer"]
  let fake: InstanceType<typeof import("@/lib/email/mailer")["FakeMailer"]>

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    ;({ db } = await import("@/lib/db"))
    ;({ emitEvent } = await import("@/lib/events/emit"))
    ;({ dispatchAll } = await import("@/lib/email/consumer"))
    ;({ setMailer, FakeMailer } = await import("@/lib/email/mailer"))
  })

  afterAll(async () => {
    setMailer(null)
    await raw?.end()
  })

  beforeEach(async () => {
    // Zera outbox/cursor/entregas entre casos; mailer fake novo.
    await raw`TRUNCATE public.event_outbox RESTART IDENTITY CASCADE`
    await raw`DELETE FROM public.email_deliveries`
    await raw`DELETE FROM bus.event_cursors WHERE consumer = 'mailer'`
    await raw`DELETE FROM public.memberships`
    await raw`DELETE FROM public.users`
    await raw`DELETE FROM public.tenants`
    fake = new FakeMailer()
    setMailer(fake)
  })

  async function tenantWithOwner(email: string): Promise<string> {
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug) VALUES ('T', ${"t-" + Math.random().toString(36).slice(2)}) RETURNING id`
    const [u] = await raw<{ id: string }[]>`
      INSERT INTO public.users (email, password_hash) VALUES (${email}, 'x') RETURNING id`
    await raw`INSERT INTO public.memberships (user_id, tenant_id, role) VALUES (${u.id}::uuid, ${t.id}::uuid, 'owner')`
    return t.id
  }

  it("evento de cobrança → 1 e-mail ao owner do tenant; idempotente", async () => {
    const tid = await tenantWithOwner("owner@x.com")
    await db.transaction((tx) =>
      emitEvent(tx, { type: "PaymentReceived", tenantId: tid, payload: { period: "2026-07", total_brl: "700.00" } }),
    )

    expect(await dispatchAll()).toBe(1)
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0].to).toBe("owner@x.com")
    expect(fake.sent[0].subject).toMatch(/pagamento/i)

    // Rodar de novo NÃO reenvia (dedupe por email_deliveries + cursor).
    expect(await dispatchAll()).toBe(0)
    expect(fake.sent).toHaveLength(1)
  })

  it("usa o email do payload quando presente (WelcomeOwner)", async () => {
    const tid = await tenantWithOwner("owner2@x.com")
    await db.transaction((tx) =>
      emitEvent(tx, { type: "WelcomeOwner", tenantId: tid, payload: { email: "lead@x.com", needs_password_setup: false } }),
    )
    await dispatchAll()
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0].to).toBe("lead@x.com") // payload vence o owner
  })

  it("ContentPublishFailed (motor) → e-mail ao owner citando os canais que falharam", async () => {
    const tid = await tenantWithOwner("owner4@x.com")
    await db.transaction((tx) =>
      emitEvent(tx, {
        type: "ContentPublishFailed",
        tenantId: tid,
        payload: { item_id: "abc", title: "Minha peça", failures: [{ platform: "instagram", error: "429" }] },
      }),
    )
    await dispatchAll()
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0].to).toBe("owner4@x.com") // sem email no payload → owner do tenant
    expect(fake.sent[0].subject).toMatch(/falha/i)
    expect(fake.sent[0].html).toContain("instagram")
  })

  it("evento que não gera e-mail é ignorado, mas o cursor avança", async () => {
    const tid = await tenantWithOwner("owner3@x.com")
    await db.transaction((tx) => emitEvent(tx, { type: "InvoiceIssued", tenantId: tid, payload: { period: "2026-07" } }))
    await db.transaction((tx) =>
      emitEvent(tx, { type: "PaymentReceived", tenantId: tid, payload: { period: "2026-07", total_brl: "10.00" } }),
    )
    await dispatchAll()
    expect(fake.sent).toHaveLength(1) // só o PaymentReceived vira e-mail
    const [cur] = await raw<{ last_id: number }[]>`SELECT last_id FROM bus.event_cursors WHERE consumer='mailer'`
    expect(Number(cur.last_id)).toBe(2) // cursor passou pelos dois eventos
  })
})
