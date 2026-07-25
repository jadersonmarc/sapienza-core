"use server"

import { redirect } from "next/navigation"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { checkoutSignup, CheckoutError } from "@/lib/signup/checkout"
import { paymentProvider, PaymentError } from "@/lib/payments/asaas"
import type { ProdutoId } from "@/lib/pricing/load"

export type SignupState = { error?: string }

// Passo 1 — cadastro: cria a conta (past_due) + a cobrança PIX e leva ao passo 2.
export async function signupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const password = String(form.get("password") ?? "")
  if (password !== String(form.get("confirm") ?? "")) return { error: "As senhas não coincidem." }

  let invoiceId: string
  try {
    const r = await checkoutSignup({
      name: String(form.get("name") ?? "").trim(),
      taxId: String(form.get("taxId") ?? "").replace(/\D/g, ""),
      email: String(form.get("email") ?? "").trim(),
      password,
      produto: String(form.get("produto") ?? "") as ProdutoId,
      tier: String(form.get("tier") ?? ""),
    })
    invoiceId = r.invoiceId
  } catch (e) {
    console.error("[signup] falha ao criar conta:", e)
    if (e instanceof CheckoutError) return { error: e.message }
    if (e instanceof PaymentError) return { error: `Pagamento (Asaas): ${e.message}` }
    return { error: `Não foi possível criar sua conta. ${e instanceof Error ? e.message : ""}`.trim() }
  }
  redirect(`/assinar/pagamento?invoice=${invoiceId}`)
}

// Passo 2 — QR do PIX da cobrança (buscado no Asaas na hora).
export async function getPixQrAction(
  invoiceId: string,
): Promise<{ encodedImage?: string; payload?: string; error?: string }> {
  try {
    const rows = (await db.execute(
      sql`SELECT provider_charge_id FROM public.invoices WHERE id = ${invoiceId}::uuid`,
    )) as unknown as { provider_charge_id: string | null }[]
    const chargeId = rows[0]?.provider_charge_id
    if (!chargeId) return { error: "Cobrança não encontrada." }
    const qr = await paymentProvider().getPixQr(chargeId)
    return { encodedImage: qr.encodedImage, payload: qr.payload }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao gerar o PIX." }
  }
}
