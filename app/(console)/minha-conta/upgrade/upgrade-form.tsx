"use client"

import { useActionState, useState } from "react"
import { upgradePlanAction, type UpgradeFormState } from "../actions"

const initial: UpgradeFormState = {}
const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"

type Option = { id: string; label: string; mensal: number; incluso: number }

// Seleciona o tier alvo e redigita o cartão (Asaas exige os dados do titular).
// Espelha os campos de app/assinar/cadastro-form.tsx; o cartão fica só no cliente.
export function UpgradeForm({
  produto,
  metric,
  options,
}: {
  produto: string
  metric: string
  options: Option[]
}) {
  const [state, action, pending] = useActionState(upgradePlanAction, initial)
  const [tier, setTier] = useState(options[0]?.id ?? "")
  const [f, setF] = useState({
    cardNumber: "",
    cardHolder: "",
    cardMonth: "",
    cardYear: "",
    cardCcv: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const selected = options.find((o) => o.id === tier)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="produto" value={produto} />
      <input type="hidden" name="tier" value={tier} />

      {/* Escolha do novo plano */}
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${
              tier === o.id ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="tier_pick"
                checked={tier === o.id}
                onChange={() => setTier(o.id)}
                className="accent-primary"
              />
              <span>
                <span className="font-display font-semibold">{o.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {o.incluso} {metric}/mês
                </span>
              </span>
            </span>
            <span className="font-mono text-sm">R$ {o.mensal.toFixed(2)}/mês</span>
          </label>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Pagamento no cartão</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Nova assinatura mensal, cobrança recorrente no cartão. A 1ª cobrança é feita agora.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Número do cartão</span>
        <input name="cardNumber" required inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={f.cardNumber} onChange={set("cardNumber")} className={field} />
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
      <div className="grid grid-cols-2 gap-2">
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

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !tier}
        className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending
          ? "Processando pagamento…"
          : selected
            ? `Assinar ${selected.label} — R$ ${selected.mensal.toFixed(2)}/mês`
            : "Confirmar upgrade"}
      </button>
      <p className="text-center font-mono text-xs text-muted-foreground">
        cobrança recorrente no cartão · a assinatura anterior é cancelada
      </p>
    </form>
  )
}
