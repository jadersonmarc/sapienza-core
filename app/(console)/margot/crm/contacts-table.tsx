"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateContactAction, deleteContactAction } from "../actions"
import type { Contact, Stage } from "@/lib/margot/types"

const cell =
  "w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
const btn = "rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"

function ContactRow({ contact, stages }: { contact: Contact; stages: Stage[] }) {
  const [name, setName] = useState(contact.name ?? "")
  const [stageId, setStageId] = useState(contact.stage_id ?? "")
  const [consent, setConsent] = useState(contact.consent)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const save = () =>
    startTransition(async () => {
      await updateContactAction(contact.id, {
        name: name.trim() || undefined,
        stage_id: stageId || undefined,
        consent,
      })
      router.refresh()
    })

  const remove = () => {
    if (!confirm("Excluir este contato e todas as suas conversas/mensagens? (LGPD, irreversível)")) return
    startTransition(async () => {
      await deleteContactAction(contact.id)
      router.refresh()
    })
  }

  return (
    <tr className="border-t border-border">
      <td className="p-2 font-mono text-xs text-muted-foreground">{contact.phone}</td>
      <td className="p-2">
        <input className={cell} value={name} onChange={(e) => setName(e.target.value)} placeholder="—" />
      </td>
      <td className="p-2">
        <select className={cell} value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">—</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 text-center">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      </td>
      <td className="p-2">
        <div className="flex justify-end gap-2">
          <button className={btn} onClick={save} disabled={pending}>
            Salvar
          </button>
          <button className={`${btn} text-destructive`} onClick={remove} disabled={pending}>
            Excluir
          </button>
        </div>
      </td>
    </tr>
  )
}

export function ContactsTable({ contacts, stages }: { contacts: Contact[]; stages: Stage[] }) {
  if (contacts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum contato ainda.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="p-2 font-medium">Telefone</th>
            <th className="p-2 font-medium">Nome</th>
            <th className="p-2 font-medium">Estágio</th>
            <th className="p-2 text-center font-medium">Consent.</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} stages={stages} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
