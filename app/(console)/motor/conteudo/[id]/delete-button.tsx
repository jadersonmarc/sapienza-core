"use client"

import { useActionState, useState } from "react"
import { deleteContentAction, type ActionState } from "../../actions"

const initial: ActionState = {}

/** Exclui a peça (com confirmação em dois passos). Ao concluir, a action
 *  redireciona para a lista. */
export function DeleteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteContentAction, initial)
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        Excluir peça
      </button>
    )
  }

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-muted-foreground">Excluir esta peça?</span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
      >
        {pending ? "Excluindo…" : "Confirmar"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-muted-foreground hover:underline">
        Cancelar
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}
