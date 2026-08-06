"use server"

import { revalidatePath } from "next/cache"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { currentContext } from "@/lib/console/current"
import { createTenant } from "@/lib/tenant/create"
import { activateSubscription } from "@/lib/provisioning/activate"
import { cancelSubscription, cancelAllSubscriptions } from "@/lib/provisioning/cancel"
import { deleteTenant } from "@/lib/tenant/delete"
import { SeatError } from "@/lib/billing/seats"
import { ChannelDowngradeError } from "@/lib/billing/channels-downgrade"
import { applyCouponToSubscription, revokeCoupon, AdminCouponError } from "@/lib/coupons/admin"
import { createCoupon, setCouponActive, CouponManageError } from "@/lib/coupons/manage"
import { CouponError, type CouponBillingModel, type CouponKind, type CouponScopeKind } from "@/lib/coupons/types"
import type { ProdutoId } from "@/lib/pricing/load"

// Só o superadmin Sapienza cria tenant e ativa assinatura.
async function requireSuperadmin(): Promise<void> {
  const { user } = await currentContext()
  if (!user.isSuperadmin) throw new Error("apenas superadmin")
}

export type NewTenantState = {
  ok?: boolean
  error?: string
  // Mostrados uma vez após criar, para o superadmin repassar ao cliente.
  slug?: string
  ownerEmail?: string
  ownerPassword?: string
}

export async function createTenantAction(
  _prev: NewTenantState,
  formData: FormData,
): Promise<NewTenantState> {
  try {
    await requireSuperadmin()
    const created = await createTenant({
      name: String(formData.get("name") ?? ""),
      ownerEmail: String(formData.get("owner_email") ?? ""),
    })
    revalidatePath("/super")
    return {
      ok: true,
      slug: created.slug,
      ownerEmail: created.ownerEmail,
      ownerPassword: created.ownerPassword,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "falha ao criar tenant" }
  }
}

export type ActivateState = { ok?: boolean; error?: string }

const TIERS = new Set(["start", "pro", "scale"])
const PRODUTOS = new Set(["margot", "motor"])

export async function activateSubscriptionAction(
  _prev: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  try {
    await requireSuperadmin()
    const tenantId = String(formData.get("tenant_id") ?? "")
    const produto = String(formData.get("produto") ?? "")
    const tier = String(formData.get("tier") ?? "")
    const hardCap = formData.get("hard_cap") === "on"
    if (!tenantId) return { error: "selecione o tenant" }
    if (!PRODUTOS.has(produto)) return { error: "produto inválido" }
    if (!TIERS.has(tier)) return { error: "tier inválido" }

    await activateSubscription({ tenantId, produto: produto as ProdutoId, tier, hardCap })
    revalidatePath("/super")
    return { ok: true }
  } catch (e) {
    if (e instanceof SeatError || e instanceof ChannelDowngradeError) return { error: e.message }
    return { error: e instanceof Error ? e.message : "falha ao ativar assinatura" }
  }
}

export type CancelState = { ok?: boolean; error?: string }

// Cancelamento manual (cliente pediu por contato). A multa de fidelidade, se
// houver, o superadmin combina/cobra à parte — a tela mostra o valor sugerido.
export async function cancelSubscriptionAction(
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  try {
    await requireSuperadmin()
    const tenantId = String(formData.get("tenant_id") ?? "")
    const produto = String(formData.get("produto") ?? "")
    if (formData.get("confirm") !== "on") return { error: "marque a confirmação para cancelar" }
    if (!tenantId) return { error: "tenant inválido" }
    if (!PRODUTOS.has(produto)) return { error: "produto inválido" }

    const done = await cancelSubscription(tenantId, produto as ProdutoId)
    if (!done) return { error: "assinatura não encontrada ou já cancelada" }
    revalidatePath("/super")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "falha ao cancelar assinatura" }
  }
}

export type CouponState = { ok?: boolean; error?: string; info?: string }

// Aplica um cupom a uma assinatura EXISTENTE (concessão negociada, sem checkout).
// Mexe só no preço da recorrência do Asaas; plano/caps/assentos ficam.
export async function applyCouponAction(_prev: CouponState, formData: FormData): Promise<CouponState> {
  try {
    await requireSuperadmin()
    const tenantId = String(formData.get("tenant_id") ?? "")
    const code = String(formData.get("code") ?? "")
    if (!tenantId) return { error: "selecione o tenant" }
    if (!code.trim()) return { error: "informe o código do cupom" }

    const r = await applyCouponToSubscription({ tenantId, code })
    revalidatePath("/super")
    return {
      ok: true,
      info: `Aplicado: R$ ${r.net.toFixed(2)}/mês (de R$ ${r.base.toFixed(2)})${
        r.endsOn ? ` até ${r.endsOn}` : " (enquanto durar a assinatura)"
      }.`,
    }
  } catch (e) {
    if (e instanceof CouponError || e instanceof AdminCouponError) return { error: e.message }
    return { error: e instanceof Error ? e.message : "falha ao aplicar cupom" }
  }
}

