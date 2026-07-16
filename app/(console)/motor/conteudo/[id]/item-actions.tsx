"use client"

import { useActionState } from "react"
import {
  transitionAction,
  regenerateAction,
  publishAction,
  rejectAction,
  type ActionState,
} from "../../actions"
import type { ContentStatus } from "@/lib/motor/types"

const initial: ActionState = {}

/** Botão que dispara uma transição de estado simples (in_review / draft / archived). */
function TransitionButton({
  id,
  to,
  label,
  variant = "outline",
}: {
  id: string
  to: ContentStatus
  label: string
  variant?: "primary" | "outline"
}) {
  const [state, action, pending] = useActionState(transitionAction, initial)
  const cls =
    variant === "primary"
      ? "bg-primary text-primary-foreground"
      : "border border-border hover:bg-muted"
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${cls}`}
      >
        {pending ? "…" : label}
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

/** Publica nos canais habilitados (transição→published faturável na 1ª vez). */
function PublishButton({ id, label = "Publicar agora" }: { id: string; label?: string }) {
  const [state, action, pending] = useActionState(publishAction, initial)
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Publicando…" : label}
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

/** Agenda a publicação (exige data/hora futura). */
function ScheduleForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(transitionAction, initial)
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value="scheduled" />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Agendar para</label>
        <input
          type="datetime-local"
          name="scheduledAt"
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {pending ? "…" : "Agendar"}
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

/** Rejeição explícita: volta a peça para rascunho com um motivo (auditado). */
function RejectForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(rejectAction, initial)
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Rejeitar (volta a rascunho)</label>
      <input type="hidden" name="id" value={id} />
      <textarea
        name="note"
        required
        rows={2}
        placeholder="Motivo da rejeição (fica no histórico)…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {pending ? "…" : "Rejeitar"}
        </button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  )
}

/** Regenera o rascunho via IA (limite de 2/peça; a 3ª retorna 409). */
function RegenerateForm({ id, disabled }: { id: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(regenerateAction, initial)
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <label className="text-sm font-medium">Regenerar rascunho</label>
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="prompt"
        placeholder="Ajuste opcional (ex.: tom mais direto)…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {pending ? "Regenerando…" : "Regenerar"}
        </button>
        {disabled && <span className="text-xs text-muted-foreground">Limite de regenerações atingido.</span>}
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  )
}

/** Ações contextuais por status (espelha a máquina de estados do Motor). */
export function ItemActions({
  id,
  status,
  regenBlocked,
}: {
  id: string
  status: ContentStatus
  regenBlocked: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        {status === "draft" && (
          <TransitionButton id={id} to="in_review" label="Enviar para aprovação" />
        )}
        {/* Em aprovação, o publish É a aprovação explícita (antecipa a janela de 48h). */}
        {status === "in_review" && <PublishButton id={id} label="Aprovar e publicar" />}
        {(status === "draft" || status === "scheduled") && <PublishButton id={id} />}
        {status === "published" && <TransitionButton id={id} to="archived" label="Arquivar" />}
        {(status === "published" || status === "archived") && (
          <TransitionButton id={id} to="draft" label="Voltar a rascunho" />
        )}
        {status === "scheduled" && <TransitionButton id={id} to="draft" label="Voltar a rascunho" />}
      </div>

      {status === "in_review" && <RejectForm id={id} />}

      {(status === "draft" || status === "in_review") && <ScheduleForm id={id} />}

      {status !== "published" && status !== "archived" && (
        <RegenerateForm id={id} disabled={regenBlocked} />
      )}
    </div>
  )
}
