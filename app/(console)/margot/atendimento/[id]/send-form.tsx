"use client"

import { useActionState, useEffect, useRef } from "react"
import { sendMessageAction, type ActionState } from "../../actions"

const initial: ActionState = {}

/** Formulário de resposta manual do atendente (não faturável — só a IA fatura). */
export function SendForm({ convId }: { convId: string }) {
  const [state, action, pending] = useActionState(sendMessageAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="convId" value={convId} />
      <textarea
        name="text"
        required
        rows={3}
        placeholder="Escreva uma resposta como atendente…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  )
}
