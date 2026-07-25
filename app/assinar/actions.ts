"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { checkoutSignup, CheckoutError } from "@/lib/signup/checkout"
import { PaymentError } from "@/lib/payments/asaas"
import type { ProdutoId } from "@/lib/pricing/load"

export type SignupState = { error?: string }

// Cadastro: cria a conta (past_due) + a assinatura RECORRENTE no cartão
// (transparente — o cartão é digitado na nossa página). O 1º pagamento é cobrado
// na hora; o webhook do pagamento ativa a conta. Redireciona pro login.
export async function signupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const password = String(form.get("password") ?? "")
  if (password !== String(form.get("confirm") ?? "")) return { error: "As senhas não coincidem." }

  // IP do cliente (Asaas exige no cartão). Atrás do proxy do Coolify.
  const h = await headers()
  const remoteIp = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "127.0.0.1"

  try {
    await checkoutSignup({
      name: String(form.get("name") ?? "").trim(),
      taxId: String(form.get("taxId") ?? "").replace(/\D/g, ""),
      email: String(form.get("email") ?? "").trim(),
      password,
      produto: String(form.get("produto") ?? "") as ProdutoId,
      tier: String(form.get("tier") ?? ""),
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
  } catch (e) {
    console.error("[signup] falha ao criar conta:", e)
    if (e instanceof CheckoutError) return { error: e.message }
    if (e instanceof PaymentError) return { error: `Pagamento (Asaas): ${e.message}` }
    return { error: `Não foi possível criar sua conta. ${e instanceof Error ? e.message : ""}`.trim() }
  }
  redirect("/login?assinou=1")
}
