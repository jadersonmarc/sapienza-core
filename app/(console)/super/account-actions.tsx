"use client"

import { useActionState, useState } from "react"
import { cancelAccountAction, deleteAccountAction, type AccountState } from "./actions"

const initial: AccountState = {}

// Ações no nível da CONTA (super-admin): cancelar (bloqueia todos os produtos) e
// excluir (definitivo — pede digitar o nome exato). Duas etapas, nunca 1 clique.
export function AccountActions({ tenantId, name }: { tenantId: string; name: string }) {
  const [cancelState, cancelAction, canceling] = useActionState(cancelAccountAction, initial)
  const [delState, delAction, deleting] = useActionState(deleteAccountAction, initial)
  const [mode, setMode] = useState<"idle" | "cancel" | "delete">("idle")

  if (cancelState.ok) return <span className="font-mono text-xs text-muted-foreground">conta cancelada</span>
  if (delState.ok) return <span className="font-mono text-xs text-muted-foreground">conta excluída</span>

  if (mode === "cancel") {
    return (
      <form action={cancelAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" name="confirm" className="accent-destructive" />
          cancelar todas as assinaturas?
        </label>
        <button type="submit" disabled={canceling} className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">
          {canceling ? "…" : "Confirmar"}
        </button>
        <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted-foreground hover:underline">
          voltar
        </button>
        {cancelState.error && <span className="text-xs text-destructive">{cancelState.error}</span>}
      </form>
    )
  }

  if (mode === "delete") {
    return (
      <form action={delAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <span className="text-xs text-muted-foreground">
          Digite <span className="font-mono text-foreground">{name}</span> para excluir:
        </span>
        <input name="confirm_name" placeholder="nome do cliente" className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
        <button type="submit" disabled={deleting} className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-50">
          {deleting ? "excluindo…" : "Excluir definitivamente"}
        </button>
        <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted-foreground hover:underline">
          voltar
        </button>
        {delState.error && <span className="text-xs text-destructive">{delState.error}</span>}
      </form>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => setMode("cancel")} className="text-xs text-destructive hover:underline">
        Cancelar conta
      </button>
      <button type="button" onClick={() => setMode("delete")} className="text-xs text-destructive hover:underline">
        Excluir
      </button>
    </div>
  )
}
