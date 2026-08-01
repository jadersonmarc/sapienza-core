import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// Histórico do assistente: persistência + a garantia de que um tenant/usuário
// NUNCA lê ou escreve a conversa de outro. Requer TEST_DATABASE_URL; pula se ausente.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("assistant chat store (escopo tenant×usuário)", () => {
  let raw: ReturnType<typeof postgres>
  let store: typeof import("@/lib/insights/store")

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    store = await import("@/lib/insights/store")
  })
  afterAll(async () => {
    await raw?.end()
  })

  let t1 = "", u1 = "", t2 = "", u2 = ""
  beforeEach(async () => {
    await raw`DELETE FROM public.assistant_conversations`
    await raw`DELETE FROM public.users`
    await raw`DELETE FROM public.tenants`
    ;[{ id: t1 }] = await raw<{ id: string }[]>`INSERT INTO public.tenants (name, slug) VALUES ('T1', ${"t1-" + Date.now()}) RETURNING id`
    ;[{ id: t2 }] = await raw<{ id: string }[]>`INSERT INTO public.tenants (name, slug) VALUES ('T2', ${"t2-" + Date.now()}) RETURNING id`
    ;[{ id: u1 }] = await raw<{ id: string }[]>`INSERT INTO public.users (email, password_hash) VALUES (${"u1-" + Date.now() + "@x.com"}, 'x') RETURNING id`
    ;[{ id: u2 }] = await raw<{ id: string }[]>`INSERT INTO public.users (email, password_hash) VALUES (${"u2-" + Date.now() + "@x.com"}, 'x') RETURNING id`
  })

  it("persiste e lê o próprio histórico em ordem", async () => {
    const conv = await store.createConversation(t1, u1, "como foi meu mês?")
    expect(await store.appendMessage(conv, t1, u1, "user", "como foi meu mês?")).toBe(true)
    expect(await store.appendMessage(conv, t1, u1, "assistant", "Foram 100 impressões.")).toBe(true)
    const msgs = await store.getMessages(conv, t1, u1)
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(msgs[1].content).toBe("Foram 100 impressões.")
    expect((await store.listConversations(t1, u1)).length).toBe(1)
  })

  it("outro tenant/usuário NÃO lê nem escreve a conversa", async () => {
    const conv = await store.createConversation(t1, u1, "privado")
    await store.appendMessage(conv, t1, u1, "user", "segredo")

    // t2/u2 não enxerga
    expect(await store.getMessages(conv, t2, u2)).toEqual([])
    expect((await store.listConversations(t2, u2)).length).toBe(0)
    // mesmo tenant, outro usuário, também não
    expect(await store.getMessages(conv, t1, u2)).toEqual([])

    // e não consegue escrever nela (guarda de posse)
    expect(await store.appendMessage(conv, t2, u2, "user", "invasão")).toBe(false)
    expect(await store.appendMessage(conv, t1, u2, "assistant", "invasão")).toBe(false)

    // o dono continua vendo só as suas 1 mensagem
    expect((await store.getMessages(conv, t1, u1)).length).toBe(1)
  })
})
