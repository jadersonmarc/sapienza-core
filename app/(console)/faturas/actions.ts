"use server"

import { revalidatePath } from "next/cache"
import { currentContext } from "@/lib/console/current"
import { roleInTenant } from "@/lib/tenant/context"
import { saveBillingIdentity } from "@/lib/tenant/billing"

export type BillingState = { ok?: boolean; error?: string }

// Owner/admin (ou superadmin) editam os dados de cobrança do próprio tenant.
async function requireManager(): Promise<{ tenantId: string }> {
  const { user, active } = await currentContext()
  if (!active) throw new Error("nenhum tenant ativo")
  const role = user.isSuperadmin ? "superadmin" : await roleInTenant(user.id, active.id)
  if (role !== "owner" && role !== "admin" && role !== "superadmin") {
    throw new Error("apenas owner/admin podem editar os dados de cobrança")
  }
  return { tenantId: active.id }
}

export async function saveBillingIdentityAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  try {
    const { tenantId } = await requireManager()
    await saveBillingIdentity(tenantId, {
      legalName: String(formData.get("legal_name") ?? ""),
      taxId: String(formData.get("tax_id") ?? ""),
      billingEmail: String(formData.get("billing_email") ?? ""),
    })
    revalidatePath("/faturas")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "falha ao salvar dados de cobrança" }
  }
}
