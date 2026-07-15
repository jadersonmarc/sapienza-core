import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, listMessages, MargotError } from "@/lib/margot/client"
import type { Message } from "@/lib/margot/types"
import { handoffAction } from "../../actions"
import { SendForm } from "./send-form"

function when(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await margotContext()

  let messages: Message[] = []
  let unavailable: string | null = null
  try {
    messages = await listMessages(ctx, id)
  } catch (e) {
    unavailable = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>
            <Link href="/margot/atendimento" className="hover:underline">
              Inbox
            </Link>{" "}
            · Conversa
          </Eyebrow>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Atendimento</h1>
        </div>
        <form action={handoffAction}>
          <input type="hidden" name="convId" value={id} />
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Assumir (handoff humano)
          </button>
        </form>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border border-border p-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem mensagens nesta conversa.</p>
            )}
            {messages.map((m) => {
              const outbound = m.direction === "out"
              return (
                <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      outbound ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        outbound ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {m.sender} · {when(m.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <SendForm convId={id} />
        </>
      )}
    </div>
  )
}
