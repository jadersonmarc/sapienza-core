"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { currentContext } from "@/lib/console/current"
import { roleInTenant } from "@/lib/tenant/context"
import { upgradeSubscription, UpgradeError } from "@/lib/signup/upgrade"
import { PaymentError } from "@/lib/payments/asaas"
import type { ProdutoId } from "@/lib/pricing/load"

// Owner/admin (ou superadmin) gerenciam a própria conta.
async function requireManager(): Promise<{ userId: string; tenantId: string }> {
  const { user, active } = await currentContext()
  if (!active) throw new Error("nenhum tenant ativo")
  const role = user.isSuperadmin ? "superadmin" : await roleInTenant(user.id, active.id)
  if (role !== "owner" && role !== "admin" && role !== "superadmin") {
    throw new Error("apenas owner/admin podem gerenciar a conta")
  }
  return { userId: user.id, tenantId: active.id }
}

export type OwnerState = { ok?: boolean; error?: string }

// Nome do proprietário da conta (users.name do owner logado). O e-mail é o login
// e não muda por aqui.
export async function saveOwnerNameAction(_prev: OwnerState, formData: FormData): Promise<OwnerState> {
  try {
    const { userId } = await requireManager()
    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { error: "informe um nome" }
    await db.execute(sql`UPDATE public.users SET name = ${name}, updated_at = now() WHERE id = ${userId}::uuid`)
    revalidatePath("/minha-conta")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "falha ao salvar o nome" }
  }
}

export type UpgradeFormState = { error?: string }

const PRODUTOS = new Set(["margot", "motor"])

// Upgrade self-service: redigita o cartão e sobe de tier. Em sucesso, volta a
// Minha Conta com o novo plano ativo.
export async function upgradePlanAction(_prev: UpgradeFormState, form: FormData): Promise<UpgradeFormState> {
  let done = false
  try {
    const { tenantId } = await requireManager()
    const produto = String(form.get("produto") ?? "")
    const toTier = String(form.get("tier") ?? "")
    if (!PRODUTOS.has(produto)) return { error: "produto inválido" }

    const h = await headers()
    const remoteIp =
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "127.0.0.1"

    await upgradeSubscription({
      tenantId,
      produto: produto as ProdutoId,
      toTier,
      remoteIp,
      card: {
        number: String(form.get("cardNumber") ?? ""),
        holderName: String(form.get("cardHolder") ?? ""),
        expiryMonth: String(form.get("cardMonth") ?? ""),
        expiryYear: String(form.get("cardYear") ?? ""),
        ccv: String(form.get("cardCcv") ?? ""),
      },
      postalCode: String(form.get("postalCode") ?? ""),
      addressNumber: String(form.get("addressNumber") ?? ""),
      phone: String(form.get("phone") ?? ""),
    })
    done = true
  } catch (e) {
    if (e instanceof UpgradeError) return { error: e.message }
    if (e instanceof PaymentError) return { error: `Pagamento (Asaas): ${e.message}` }
    console.error("[upgrade] falha:", e)
    return { error: `Não foi possível concluir o upgrade. ${e instanceof Error ? e.message : ""}`.trim() }
  }
  // redirect fora do try (lança NEXT_REDIRECT).
  if (done) redirect("/minha-conta?upgrade=1")
  return {}
}
