"use server"

import { revalidatePath } from "next/cache"
import { currentContext } from "@/lib/console/current"
import { roleInTenant } from "@/lib/tenant/context"
import { addMember, removeMember, type SeatRole } from "@/lib/tenant/members"
import { SeatError } from "@/lib/billing/seats"

export type AddMemberState = { ok?: boolean; error?: string }

/** Só owner/admin do tenant (ou super-admin) podem gerenciar usuários. O tenant é
 *  sempre o ativo resolvido no servidor — nunca confiamos num id vindo do cliente. */
async function requireManager(): Promise<{ tenantId: string }> {
  const { user, active } = await currentContext()
  if (!active) throw new Error("nenhum tenant ativo")
  const role = user.isSuperadmin ? "superadmin" : await roleInTenant(user.id, active.id)
  if (role !== "owner" && role !== "admin" && role !== "superadmin") {
    throw new Error("apenas owner/admin podem gerenciar usuários")
  }
  return { tenantId: active.id }
}

export async function addMemberAction(
  _prev: AddMemberState,
  formData: FormData,
): Promise<AddMemberState> {
  try {
    const { tenantId } = await requireManager()
    const email = String(formData.get("email") ?? "")
    const role = String(formData.get("role") ?? "member") as SeatRole
    await addMember({ tenantId, email, role })
    revalidatePath("/usuarios")
    return { ok: true }
  } catch (e) {
    if (e instanceof SeatError) return { error: e.message }
    return { error: e instanceof Error ? e.message : "falha ao adicionar usuário" }
  }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const { tenantId } = await requireManager()
  const userId = String(formData.get("userId") ?? "")
  if (userId) {
    await removeMember({ tenantId, userId })
    revalidatePath("/usuarios")
  }
}
