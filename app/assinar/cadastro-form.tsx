"use client"

import { useActionState, useState } from "react"
import Script from "next/script"
import { signupAction, type SignupState } from "./actions"

// Site key pública do Turnstile (inline em build por ser NEXT_PUBLIC_). Vazia =
// captcha desligado (o server também passa direto — ver lib/signup/turnstile.ts).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""

const initial: SignupState = {}
const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"

// Critérios da senha forte (espelham lib/auth/password no server).
function checks(pw: string) {
  return {
    len: pw.length >= 10,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    num: /[0-9]/.test(pw),
  }
}

// Campos controlados por state: o React 19 reseta o <form> após a action, então
// sem isso o cliente perderia tudo (cartão/endereço) num erro de pagamento. Os
// dados do cartão ficam só no cliente (não trafegam de volta pelo servidor).
export function CadastroForm({ produto, tier }: { produto: string; tier: string }) {
  const [state, action, pending] = useActionState(signupAction, initial)
  const [f, setF] = useState({
    name: "",
    taxId: "",
    email: "",
    cardNumber: "",
    cardHolder: "",
    cardMonth: "",
    cardYear: "",
    cardCcv: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
    coupon: "",
  })
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const c = checks(pw)
  const score = Object.values(c).filter(Boolean).length
  const strong = score === 4
  const mismatch = confirm.length > 0 && confirm !== pw

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="produto" value={produto} />
      <input type="hidden" name="tier" value={tier} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Modelo</span>
        <select name="model" defaultValue="anual" className={field}>
          <option value="anual">Anual — 12 meses, sem taxa de implantação</option>
          <option value="mensal">Mensal — sem fidelidade, com implantação na adesão</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Nome ou razão social</span>
        <input name="name" required autoComplete="organization" value={f.name} onChange={set("name")} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">CPF ou CNPJ</span>
        <input name="taxId" required inputMode="numeric" autoComplete="off" value={f.taxId} onChange={set("taxId")} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">E-mail</span>
        <input name="email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} className={field} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Senha</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className={field}
        />
        {pw.length > 0 && (
          <>
            <div className="mt-1 flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i < score ? (strong ? "bg-primary" : "bg-amber-500") : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              Precisa de: {c.len ? "" : "10+ caracteres, "}
              {c.upper ? "" : "maiúscula, "}
              {c.lower ? "" : "minúscula, "}
              {c.num ? "" : "número"}
              {strong ? "senha forte ✓" : ""}
            </span>
          </>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Confirmar senha</span>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={field}
        />
        {mismatch && <span className="text-xs text-destructive">As senhas não coincidem.</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Cupom de desconto (opcional)</span>
        <input
          name="coupon"
          autoComplete="off"
          placeholder="ex.: SAPIENZA2026"
          value={f.coupon}
          onChange={set("coupon")}
          className={`${field} uppercase placeholder:normal-case`}
        />
      </label>

      <div className="mt-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Pagamento no cartão</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Assinatura mensal, cobrança recorrente no cartão.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Número do cartão</span>
        <input
          name="cardNumber"
          required
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={f.cardNumber}
          onChange={set("cardNumber")}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Nome impresso no cartão</span>
        <input name="cardHolder" required autoComplete="cc-name" value={f.cardHolder} onChange={set("cardHolder")} className={field} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Mês</span>
          <input name="cardMonth" required inputMode="numeric" autoComplete="cc-exp-month" placeholder="MM" maxLength={2} value={f.cardMonth} onChange={set("cardMonth")} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Ano</span>
          <input name="cardYear" required inputMode="numeric" autoComplete="cc-exp-year" placeholder="AAAA" maxLength={4} value={f.cardYear} onChange={set("cardYear")} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">CVV</span>
          <input name="cardCcv" required inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} value={f.cardCcv} onChange={set("cardCcv")} className={field} />
        </label>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">CEP</span>
          <input name="postalCode" required inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={f.postalCode} onChange={set("postalCode")} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Número</span>
          <input name="addressNumber" required inputMode="numeric" autoComplete="off" value={f.addressNumber} onChange={set("addressNumber")} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Telefone (com DDD)</span>
        <input name="phone" required inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" value={f.phone} onChange={set("phone")} className={field} />
      </label>

      {TURNSTILE_SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          {/* O widget injeta um input `captchaToken` no form ao ser resolvido. */}
          <div
            className="cf-turnstile mt-2"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-response-field-name="captchaToken"
          />
        </>
      )}

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !strong || mismatch || confirm.length === 0}
        className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Processando pagamento…" : "Assinar e criar conta"}
      </button>
      <p className="text-center font-mono text-xs text-muted-foreground">
        cobrança recorrente no cartão · acesso liberado após a confirmação
      </p>
    </form>
  )
}
