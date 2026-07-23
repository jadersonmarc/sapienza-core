"use client"

import { useActionState } from "react"
import { cancelSubscriptionAction, type CancelState } from "./actions"

// Cancelamento manual de UMA assinatura. Exige marcar a confirmação (não é 1 clique).
export function CancelForm({
  tenantId,
  produto,
}: {
  tenantId: string
  produto: string
}) {
  const [state, formAction, pending] = useActionState<CancelState, FormData>(cancelSubscriptionAction, {})

  if (state.ok) {
    return <span className="font-mono text-xs text-muted-foreground">cancelada</span>
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="produto" value={produto} />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" name="confirm" className="accent-destructive" />
        confirmo
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        {pending ? "cancelando..." : "Cancelar"}
      </button>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  )
}
