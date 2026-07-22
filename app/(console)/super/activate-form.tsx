"use client"

import { useActionState } from "react"
import { activateSubscriptionAction, type ActivateState } from "./actions"

const initial: ActivateState = {}
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

export function ActivateForm({ tenants }: { tenants: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(activateSubscriptionAction, initial)

  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <h2 className="text-sm font-semibold">Ativar assinatura</h2>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={label} htmlFor="tenant_id">
              Cliente
            </label>
            <select id="tenant_id" name="tenant_id" className={field} required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="produto">
              Produto
            </label>
            <select id="produto" name="produto" className={field} defaultValue="margot">
              <option value="margot">Margot (WhatsApp)</option>
              <option value="motor">Motor (conteúdo)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="tier">
              Plano
            </label>
            <select id="tier" name="tier" className={field} defaultValue="start">
              <option value="start">start</option>
              <option value="pro">pro</option>
              <option value="scale">scale</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hard_cap" className="h-4 w-4" />
          Cap rígido (bloqueia ao atingir o incluído, em vez de faturar excedente)
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Ativando…" : "Ativar"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
          {state.ok && <span className="text-sm text-muted-foreground">Assinatura ativada.</span>}
        </div>
      </form>
    </div>
  )
}
