import { describe, it, expect, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Testa o trigger de agregação (UsageRecorded -> usage_counters) exercitando o
// caminho REAL de emissão (lib/events/emit.ts, via drizzle). Requer
// TEST_DATABASE_URL; pula caso ausente.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("agregação de uso (control plane)", () => {
  let raw: ReturnType<typeof postgres>
  // db/emitEvent importados dinamicamente após DATABASE_URL estar setada.
  let db: typeof import("@/lib/db")["db"]
  let emitEvent: typeof import("@/lib/events/emit")["emitEvent"]

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn // lib/db é lazy; conecta só no 1º uso
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of ["0000_control_plane.sql", "0001_product_rules_usage_agg.sql"]) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    ;({ db } = await import("@/lib/db"))
    ;({ emitEvent } = await import("@/lib/events/emit"))
  })

  afterAll(async () => {
    await raw?.end()
  })

  async function usage(tenantId: string) {
    const rows = await raw<{ count: number }[]>`
      SELECT count FROM public.usage_counters
      WHERE tenant_id = ${tenantId}::uuid AND produto = 'margot'
        AND period = '2026-07' AND metric = 'conversa'`
    return rows[0]?.count ?? null
  }

  it("UsageRecorded no outbox incrementa usage_counters (acumulando)", async () => {
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug) VALUES ('T', 't-agg') RETURNING id`
    const tenantId = t.id

    const emit = (count: number) =>
      db.transaction((tx) =>
        emitEvent(tx, {
          type: "UsageRecorded",
          tenantId,
          produto: "margot",
          payload: { tenant_id: tenantId, produto: "margot", metric: "conversa", period: "2026-07", count },
        }),
      )

    await emit(1)
    await emit(2)
    expect(await usage(tenantId)).toBe(3)
  })

  it("eventos não-UsageRecorded não afetam usage_counters", async () => {
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug) VALUES ('T2', 't-noop') RETURNING id`
    await db.transaction((tx) =>
      emitEvent(tx, { type: "TenantProvisioned", tenantId: t.id, payload: { tenant_id: t.id, schema: "x" } }),
    )
    const rows = await raw`SELECT 1 FROM public.usage_counters WHERE tenant_id = ${t.id}::uuid`
    expect(rows.length).toBe(0)
  })
})
