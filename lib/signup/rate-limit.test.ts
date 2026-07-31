import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// Rate-limit do checkout: 5/IP e 3/e-mail por janela (defaults). Requer
// TEST_DATABASE_URL; pula caso ausente.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("rate-limit do checkout", () => {
  let raw: ReturnType<typeof postgres>
  let assertCheckoutAllowed: typeof import("@/lib/signup/rate-limit")["assertCheckoutAllowed"]
  let RateLimitError: typeof import("@/lib/signup/rate-limit")["RateLimitError"]

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    ;({ assertCheckoutAllowed, RateLimitError } = await import("@/lib/signup/rate-limit"))
  })

  afterAll(async () => {
    await raw?.end()
  })

  beforeEach(async () => {
    await raw`DELETE FROM public.checkout_attempts`
  })

  it("permite 5 tentativas por IP e bloqueia a 6ª", async () => {
    for (let i = 0; i < 5; i++) {
      await assertCheckoutAllowed("9.9.9.9", `p${i}@x.com`)
    }
    await expect(assertCheckoutAllowed("9.9.9.9", "p6@x.com")).rejects.toBeInstanceOf(RateLimitError)
  })

  it("permite 3 tentativas por e-mail (IPs distintos) e bloqueia a 4ª", async () => {
    for (let i = 0; i < 3; i++) {
      await assertCheckoutAllowed(`10.0.0.${i}`, "mesmo@x.com")
    }
    await expect(assertCheckoutAllowed("10.0.0.9", "mesmo@x.com")).rejects.toBeInstanceOf(RateLimitError)
  })

  it("e-mail é case-insensitive no limite", async () => {
    for (let i = 0; i < 3; i++) {
      await assertCheckoutAllowed(`11.0.0.${i}`, "Caps@X.com")
    }
    await expect(assertCheckoutAllowed("11.0.0.9", "caps@x.com")).rejects.toBeInstanceOf(RateLimitError)
  })
})
