import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, listConversations, MargotError } from "@/lib/margot/client"
import type { Conversation } from "@/lib/margot/types"

function when(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export default async function AtendimentoPage() {
  const ctx = await margotContext()

  let conversations: Conversation[] = []
  let unavailable: string | null = null
  try {
    conversations = await listConversations(ctx)
  } catch (e) {
    unavailable = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/margot" className="hover:underline">
            Margot
          </Link>{" "}
          · Atendimento
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Inbox</h1>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
      ) : (
        <div className="rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Contato</th>
                <th className="px-4 py-2 font-medium">Modo</th>
                <th className="px-4 py-2 font-medium">Última mensagem</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-4 py-2">
                    <Link href={`/margot/atendimento/${c.id}`} className="hover:underline">
                      {c.contact_name || c.contact_phone}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{c.contact_phone}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        c.mode === "human" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.mode === "human" ? "humano" : "bot"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{when(c.last_message_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
