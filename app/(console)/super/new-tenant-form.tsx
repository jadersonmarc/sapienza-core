"use client"

import { useActionState } from "react"
import { createTenantAction, type NewTenantState } from "./actions"

const initial: NewTenantState = {}
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

export function NewTenantForm() {
  const [state, action, pending] = useActionState(createTenantAction, initial)

  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <h2 className="text-sm font-semibold">Novo cliente</h2>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={label} htmlFor="name">
              Nome do cliente
            </label>
            <input id="name" name="name" className={field} required placeholder="Empresa Acme" />
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="owner_email">
              E-mail do owner
            </label>
            <input id="owner_email" name="owner_email" type="email" className={field} required placeholder="dono@acme.com" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Criando…" : "Criar cliente"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        </div>
      </form>

      {state.ok && state.ownerPassword && (
        <div className="space-y-1 rounded-lg bg-muted p-3">
          <p className="text-sm font-medium">Cliente criado — anote e repasse (mostrado uma vez):</p>
          <p className="text-sm">
            Slug: <span className="font-mono">{state.slug}</span>
          </p>
          <p className="text-sm">
            Login: <span className="font-mono">{state.ownerEmail}</span>
          </p>
          <p className="text-sm">
            Senha inicial: <code className="break-all">{state.ownerPassword}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            Agora ative uma assinatura para este cliente abaixo.
          </p>
        </div>
      )}
    </div>
  )
}
