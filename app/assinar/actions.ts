"use server"

import { redirect } from "next/navigation"
import { checkoutSignup, CheckoutError } from "@/lib/signup/checkout"
import { PaymentError } from "@/lib/payments/asaas"
import type { ProdutoId } from "@/lib/pricing/load"

export type SignupState = { error?: string }

// Cadastro: cria a conta (past_due) + a sessão de checkout hospedado (assinatura
// recorrente no cartão) e redireciona pro Asaas, onde o cliente paga. O webhook
// do 1º pagamento ativa a conta.
export async function signupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const password = String(form.get("password") ?? "")
  if (password !== String(form.get("confirm") ?? "")) return { error: "As senhas não coincidem." }

  let checkoutUrl: string
  try {
    const r = await checkoutSignup({
      name: String(form.get("name") ?? "").trim(),
      taxId: String(form.get("taxId") ?? "").replace(/\D/g, ""),
      email: String(form.get("email") ?? "").trim(),
      password,
      produto: String(form.get("produto") ?? "") as ProdutoId,
      tier: String(form.get("tier") ?? ""),
    })
    checkoutUrl = r.checkoutUrl
  } catch (e) {
    console.error("[signup] falha ao criar conta:", e)
    if (e instanceof CheckoutError) return { error: e.message }
    if (e instanceof PaymentError) return { error: `Pagamento (Asaas): ${e.message}` }
    return { error: `Não foi possível criar sua conta. ${e instanceof Error ? e.message : ""}`.trim() }
  }
  redirect(checkoutUrl)
}
