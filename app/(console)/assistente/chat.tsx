"use client"

import { useState } from "react"
import type { ChatTurn } from "@/lib/insights/assistant"

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"

export function Chat({ motor, margot }: { motor: boolean; margot: boolean }) {
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const suggestions = [
    ...(motor ? ["Como foi meu mês no conteúdo?", "Qual pilar teve mais impressões?"] : []),
    ...(margot ? ["Quantas respostas e handoffs tivemos?", "Quanto do plano já usei?"] : []),
  ]

  async function send(text: string) {
    const q = text.trim()
    if (!q || pending) return
    const next: ChatTurn[] = [...history, { role: "user", content: q }]
    setHistory(next)
    setInput("")
    setError(null)
    setPending(true)
    try {
      const res = await fetch("/assistente/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: next }),
      })
      if (!res.ok || !res.body) {
        setError((await res.text().catch(() => "")) || "Falha ao consultar o assistente.")
        return
      }
      // Mensagem do assistente que vai sendo preenchida conforme o stream chega.
      setHistory((h) => [...h, { role: "assistant", content: "" }])
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        setHistory((h) => {
          const copy = [...h]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { role: "assistant", content: last.content + chunk }
          return copy
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de rede.")
    } finally {
      setPending(false)
    }
  }

  const lastIsStreamingAssistant = pending && history.at(-1)?.role === "assistant"

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
              {m.content || "…"}
            </span>
          </div>
        ))}
        {pending && !lastIsStreamingAssistant && <p className="text-sm text-muted-foreground">Analisando…</p>}
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
