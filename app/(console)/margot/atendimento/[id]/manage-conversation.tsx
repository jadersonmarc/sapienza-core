"use client"

import { useState, useTransition } from "react"
import { clearConversationAction, deleteConversationAction } from "../../actions"

// Limpar: apaga o histórico e reinicia a conversa no bot (mantém o lead). Resolve
// o caso de limpar no WhatsApp mas o console seguir com mensagens antigas que
// confundem a IA. Apagar: remove a conversa inteira (o contato fica no CRM).
// Ambas pedem uma confirmação inline (sem diálogo bloqueante do navegador).
export function ConversationDangerZone({ convId }: { convId: string }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<"clear" | "delete" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (kind: "clear" | "delete") =>
    startTransition(async () => {
      setError(null)
      const fd = new FormData()
      fd.set("convId", convId)
      // Delete sucedido faz redirect no server (nunca resolve com estado); só o clear
      // e o caminho de erro voltam com { ok } | { error }, e o UI exibe a mensagem.
      const state =
        kind === "clear" ? await clearConversationAction(fd) : await deleteConversationAction(fd)
      if (state?.error) {
        setError(state.error)
        return
      }
      setConfirming(null)
    })

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="space-y-0.5">
        <h2 className="text-sm font-medium">Gerenciar conversa</h2>
        <p className="text-xs text-muted-foreground">
          <strong>Limpar</strong> apaga o histórico e reinicia no bot (o lead continua no
          CRM). <strong>Apagar</strong> remove a conversa inteira.
        </p>
      </div>

      {confirming === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming("clear")}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Limpar conversa
          </button>
          <button
            type="button"
            onClick={() => setConfirming("delete")}
            disabled={pending}
            className="rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Apagar conversa
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {confirming === "clear"
              ? "Limpar todo o histórico desta conversa?"
              : "Apagar esta conversa por completo?"}
          </span>
          <button
            type="button"
            onClick={() => run(confirming)}
            disabled={pending}
            className={`rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 ${
              confirming === "delete" ? "bg-destructive" : "bg-primary"
            }`}
          >
            {pending ? "Processando…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
