import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { loadPricing, pisoDe } from "@/lib/pricing/load"

// Valida config/pricing.yaml e materializa em public.plans (upsert idempotente).
// Fonte única de preço: produtos Go leem `plans` via kit; nunca chumbar preço.

async function main() {
  const pricing = loadPricing()
  const produtos = Object.entries(pricing.produtos) as [
    keyof typeof pricing.produtos,
    (typeof pricing.produtos)[keyof typeof pricing.produtos],
  ][]

  let count = 0
  for (const [produto, def] of produtos) {
    const piso = pisoDe(def) // menor preço ANUAL (base do Degrau 13)
    for (const tier of def.tiers) {
      // Uma linha por MODELO: anual usa `mensal`, mensal usa `mensal_sf`. Limites
      // (incluso/canais) idênticos — os produtos Go leem só limites (com LIMIT 1).
      for (const [model, mensal] of [["anual", tier.mensal], ["mensal", tier.mensal_sf]] as const) {
        await db.execute(sql`
          INSERT INTO public.plans (produto, tier, model, metric, mensal, incluso, canais, excedente_unitario, piso)
          VALUES (${produto}, ${tier.id}, ${model}, ${def.metric}, ${mensal}, ${tier.incluso},
                  ${tier.canais ?? null}, ${def.excedente_unitario}, ${piso})
          ON CONFLICT (produto, tier, model) DO UPDATE SET
            metric = EXCLUDED.metric, mensal = EXCLUDED.mensal, incluso = EXCLUDED.incluso,
            canais = EXCLUDED.canais, excedente_unitario = EXCLUDED.excedente_unitario,
            piso = EXCLUDED.piso
        `)
        count++
      }
    }

    // Regras do produto → product_rules (lidas read-only pelos data planes).
    await db.execute(sql`
      INSERT INTO public.product_rules (produto, rules)
      VALUES (${produto}, ${JSON.stringify(def.regras)}::jsonb)
      ON CONFLICT (produto) DO UPDATE SET rules = EXCLUDED.rules
    `)
  }
  console.log(`pricing:sync — ${count} planos + regras de ${produtos.length} produtos materializados.`)
  process.exit(0)
}

main().catch((e) => {
  console.error("pricing:sync falhou:", e)
  process.exit(1)
})
