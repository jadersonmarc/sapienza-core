"use client"

import { useActionState } from "react"
import { runAnalysisAction, type ActionState } from "../../actions"
import type { Analysis, AnalysisType } from "@/lib/motor/types"

const initial: ActionState = {}

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
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

// Renderiza um payload de análise (formato varia por tipo) de forma genérica:
// arrays viram listas, escalares viram linha rótulo→valor.
function PayloadView({ payload }: { payload: unknown }) {
  if (payload == null || typeof payload !== "object") {
    return <p className="text-sm">{String(payload)}</p>
  }
  return (
    <dl className="space-y-1.5">
      {Object.entries(payload as Record<string, unknown>).map(([k, v]) => (
        <div key={k}>
          <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{k}</dt>
          <dd className="text-sm">
            {Array.isArray(v) ? (
              <ul className="ml-4 list-disc">
                {v.map((it, i) => (
                  <li key={i}>{String(it)}</li>
                ))}
              </ul>
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Analisadores de conteúdo (exigem IA no Motor — sem chave, o console mostra o erro
// da action). Botão por tipo + histórico de análises salvas.
export function AnalyzePanel({
  id,
  analyses,
  types,
}: {
  id: string
  analyses: Analysis[]
  types: { type: AnalysisType; label: string }[]
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Análises de IA</h2>
        {types.map((t) => (
          <RunButton key={t.type} id={id} type={t.type} label={t.label} />
        ))}
      </div>
      {analyses.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma análise ainda.</p>
      ) : (
        <div className="space-y-3">
          {analyses.map((a, i) => {
            const label = types.find((t) => t.type === a.type)?.label ?? a.type
            return (
              <div key={i} className="rounded-xl border border-border p-3">
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">{label}</p>
                <PayloadView payload={a.payload} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
