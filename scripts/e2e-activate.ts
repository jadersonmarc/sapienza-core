import { activateSubscription } from "@/lib/provisioning/activate"

// Utilitário de verificação e2e: ativa uma assinatura de produto (default motor/pro)
// para um ou mais tenants, exercendo o caminho REAL de provisioning do core
// (upsert em subscriptions + CREATE SCHEMA + SubscriptionActivated no outbox).
//
//   DATABASE_URL=... tsx scripts/e2e-activate.ts <tenantId> [tenantId...] [--produto motor] [--tier pro]
async function main() {
  const args = process.argv.slice(2)
  const tenants: string[] = []
  let produto = "motor"
  let tier = "pro"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--produto") produto = args[++i]
    else if (args[i] === "--tier") tier = args[++i]
    else tenants.push(args[i])
  }
  if (tenants.length === 0) throw new Error("informe ao menos um tenantId")

  for (const tenantId of tenants) {
    const { schema } = await activateSubscription({
      tenantId,
      produto: produto as "motor" | "margot",
      tier,
    })
    console.log(`ativado ${produto}/${tier} para ${tenantId} → ${schema}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("e2e-activate falhou:", e)
  process.exit(1)
})
