"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { sendMessageAction, suggestReplyAction, type ActionState } from "../../actions"

const initial: ActionState = {}

/** Resposta manual do atendente (não faturável). Botão "Sugerir resposta (IA)"
 *  preenche o textarea com uma sugestão gerada pelo mesmo agente — o humano edita
 *  e envia. */
export function SendForm({ convId }: { convId: string }) {
  const [state, action, pending] = useActionState(sendMessageAction, initial)
  const formRef = useRef<HTMLFormElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [suggesting, startSuggest] = useTransition()
  const [suggestErr, setSuggestErr] = useState<string | null>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  const suggest = () =>
    startSuggest(async () => {
      setSuggestErr(null)
      const res = await suggestReplyAction(convId)
      if (res.error) {
        setSuggestErr(res.error)
        return
      }
      if (res.suggestion && textRef.current) {
        textRef.current.value = res.suggestion
        textRef.current.focus()
      }
    })

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="convId" value={convId} />
      <textarea
        ref={textRef}
        name="text"
        required
        rows={3}
        placeholder="Escreva uma resposta como atendente…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {suggesting ? "Sugerindo…" : "Sugerir resposta (IA)"}
        </button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        {suggestErr && <span className="text-sm text-destructive">{suggestErr}</span>}
      </div>
    </form>
  )
}
