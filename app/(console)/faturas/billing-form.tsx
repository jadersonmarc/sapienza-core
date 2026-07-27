"use client"

import { useActionState } from "react"
import { saveBillingIdentityAction, type BillingState } from "./actions"
import type { BillingIdentity } from "@/lib/tenant/billing"

const initial: BillingState = {}
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

// Dados de cobrança do tenant. Necessários para emitir Pix/boleto — sem eles, as
// faturas são calculadas mas não geram cobrança.
export function BillingForm({
  identity,
  taxIdReadOnly = false,
}: {
  identity: BillingIdentity
  // Em Minha Conta o CPF/CNPJ é somente-leitura (altera-se em Faturas). O input
  // read-only ainda ENVIA o valor atual, então o saveBillingIdentity revalida o
  // mesmo taxId sem quebrar.
  taxIdReadOnly?: boolean
}) {
  const [state, action, pending] = useActionState(saveBillingIdentityAction, initial)
  const pronto = Boolean(identity.asaasCustomerId)

  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Dados de cobrança</h2>
        <p className="text-xs text-muted-foreground">
          Usados para emitir Pix/boleto. {pronto ? "Cadastro de cobrança ativo." : "Preencha para habilitar as cobranças."}
        </p>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-1">
          <label className={label} htmlFor="legal_name">
            Razão social / nome
          </label>
          <input id="legal_name" name="legal_name" defaultValue={identity.legalName} className={field} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={label} htmlFor="tax_id">
              CPF / CNPJ
            </label>
            <input
              id="tax_id"
              name="tax_id"
              defaultValue={identity.taxId}
              className={taxIdReadOnly ? `${field} cursor-not-allowed text-muted-foreground` : field}
              readOnly={taxIdReadOnly}
              aria-readonly={taxIdReadOnly || undefined}
              required
            />
            {taxIdReadOnly && (
              <p className="text-xs text-muted-foreground">Para alterar o CPF/CNPJ, use a aba Faturas.</p>
            )}
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="billing_email">
              E-mail de cobrança
            </label>
            <input id="billing_email" name="billing_email" type="email" defaultValue={identity.billingEmail} className={field} required />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Salvando…" : "Salvar dados de cobrança"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
          {state.ok && !state.warn && <span className="text-sm text-muted-foreground">Salvo.</span>}
        </div>
        {state.warn && <p className="text-sm text-amber-600 dark:text-amber-500">{state.warn}</p>}
      </form>
    </div>
  )
}
