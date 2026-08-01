import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// Reset de senha + verificação de e-mail: token single-use, bump de sessão, e o
// link sai no evento do outbox (não inline). Requer TEST_DATABASE_URL; pula se ausente.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("conta: reset de senha + verificação de e-mail", () => {
  let raw: ReturnType<typeof postgres>
  let acc: typeof import("@/lib/auth/account")

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    acc = await import("@/lib/auth/account")
  })

  afterAll(async () => {
    await raw?.end()
  })

  beforeEach(async () => {
    await raw`TRUNCATE public.event_outbox RESTART IDENTITY CASCADE`
    await raw`DELETE FROM public.auth_tokens`
    await raw`DELETE FROM public.users`
  })

  async function user(email = "u@x.com"): Promise<string> {
    const [u] = await raw<{ id: string }[]>`
      INSERT INTO public.users (email, password_hash, session_version) VALUES (${email}, 'old', 0) RETURNING id`
    return u.id
  }
  // Extrai o ?token= do link no payload do último evento de `type`.
  async function tokenFrom(type: string): Promise<string> {
    const [ev] = await raw<{ payload: { link: string } }[]>`
      SELECT payload FROM public.event_outbox WHERE type = ${type} ORDER BY id DESC LIMIT 1`
    return new URL(ev.payload.link).searchParams.get("token")!
  }

  it("reset: emite evento com link, aplica a senha e bumpa a sessão; token é single-use", async () => {
    await user("reset@x.com")
    await acc.requestPasswordReset("reset@x.com")
    const token = await tokenFrom("PasswordResetRequested")

    const r = await acc.resetPassword(token, "SenhaForte1")
    expect(r.ok).toBe(true)
    const [u] = await raw<{ session_version: number; password_hash: string }[]>`
      SELECT session_version, password_hash FROM public.users WHERE email='reset@x.com'`
    expect(Number(u.session_version)).toBe(1) // bump derruba sessões antigas
    expect(u.password_hash).not.toBe("old")

    // token já usado → não reaproveita
    expect((await acc.resetPassword(token, "OutraForte2")).ok).toBe(false)
  })

  it("reset: senha fraca é recusada", async () => {
    await user("fraca@x.com")
    await acc.requestPasswordReset("fraca@x.com")
    const token = await tokenFrom("PasswordResetRequested")
    expect((await acc.resetPassword(token, "curta")).ok).toBe(false)
  })

  it("reset: e-mail inexistente não emite evento (anti-enumeração)", async () => {
    await acc.requestPasswordReset("naoexiste@x.com")
    const [{ n }] = await raw<{ n: number }[]>`SELECT count(*)::int n FROM public.event_outbox`
    expect(Number(n)).toBe(0)
  })

  it("verificação: token confirma o e-mail e é single-use", async () => {
    const id = await user("verif@x.com")
    await acc.requestEmailVerification(id, "verif@x.com")
    const token = await tokenFrom("EmailVerificationRequested")

    expect(await acc.verifyEmail(token)).toBe(true)
    const [u] = await raw<{ email_verified_at: string | null }[]>`
      SELECT email_verified_at FROM public.users WHERE id=${id}::uuid`
    expect(u.email_verified_at).not.toBeNull()
    expect(await acc.verifyEmail(token)).toBe(false) // já usado
  })
})
