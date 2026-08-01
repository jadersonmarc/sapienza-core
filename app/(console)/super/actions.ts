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
