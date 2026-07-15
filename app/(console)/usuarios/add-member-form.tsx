"use client"

import { useActionState } from "react"
import { addMemberAction, type AddMemberState } from "./actions"

const initial: AddMemberState = {}

/** Formulário de add-member. Desabilita no teto de seats com CTA de upgrade. */
export function AddMemberForm({ atCap, tier, limit }: { atCap: boolean; tier: string; limit: number }) {
  const [state, action, pending] = useActionState(addMemberAction, initial)

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="email@empresa.com"
          disabled={atCap}
          className="min-w-56 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        />
        <select
          name="role"
          defaultValue="member"
          disabled={atCap}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
        <button
          type="submit"
          disabled={atCap || pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Adicionando…" : "Adicionar"}
        </button>
      </div>
      {atCap && (
        <p className="text-sm text-muted-foreground">
          Limite do plano <span className="font-mono uppercase">{tier}</span> atingido ({limit}). Faça
          upgrade para adicionar mais usuários.
        </p>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-muted-foreground">Usuário adicionado.</p>}
    </form>
  )
}
