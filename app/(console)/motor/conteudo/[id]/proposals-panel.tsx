"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { applyRecommendationAction, acceptProposalAction, discardProposalAction } from "../../actions"
import { lineDiff, diffStats } from "@/lib/content/diff"
import type { Proposal } from "@/lib/motor/types"

function Diff({ oldText, newText }: { oldText: string; newText: string }) {
  const lines = lineDiff(oldText, newText)
  const { added, removed } = diffStats(lines)
  return (
    <div className="space-y-1">
      <p className="font-mono text-xs text-muted-foreground">
        +{added} −{removed} linha(s)
      </p>
      <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.type === "add"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : l.type === "del"
                  ? "bg-destructive/15 text-destructive"
                  : ""
            }
          >
            <span className="select-none opacity-50">
              {l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}
            </span>
            {l.text || " "}
          </div>
        ))}
      </pre>
    </div>
  )
}

// Melhorias com IA: o usuário descreve uma recomendação → a IA gera uma revisão
// PROPOSTA (não vira current). O diff mostra a mudança; aceitar torna current,
// descartar remove. Espelha o fluxo de propostas do admin do spa.
export function ProposalsPanel({
  id,
  currentBody,
  proposals,
}: {
  id: string
  currentBody: string
  proposals: Proposal[]
}) {
  const [rec, setRec] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const generate = () =>
    start(async () => {
      setError(null)
      const r = await applyRecommendationAction({ id, recommendation: rec.trim() })
      if (r.error) {
        setError(r.error)
        return
      }
      setRec("")
      router.refresh()
    })
  const accept = (pid: string) =>
    start(async () => {
      await acceptProposalAction(id, pid)
      router.refresh()
    })
  const discard = (pid: string) =>
    start(async () => {
      await discardProposalAction(id, pid)
      router.refresh()
    })

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">Melhorias com IA</h2>

      <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
        <textarea
          value={rec}
          onChange={(e) => setRec(e.target.value)}
          rows={2}
          placeholder="Descreva a melhoria (ex.: deixe o gancho mais forte; adicione um exemplo prático)…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={generate}
            disabled={pending || !rec.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Gerando…" : "Gerar proposta com IA"}
          </button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>

      {proposals.map((p) => (
        <div key={p.id} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{p.title}</p>
              {p.proposed_from?.recommendation && (
                <p className="text-xs text-muted-foreground">Recomendação: {p.proposed_from.recommendation}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => accept(p.id)}
                disabled={pending}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Aceitar
              </button>
              <button
                onClick={() => discard(p.id)}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          </div>
          <Diff oldText={currentBody} newText={p.body_markdown} />
        </div>
      ))}
    </div>
  )
}
