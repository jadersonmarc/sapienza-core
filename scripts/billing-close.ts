import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { closeTenantInvoice } from "@/lib/billing/close"

// Fecha o período para todos os tenants com assinatura ativa.
//   pnpm billing:close -- --period 2026-07

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const period = arg("period") ?? new Date().toISOString().slice(0, 7)
  const rows = (await db.execute(sql`
    SELECT DISTINCT tenant_id FROM public.subscriptions WHERE status = 'active'
  `)) as unknown as { tenant_id: string }[]

  for (const r of rows) {
    const { total } = await closeTenantInvoice(r.tenant_id, period)
    console.log(`invoice ${r.tenant_id} ${period} = R$ ${total.toFixed(2)}`)
  }
  console.log(`billing:close — ${rows.length} faturas fechadas para ${period}.`)
  process.exit(0)
}

main().catch((e) => {
  console.error("billing:close falhou:", e)
  process.exit(1)
})