// Revoga um resgate ativo: a recorrência volta ao preço de tabela.
export async function revokeCouponAction(_prev: CouponState, formData: FormData): Promise<CouponState> {
  try {
    await requireSuperadmin()
    const redemptionId = String(formData.get("redemption_id") ?? "")
    if (!redemptionId) return { error: "resgate inválido" }
    await revokeCoupon({ redemptionId })
    revalidatePath("/super")
    return { ok: true }
  } catch (e) {
    if (e instanceof AdminCouponError) return { error: e.message }
    return { error: e instanceof Error ? e.message : "falha ao revogar cupom" }
  }
}

export type CouponCatalogState = { ok?: boolean; error?: string }

// Cria um cupom no catálogo (superadmin). Preço base sempre do pricing.yaml no
// resgate; aqui só a definição. Valores em número; campos opcionais viram null.
export async function createCouponAction(_prev: CouponCatalogState, formData: FormData): Promise<CouponCatalogState> {
  try {
    await requireSuperadmin()
    const scopeKind = String(formData.get("scope_kind") ?? "global") as CouponScopeKind
    const num = (k: string): number | null => {
      const v = String(formData.get(k) ?? "").trim()
      return v === "" ? null : Number(v)
    }
    const str = (k: string): string | null => {
      const v = String(formData.get(k) ?? "").trim()
      return v === "" ? null : v
    }
    await createCoupon({
      code: String(formData.get("code") ?? ""),
      kind: String(formData.get("kind") ?? "fixo") as CouponKind,
      value: Number(formData.get("value") ?? 0),
      scopeKind,
      // Só leva produto no escopo 'produto'; só leva tier em produto/combo.
      scopeProduto: scopeKind === "produto" ? (str("scope_produto") as ProdutoId | null) : null,
      scopeTier: scopeKind === "global" ? null : str("scope_tier"),
      billingModel: (String(formData.get("billing_model") ?? "ambos")) as CouponBillingModel,
      redeemBy: str("redeem_by"),
      maxRedemptions: num("max_redemptions"),
    })
    revalidatePath("/super")
    return { ok: true }
  } catch (e) {
    if (e instanceof CouponManageError) return { error: e.message }
    return { error: e instanceof Error ? e.message : "falha ao criar cupom" }
  }
}

// Liga/desliga um cupom do catálogo.
export async function toggleCouponActiveAction(_prev: CouponCatalogState, formData: FormData): Promise<CouponCatalogState> {
  try {
    await requireSuperadmin()
    const id = String(formData.get("coupon_id") ?? "")
    const active = formData.get("active") === "true"
    if (!id) return { error: "cupom inválido" }
    await setCouponActive(id, active)
    revalidatePath("/super")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "falha ao atualizar cupom" }
  }
}

export type AccountState = { ok?: boolean; error?: string }

// Cancelar a CONTA: cancela todas as assinaturas do tenant (bloqueia o acesso).
export async function cancelAccountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    await requireSuperadmin()
    const tenantId = String(formData.get("tenant_id") ?? "")
    if (!tenantId) return { error: "tenant inválido" }
    if (formData.get("confirm") !== "on") return { error: "marque a confirmação" }
    const n = await cancelAllSubscriptions(tenantId)
    revalidatePath("/super")
    return n > 0 ? { ok: true } : { error: "nenhuma assinatura ativa para cancelar" }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "falha ao cancelar a conta" }
  }
}

// EXCLUIR a conta (definitivo): remove o tenant, o data plane e o usuário órfão.
// Exige digitar o nome exato do cliente para confirmar.
export async function deleteAccountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    await requireSuperadmin()
    const tenantId = String(formData.get("tenant_id") ?? "")
    const confirmName = String(formData.get("confirm_name") ?? "").trim()
    if (!tenantId) return { error: "tenant inválido" }
    const rows = (await db.execute(
      sql`SELECT name FROM public.tenants WHERE id = ${tenantId}::uuid`,
    )) as unknown as { name: string }[]
    if (rows.length === 0) return { error: "tenant não encontrado" }
    if (confirmName !== rows[0].name) return { error: "o nome digitado não confere" }

    const done = await deleteTenant(tenantId)
    if (!done) return { error: "não foi possível excluir" }
    revalidatePath("/super")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "falha ao excluir a conta" }
  }
}
