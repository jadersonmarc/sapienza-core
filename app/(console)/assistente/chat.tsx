"use client"

import { useState, useTransition } from "react"
import { askAssistant } from "./actions"
import type { ChatTurn } from "@/lib/insights/assistant"

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"

export function Chat({ motor, margot }: { motor: boolean; margot: boolean }) {
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const suggestions = [
    ...(motor ? ["Como foi meu mês no conteúdo?", "Qual pilar teve mais impressões?"] : []),
    ...(margot ? ["Quantas respostas e handoffs tivemos?", "Quanto do plano já usei?"] : []),
  ]

  function send(text: string) {
    const q = text.trim()
    if (!q || pending) return
    const next: ChatTurn[] = [...history, { role: "user", content: q }]
    setHistory(next)
    setInput("")
    setError(null)
    startTransition(async () => {
      const res = await askAssistant(next)
      if (res.error) {
        setError(res.error)
        return
      }
      setHistory((h) => [...h, { role: "assistant", content: res.reply ?? "" }])
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="min-h-[240px] space-y-3 rounded-xl border border-border p-4">
        {history.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Comece com uma pergunta:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span
              className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {pending && <p className="text-sm text-muted-foreground">Analisando…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex gap-2"
      >
        <input
          className={field}
          placeholder="Pergunte sobre suas métricas…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
