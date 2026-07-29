"use client"

import { useActionState, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { runAnalysisAction, applyRecommendationAction, type ActionState } from "../../actions"
import type { Analysis, AnalysisType, ContentStatus } from "@/lib/motor/types"

const initial: ActionState = {}

// Chaves cujos itens são recomendações acionáveis (viram propostas via IA).
// Mesmo conjunto do admin do spa; casa com os schemas do Motor:
// quality.recommendations, seo.notes/headingTips, emotional.suggestions, thematic.relatedAreas.
const ACTIONABLE = new Set(["recommendations", "notes", "headingTips", "suggestions", "relatedAreas"])

// titleSuggestion → "Title Suggestion" (humaniza a chave como no spa).
function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function RunButton({ id, type, label }: { id: string; type: AnalysisType; label: string }) {
  const [state, action, pending] = useActionState(runAnalysisAction, initial)
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="type" value={type} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Analisando…" : label}
      </button>
      {pending && <span className="text-xs text-muted-foreground">pode levar até ~1min</span>}
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

// Uma linha de recomendação com botão "Aplicar" ao lado. Ao aplicar com sucesso,
// avisa o pai p/ tirar o item da lista (os outros permanecem até serem aplicados).
function ApplyRow({
  id,
  type,
  text,
  onApplied,
}: {
  id: string
  type: AnalysisType
  text: string
  onApplied: (text: string) => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const apply = () =>
    start(async () => {
      setError(null)
      const r = await applyRecommendationAction({ id, type, recommendation: text })
      if (r.error) {
        setError(r.error)
        return
      }
      onApplied(text)
      router.refresh()
    })
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm">{text}</span>
        <button
          onClick={apply}
          disabled={pending}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {pending ? "Aplicando…" : "Aplicar"}
        </button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </li>
  )
}

// Renderiza um payload de análise (formato varia por tipo) de forma genérica:
// arrays acionáveis viram lista com "Aplicar"; demais arrays viram lista simples;
// escalares viram linha rótulo→valor.
function PayloadView({
  id,
  type,
  payload,
  applied,
  onApplied,
}: {
  id: string
  type: AnalysisType
  payload: unknown
  applied: Set<string>
  onApplied: (text: string) => void
}) {
  if (payload == null || typeof payload !== "object") {
    return <p className="text-sm">{String(payload)}</p>
  }
  return (
    <dl className="space-y-1.5">
      {Object.entries(payload as Record<string, unknown>).map(([k, v]) => {
        const isActionable = ACTIONABLE.has(k) && Array.isArray(v)
        const items = Array.isArray(v) ? (v as unknown[]).map(String) : []
        const visible = isActionable ? items.filter((it) => !applied.has(it)) : items
        // Recomendações acionáveis já 100% aplicadas somem da lista.
        if (isActionable && visible.length === 0) return null
        return (
          <div key={k}>
            <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{humanize(k)}</dt>
            <dd className="text-sm">
              {isActionable ? (
                <ul className="ml-1 space-y-1">
                  {visible.map((it) => (
                    <ApplyRow key={it} id={id} type={type} text={it} onApplied={onApplied} />
                  ))}
                </ul>
              ) : Array.isArray(v) ? (
                <ul className="ml-4 list-disc">
                  {items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              ) : (
                String(v)
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// Analisadores de conteúdo (exigem IA no Motor). Botão por tipo + histórico de
// análises salvas, com "Aplicar" nas recomendações (vira proposta no painel de
// Melhorias). Aviso quando a peça já foi publicada/arquivada.
export function AnalyzePanel({
  id,
  status,
  analyses,
  types,
  appliedRecommendations,
  loadError,
}: {
  id: string
  status: ContentStatus
  analyses: Analysis[]
  types: { type: AnalysisType; label: string }[]
  appliedRecommendations: string[]
  loadError?: string | null
}) {
  const isLocked = status === "published" || status === "archived"
  const [locallyApplied, setLocallyApplied] = useState<string[]>([])
  const applied = useMemo(
    () => new Set([...appliedRecommendations, ...locallyApplied]),
    [appliedRecommendations, locallyApplied],
  )
  const onApplied = (text: string) => setLocallyApplied((prev) => [...prev, text])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Análises de IA</h2>
        {types.map((t) => (
          <RunButton key={t.type} id={id} type={t.type} label={t.label} />
        ))}
      </div>

      {isLocked && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Esta peça já foi publicada — as análises e recomendações servem só como referência (não há como
          aplicá-las na versão que já foi ao ar).
        </p>
      )}

      {loadError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível carregar as análises salvas: {loadError}
        </p>
      )}

      {analyses.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma análise ainda.</p>
      ) : (
        <div className="space-y-3">
          {analyses.map((a, i) => {
            const label = types.find((t) => t.type === a.type)?.label ?? a.type
            return (
              <div key={i} className="rounded-xl border border-border p-3">
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">{label}</p>
                <PayloadView id={id} type={a.type} payload={a.payload} applied={applied} onApplied={onApplied} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
