import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { normalizeCode } from "@/lib/coupons/compute"
import { loadCouponByCode } from "@/lib/coupons/redeem"
import type { Coupon, CouponKind, CouponScopeKind } from "@/lib/coupons/types"
import type { ProdutoId } from "@/lib/pricing/load"

// Gerência do CATÁLOGO de cupons (superadmin): listar, criar, ativar/desativar.
// Não mexe em resgates já concedidos — cupom altera só preço, e editar um cupom
// em uso afetaria preço/atribuição futuros; o caminho seguro é desativar + criar.

export class CouponManageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CouponManageError"
  }
}

const KINDS: CouponKind[] = ["percentual", "fixo"]
const SCOPES: CouponScopeKind[] = ["global", "produto", "combo"]
const PRODUTOS: ProdutoId[] = ["margot", "motor"]
const TIERS = ["start", "pro", "scale"]

export type CouponInput = {
  code: string
  kind: CouponKind
  value: number
  scopeKind: CouponScopeKind
  scopeProduto: ProdutoId | null
  scopeTier: string | null
  redeemBy: string | null
  maxRedemptions: number | null
  durationMonths: number | null
}

/**
 * Valida a definição de um cupom — PURO (sem banco). Espelha o CHECK
 * `coupons_scope_ck` da migration 0010 + regras de negócio. Devolve a mensagem
 * de erro (pt-BR) ou null se estiver ok.
 */
export function validateCouponInput(input: CouponInput): string | null {
  if (!input.code.trim()) return "informe o código do cupom"
  if (!KINDS.includes(input.kind)) return "tipo inválido"
  if (!(input.value > 0)) return "o valor deve ser maior que zero"
  if (input.kind === "percentual" && input.value > 100) return "percentual não pode passar de 100%"
  if (!SCOPES.includes(input.scopeKind)) return "escopo inválido"

  if (input.scopeKind === "global") {
    if (input.scopeProduto || input.scopeTier) return "escopo global não leva produto nem plano"
  } else if (input.scopeKind === "produto") {
    if (!input.scopeProduto || !PRODUTOS.includes(input.scopeProduto)) return "selecione o produto do escopo"
    if (!input.scopeTier || !TIERS.includes(input.scopeTier)) return "selecione o plano do escopo"
  } else {
    // combo
    if (input.scopeProduto) return "escopo combo não leva produto"
    if (!input.scopeTier || !TIERS.includes(input.scopeTier)) return "selecione o plano do combo"
  }

  if (input.maxRedemptions != null && !(Number.isInteger(input.maxRedemptions) && input.maxRedemptions > 0)) {
    return "máximo de resgates deve ser um inteiro maior que zero"
  }
  if (input.durationMonths != null && !(Number.isInteger(input.durationMonths) && input.durationMonths > 0)) {
    return "duração deve ser um inteiro de meses maior que zero"
  }
  if (input.redeemBy != null && Number.isNaN(Date.parse(input.redeemBy))) return "data limite inválida"
  return null
}

function mapCoupon(r: Record<string, unknown>): Coupon {
  return {
    id: String(r.id),
    code: String(r.code),
    kind: String(r.kind) as CouponKind,
    value: Number(r.value),
    scopeKind: String(r.scope_kind) as CouponScopeKind,
    scopeProduto: (r.scope_produto as ProdutoId | null) ?? null,
    scopeTier: (r.scope_tier as string | null) ?? null,
    redeemBy: (r.redeem_by as string | null) ?? null,
    maxRedemptions: r.max_redemptions == null ? null : Number(r.max_redemptions),
    redemptionCount: Number(r.redemption_count ?? 0),
    durationMonths: r.duration_months == null ? null : Number(r.duration_months),
    active: Boolean(r.active),
  }
}

/** Todos os cupons do catálogo, mais recentes primeiro. */
export async function listCoupons(): Promise<Coupon[]> {
  const rows = (await db.execute(sql`
    SELECT * FROM public.coupons ORDER BY created_at DESC
  `)) as unknown as Record<string, unknown>[]
  return rows.map(mapCoupon)
}

/** Cria um cupom novo. Normaliza o código, valida e checa unicidade. */
export async function createCoupon(input: CouponInput): Promise<{ id: string }> {
  const err = validateCouponInput(input)
  if (err) throw new CouponManageError(err)
  const code = normalizeCode(input.code)
  if (await loadCouponByCode(code)) throw new CouponManageError(`já existe um cupom com o código ${code}`)

  const rows = (await db.execute(sql`
    INSERT INTO public.coupons
      (code, kind, value, scope_kind, scope_produto, scope_tier, redeem_by, max_redemptions, duration_months, active)
    VALUES (${code}, ${input.kind}, ${input.value}, ${input.scopeKind},
            ${input.scopeProduto}, ${input.scopeTier},
            ${input.redeemBy == null ? sql`NULL` : sql`${input.redeemBy}::date`},
            ${input.maxRedemptions}, ${input.durationMonths}, true)
    RETURNING id
  `)) as unknown as { id: string }[]
  return { id: rows[0].id }
}

/** Liga/desliga um cupom (não exclui — resgates apontam para ele). */
export async function setCouponActive(id: string, active: boolean): Promise<void> {
  await db.execute(sql`
    UPDATE public.coupons SET active = ${active}, updated_at = now() WHERE id = ${id}::uuid
  `)
}
