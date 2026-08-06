"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { signOut } from "@/auth"
import { checkoutSignup, CheckoutError, type CheckoutProduto } from "@/lib/signup/checkout"
import { PaymentError } from "@/lib/payments/asaas"
import { verifyTurnstile } from "@/lib/signup/turnstile"
import { assertCheckoutAllowed, RateLimitError } from "@/lib/signup/rate-limit"

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
  const email = String(form.get("email") ?? "").trim()

  // Anti-abuso: captcha (Turnstile) + rate-limit por IP/e-mail — ANTES de criar
  // qualquer coisa ou tocar no Asaas.
  if (!(await verifyTurnstile(String(form.get("captchaToken") ?? ""), remoteIp))) {
    return { error: "Verificação anti-robô falhou. Recarregue a página e tente de novo." }
  }
  try {
    await assertCheckoutAllowed(remoteIp, email)
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message }
    throw e
  }

  try {
    await checkoutSignup({
      name: String(form.get("name") ?? "").trim(),
      taxId: String(form.get("taxId") ?? "").replace(/\D/g, ""),
      email,
      password,
      produto: String(form.get("produto") ?? "") as CheckoutProduto,
      tier: String(form.get("tier") ?? ""),
      coupon: String(form.get("coupon") ?? ""),
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
  // Encerra QUALQUER sessão anterior (ex.: operador já logado no navegador) ANTES de
  // ir ao login. Sem isso, o /login com sessão ativa cairia direto no painel da conta
  // antiga — não na conta recém-criada. redirect:false só limpa o cookie; o redirect
  // abaixo leva ao login (e lança NEXT_REDIRECT).
  await signOut({ redirect: false })
  redirect("/login?assinou=1")
}
