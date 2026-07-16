import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { loadPricing, type Pricing, type ProdutoId } from "@/lib/pricing/load"

// Projeta o pricing.yaml numa PROJEÇÃO PÚBLICA (JSON) consumida pelo site
// (spa-sapienza). O site deploya sozinho e não pode ler este repo no build; e os
// números comerciais (setup/portas/combo/excedente) NÃO podem vazar pro repo público.
// Por padrão gera só o público (tiers/inclusos/canais). `--full` inclui um bloco
// `comercial` — usado apenas no modo TRANSPARENCIA=total do site.
//
// Uso: pnpm pricing:public [caminho.json] [--full]
//   default → ../spa-sapienza/config/pricing.public.json (ou env PRICING_PUBLIC_OUT)
// Ao editar config/pricing.yaml, rode `pnpm pricing:public` e commite o JSON no site.

type PublicTier = { id: string; mensal: number; incluso: number; canais?: number }
type PublicProduto = { nome: string; metric: string; tiers: PublicTier[] }
type Comercial = {
  setup: Pricing["setup"]
  combo: Pricing["combo_sistema_sapienza"]
  portas: Pricing["portas_pagamento"]
}
type PublicPricing = {
  currency: Pricing["currency"]
  produtos: Record<ProdutoId, PublicProduto>
  comercial?: Comercial
}

function projectProduto(def: Pricing["produtos"][ProdutoId]): PublicProduto {
  return {
    nome: def.nome,
    metric: def.metric,
    tiers: def.tiers.map((t) => ({
      id: t.id,
      mensal: t.mensal,
      incluso: t.incluso,
      ...(t.canais != null ? { canais: t.canais } : {}),
    })),
  }
}

function project(pricing: Pricing, full: boolean): PublicPricing {
  const out: PublicPricing = {
    currency: pricing.currency,
    produtos: {
      margot: projectProduto(pricing.produtos.margot),
      motor: projectProduto(pricing.produtos.motor),
    },
  }
  if (full) {
    out.comercial = {
      setup: pricing.setup,
      combo: pricing.combo_sistema_sapienza,
      portas: pricing.portas_pagamento,
    }
  }
  return out
}

function main() {
  const args = process.argv.slice(2)
  const full = args.includes("--full")
  const pathArg = args.find((a) => !a.startsWith("--"))
  const out = resolve(
    pathArg ??
      process.env.PRICING_PUBLIC_OUT ??
      join(process.cwd(), "..", "spa-sapienza", "config", "pricing.public.json"),
  )

  const projected = project(loadPricing(), full)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(projected, null, 2) + "\n", "utf8")

  const scope = full ? "público + comercial (--full)" : "público"
  console.log(`pricing:public — projeção ${scope} escrita em ${out}`)
  process.exit(0)
}

main()
