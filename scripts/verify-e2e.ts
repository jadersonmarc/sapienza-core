import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { activateSubscription, schemaName } from "@/lib/provisioning/activate"
import { closeTenantInvoice } from "@/lib/billing/close"

// Verificação e2e do control plane: provisioning (schema + eventos) e billing.
// Uso: DATABASE_URL=... npx tsx scripts/verify-e2e.ts <tenantId>

async function main() {
  const tenantId = process.argv[2]
  if (!tenantId) throw new Error("passe o tenantId")
  const period = new Date().toISOString().slice(0, 7)
  let failures = 0
  const check = (name: string, ok: boolean, extra = "") => {
    console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`)
    if (!ok) failures++
  }

  // 1) Provisioning: ativa margot pro.
  const { schema } = await activateSubscription({ tenantId, produto: "margot", tier: "pro" })
  check("schemaName derivado", schema === schemaName(tenantId), schema)

  const [{ exists: schemaExists }] = (await db.execute(sql`
    SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = ${schema}) AS exists
  `)) as unknown as { exists: boolean }[]
  check("CREATE SCHEMA tenant_<id>", schemaExists)

  const events = (await db.execute(sql`
    SELECT type, produto FROM public.event_outbox
    WHERE tenant_id = ${tenantId}::uuid ORDER BY id
  `)) as unknown as { type: string; produto: string | null }[]
  check("evento TenantProvisioned", events.some((e) => e.type === "TenantProvisioned"))
  check(
    "evento SubscriptionActivated{margot}",
    events.some((e) => e.type === "SubscriptionActivated" && e.produto === "margot"),
  )

  // 2) Billing: uso acima do incluso (pro=1500) → excedente. Métrica margot = 'resposta'.
  await db.execute(sql`
    INSERT INTO public.usage_counters (tenant_id, produto, period, metric, count)
    VALUES (${tenantId}::uuid, 'margot', ${period}, 'resposta', 1700)
    ON CONFLICT (tenant_id, produto, period, metric) DO UPDATE SET count = EXCLUDED.count
  `)
  const { total, lines } = await closeTenantInvoice(tenantId, period)
  // margot pro mês 1: 700 + max(0,1700-1500)*0.50 = 700 + 100 = 800
  check("fatura margot pro c/ excedente", total === 800, `total=${total}`)
  check("linha excedente = 100", lines[0]?.excedente === 100, `excedente=${lines[0]?.excedente}`)

  const invEvent = (await db.execute(sql`
    SELECT 1 FROM public.event_outbox
    WHERE tenant_id = ${tenantId}::uuid AND type = 'InvoiceIssued'
  `)) as unknown as unknown[]
  check("evento InvoiceIssued", invEvent.length > 0)

  console.log(failures === 0 ? "\nOK — verificação e2e passou." : `\nFALHOU — ${failures} checagem(ns).`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error("verify-e2e falhou:", e)
  process.exit(1)
})
