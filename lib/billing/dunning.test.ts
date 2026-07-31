import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import postgres from "postgres"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// Testa o dunning (grace 3 dias): transições de estágio por dias desde o
// vencimento, bloqueio no dia 3, cancelamento no dia 15, idempotência e reset ao
// pagar. Requer TEST_DATABASE_URL; pula caso ausente.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

maybe("dunning (inadimplência)", () => {
  let raw: ReturnType<typeof postgres>
  let runDunning: typeof import("@/lib/billing/dunning")["runDunning"]
  let applyPaymentReceived: typeof import("@/lib/billing/reconcile")["applyPaymentReceived"]

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    ;({ runDunning } = await import("@/lib/billing/dunning"))
    ;({ applyPaymentReceived } = await import("@/lib/billing/reconcile"))
  })

  afterAll(async () => {
    await raw?.end()
  })

  beforeEach(async () => {
    await raw`TRUNCATE public.event_outbox RESTART IDENTITY CASCADE`
    await raw`DELETE FROM public.audit_log`
    await raw`DELETE FROM public.subscriptions`
    await raw`DELETE FROM public.invoices`
    await raw`DELETE FROM public.tenants`
  })

  const DUE = "2026-07-01"
  const day = (n: number) => new Date(`2026-07-${String(1 + n).padStart(2, "0")}T12:00:00.000Z`)

  // Cria tenant + assinatura active + fatura overdue vencida em DUE. Retorna invoiceId.
  async function overdueTenant(): Promise<{ tenantId: string; invoiceId: string }> {
    const [t] = await raw<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug) VALUES ('T', ${"t-" + Math.random().toString(36).slice(2)}) RETURNING id`
    await raw`INSERT INTO public.subscriptions (tenant_id, produto, tier, status)
              VALUES (${t.id}::uuid, 'motor', 'pro', 'active')`
    const [inv] = await raw<{ id: string }[]>`
      INSERT INTO public.invoices (tenant_id, period, status, total_brl, due_date, payment_url)
      VALUES (${t.id}::uuid, '2026-07', 'overdue', 700, ${DUE}::date, 'https://pay/x') RETURNING id`
    return { tenantId: t.id, invoiceId: inv.id }
  }

  const stageOf = async (id: string) =>
    Number((await raw<{ dunning_stage: number }[]>`SELECT dunning_stage FROM public.invoices WHERE id=${id}::uuid`)[0].dunning_stage)
  const subStatus = async (tid: string) =>
    (await raw<{ status: string }[]>`SELECT status FROM public.subscriptions WHERE tenant_id=${tid}::uuid`)[0].status
  const eventTypes = async () =>
    (await raw<{ type: string }[]>`SELECT type FROM public.event_outbox ORDER BY id`).map((r) => r.type)

  it("dia 0 → estágio 1 (venceu), acesso mantido", async () => {
    const { tenantId, invoiceId } = await overdueTenant()
    await runDunning(day(0))
    expect(await stageOf(invoiceId)).toBe(1)
    expect(await subStatus(tenantId)).toBe("active") // grace: não bloqueia
    expect(await eventTypes()).toContain("InvoiceOverdue")
  })

  it("dia 3 → bloqueia (past_due) e emite estágios 1..3", async () => {
    const { tenantId, invoiceId } = await overdueTenant()
    await runDunning(day(3))
    expect(await stageOf(invoiceId)).toBe(3)
    expect(await subStatus(tenantId)).toBe("past_due")
    const types = await eventTypes()
    expect(types).toEqual(expect.arrayContaining(["InvoiceOverdue", "BlockImminent", "SubscriptionBlocked"]))
  })

  it("dia 15 → cancela a assinatura", async () => {
    const { tenantId, invoiceId } = await overdueTenant()
    await runDunning(day(15))
    expect(await stageOf(invoiceId)).toBe(4)
    expect(await subStatus(tenantId)).toBe("canceled")
    expect(await eventTypes()).toContain("SubscriptionCanceled")
  })

  it("idempotente: rodar de novo no mesmo dia não re-emite", async () => {
    const { invoiceId } = await overdueTenant()
    await runDunning(day(3))
    const before = (await eventTypes()).length
    const r = await runDunning(day(3))
    expect(r.advanced).toHaveLength(0)
    expect((await eventTypes()).length).toBe(before)
    expect(await stageOf(invoiceId)).toBe(3)
  })

  it("pagar zera o dunning e tira da varredura", async () => {
    const { invoiceId } = await overdueTenant()
    await runDunning(day(2))
    expect(await stageOf(invoiceId)).toBe(2)
    // Paga a fatura (reconcile) → paid + dunning_stage 0.
    const ok = await applyPaymentReceived(null, invoiceId)
    expect(ok).toBe(true)
    expect(await stageOf(invoiceId)).toBe(0)
    const r = await runDunning(day(5)) // não deve mais avançar (não é mais overdue)
    expect(r.advanced).toHaveLength(0)
  })
})
