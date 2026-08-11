import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, listMessages, listConversations, MargotError } from "@/lib/margot/client"
import type { Conversation, Message } from "@/lib/margot/types"
import { handoffAction } from "../../actions"
import { SendForm } from "./send-form"
import { ConversationDangerZone } from "./manage-conversation"

function when(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await margotContext()

  let messages: Message[] = []
  let conv: Conversation | null = null
  let unavailable: string | null = null
  try {
    const [msgs, convs] = await Promise.all([listMessages(ctx, id), listConversations(ctx)])
    messages = msgs
    conv = convs.find((c) => c.id === id) ?? null
  } catch (e) {
    unavailable = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  // Quem está no controle: humano = atendente assumiu; bot = atendimento automático.
  const human = conv?.mode === "human"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>
            <Link href="/margot/atendimento" className="hover:underline">
              Inbox
            </Link>{" "}
            · Conversa
          </Eyebrow>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {conv ? conv.contact_name || conv.contact_phone : "Atendimento"}
          </h1>
        </div>
        {conv && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Quem está no controle — indicador sempre visível. */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                human ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {human ? "🧑 Humano no controle" : "🤖 Bot no controle"}
            </span>
            {/* Só o botão que faz sentido para o estado atual. */}
            {human ? (
              <form action={handoffAction}>
                <input type="hidden" name="convId" value={id} />
                <input type="hidden" name="mode" value="bot" />
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                >
                  Devolver ao bot
                </button>
              </form>
            ) : (
              <form action={handoffAction}>
                <input type="hidden" name="convId" value={id} />
                <input type="hidden" name="mode" value="human" />
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Assumir (humano)
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Alerta: a conversa foi sinalizada (handoff automático ou agendamento). */}
      {conv?.needs_attention && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <strong>⚠ Precisa de atenção.</strong>{" "}
          {conv.attention_reason || "Esta conversa foi sinalizada para um humano."}
        </div>
      )}

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

          <ConversationDangerZone convId={id} />
        </>
      )}
    </div>
  )
}
