"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { signOut } from "@/auth"
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant/context"

/** Troca o tenant ativo (cookie). O acesso é revalidado ao ler o contexto. */
export async function switchTenant(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "")
  if (tenantId) {
    ;(await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })
  }
  revalidatePath("/", "layout")
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" })
}
