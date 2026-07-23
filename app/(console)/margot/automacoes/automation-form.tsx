"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveAutomationAction, deleteAutomationAction } from "../actions"
import type { Automation, AutomationType } from "@/lib/margot/types"

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export function AutomationForm({ automation }: { automation?: Automation }) {
  const editing = !!automation
  const [type, setType] = useState<AutomationType>(automation?.type ?? "keyword")
  const [enabled, setEnabled] = useState(automation?.enabled ?? true)
  const [keywords, setKeywords] = useState((automation?.trigger.keywords ?? []).join(", "))
  const [reply, setReply] = useState(automation?.action.reply ?? "")
  const [handoff, setHandoff] = useState(automation?.action.handoff ?? false)
  const [timezone, setTimezone] = useState(automation?.trigger.timezone ?? "America/Sao_Paulo")
  const [start, setStart] = useState(automation?.trigger.start ?? "18:00")
  const [end, setEnd] = useState(automation?.trigger.end ?? "08:00")
  const [weekdays, setWeekdays] = useState<number[]>(automation?.trigger.weekdays ?? [1, 2, 3, 4, 5])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const toggleDay = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()))

  const save = () =>
    startTransition(async () => {
      setError(null)
      const trigger =
        type === "keyword"
          ? { keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) }
          : type === "off_hours"
            ? { timezone, weekdays, start, end }
            : {}
      const res = await saveAutomationAction({
        id: automation?.id,
        type,
        trigger,
        action: { reply: reply.trim() || undefined, handoff },
        enabled,
        position: automation?.position ?? 0,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      router.refresh()
    })

  const remove = () => {
    if (!automation) return
    if (!confirm("Excluir esta automação?")) return
    startTransition(async () => {
      await deleteAutomationAction(automation.id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Tipo</span>
          <select className={field} value={type} onChange={(e) => setType(e.target.value as AutomationType)}>
            <option value="keyword">Palavra-chave</option>
            <option value="welcome">Boas-vindas (1ª mensagem)</option>
            <option value="off_hours">Fora do horário</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Ativa</span>
        </label>
      </div>

      {type === "keyword" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Palavras-chave (separadas por vírgula)</span>
          <input
            className={field}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="preço, valor, orçamento"
          />
        </label>
      )}

      {type === "off_hours" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Início</span>
            <input type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Fim</span>
            <input type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Fuso</span>
            <input className={field} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            {WEEKDAYS.map((d, i) => (
              <label key={i} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={weekdays.includes(i)} onChange={() => toggleDay(i)} />
                {d}
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Resposta automática (opcional)</span>
        <textarea className={field} rows={2} value={reply} onChange={(e) => setReply(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} />
        <span>Encaminhar para atendente humano</span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Salvando…" : editing ? "Salvar" : "Criar automação"}
        </button>
        {editing && (
          <button
            onClick={remove}
            disabled={pending}
            className="rounded-md border border-border px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}
