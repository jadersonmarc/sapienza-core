"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateContactAction } from "../actions"
import type { Contact, Stage } from "@/lib/margot/types"

function ContactCard({ contact, stages }: { contact: Contact; stages: Stage[] }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const move = (stageId: string) => {
    if (stageId === (contact.stage_id ?? "")) return
    startTransition(async () => {
      // PATCH é full-update no Margot: preserva nome/consent ao mover de estágio.
      await updateContactAction(contact.id, {
        name: contact.name ?? undefined,
        stage_id: stageId || undefined,
        consent: contact.consent,
      })
      router.refresh()
    })
  }

  return (
    <div className="rounded-md border border-border bg-card/40 p-2.5">
      <span className="block truncate text-sm font-medium">{contact.name || contact.phone}</span>
      {contact.name && (
        <span className="block truncate font-mono text-[11px] text-muted-foreground">{contact.phone}</span>
      )}
      <select
        value={contact.stage_id ?? ""}
        disabled={pending}
        onChange={(e) => move(e.target.value)}
        className="mt-2 w-full rounded border border-border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">mover para…</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}

// Kanban do funil (colunas por estágio + "Sem estágio"). Espelha o /admin/funil
// do spa-sapienza. Mover = updateContactAction (patchContact) preservando o resto.
export function FunnelBoard({ stages, contacts }: { stages: Stage[]; contacts: Contact[] }) {
  const byStage = new Map<string, Contact[]>(stages.map((s) => [s.id, []]))
  const unassigned: Contact[] = []
  for (const c of contacts) {
    const list = c.stage_id ? byStage.get(c.stage_id) : undefined
    if (list) list.push(c)
    else unassigned.push(c)
  }

  const columns = [
    ...stages.map((s) => ({ id: s.id, name: s.name, items: byStage.get(s.id) ?? [] })),
    { id: "_none", name: "Sem estágio", items: unassigned },
  ]

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.id} className="flex w-64 shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{col.name}</h2>
            <span className="font-mono text-xs text-muted-foreground">{col.items.length}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-md bg-foreground/[0.02] p-2">
            {col.items.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">vazio</p>
            ) : (
              col.items.map((c) => <ContactCard key={c.id} contact={c} stages={stages} />)
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
