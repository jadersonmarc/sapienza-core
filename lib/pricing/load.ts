import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import { z } from "zod"

// config/pricing.yaml é a FONTE ÚNICA de preço/tier/regra. Nunca chumbar em código.
// Este loader valida o YAML no boot e expõe tipos; `pricing:sync` materializa em `plans`.

const tierSchema = z.object({
  id: z.enum(["start", "pro", "scale"]),
  mensal: z.number().nonnegative(),
  incluso: z.number().int().nonnegative(),
  canais: z.number().int().positive().optional(),
})

const produtoSchema = z.object({
  nome: z.string(),
  metric: z.string(),
  tiers: z.array(tierSchema).min(1),
  excedente_unitario: z.number().nonnegative(),
  regras: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
})

const seatsSchema = z.object({
  escopo: z.literal("tenant"),
  base: z.literal("maior_tier_ativo"),
  ao_exceder: z.literal("bloquear"),
  por_tier: z.object({
    start: z.number().int().positive(),
    pro: z.number().int().positive(),
    scale: z.number().int().positive(),
  }),
  contam_como_seat: z.array(z.enum(["owner", "admin", "member"])).min(1),
  nao_contam: z.array(z.string()),
  downgrade: z.literal("bloquear_ate_remover_excedentes"),
})

const pricingSchema = z.object({
  currency: z.literal("BRL"),
  setup: z.object({
    padrao: z.number(),
    porta_assinatura: z.number(),
    degrau_13: z.boolean(),
  }),
  seats: seatsSchema,
  produtos: z.object({
    margot: produtoSchema,
    motor: produtoSchema,
  }),
  combo_sistema_sapienza: z.object({
    setup: z.number(),
    mensal_start: z.number(),
    assinatura: z.object({ setup: z.number(), mensal: z.number() }),
  }),
  portas_pagamento: z.array(
    z.object({
      id: z.enum(["obra", "meio_a_meio", "assinatura"]),
      entrada: z.number(),
      premio_mensal_pct: z.number(),
    }),
  ),
})

export type Pricing = z.infer<typeof pricingSchema>
export type ProdutoId = keyof Pricing["produtos"]

let cached: Pricing | null = null

/** Lê, valida (zod) e cacheia o pricing.yaml. Lança no boot se inválido. */
export function loadPricing(path?: string): Pricing {
  if (cached && !path) return cached
  const file = path ?? join(process.cwd(), "config", "pricing.yaml")
  const raw = parse(readFileSync(file, "utf8"))
  const parsed = pricingSchema.parse(raw)
  if (!path) cached = parsed
  return parsed
}

/** Piso da mensalidade de um produto = menor `mensal` entre os tiers (Degrau 13). */
export function pisoDe(produto: Pricing["produtos"][ProdutoId]): number {
  return Math.min(...produto.tiers.map((t) => t.mensal))
}
