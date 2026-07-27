"use client"

import { useActionState } from "react"
import { saveOwnerNameAction, type OwnerState } from "./actions"

const initial: OwnerState = {}
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

// Dados do titular da conta: nome editável; o e-mail é o login (somente leitura).
export function OwnerForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(saveOwnerNameAction, initial)

  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Titular da conta</h2>
        <p className="text-xs text-muted-foreground">Seus dados de acesso.</p>
      </div>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={label} htmlFor="name">
              Nome
            </label>
            <input id="name" name="name" defaultValue={name} className={field} required />
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="owner_email">
              E-mail (login)
            </label>
            <input
              id="owner_email"
              value={email}
              readOnly
              aria-readonly
              className={`${field} cursor-not-allowed text-muted-foreground`}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
          {state.ok && <span className="text-sm text-muted-foreground">Salvo.</span>}
        </div>
      </form>
    </div>
  )
}
