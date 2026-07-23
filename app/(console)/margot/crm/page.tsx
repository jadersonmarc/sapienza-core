import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, listContacts, listPipeline, MargotError } from "@/lib/margot/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { Contact, Stage } from "@/lib/margot/types"
import { ContactsTable } from "./contacts-table"

// Funil de leads da Margot Atendente: contatos capturados pelo atendimento,
// agrupados por estágio do pipeline. Espelha o CRM do admin do spa-sapienza.
export default async function CrmPage() {
  const ctx = await margotContext()

  let contacts: Contact[] = []
  let stages: Stage[] = []
  let unavailable: string | null = null
  try {
    ;[contacts, stages] = await Promise.all([listContacts(ctx), listPipeline(ctx)])
  } catch (e) {
    unavailable = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/margot" className="hover:underline">
            {produtoLabel("margot")}
          </Link>{" "}
          · Funil
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Funil de leads</h1>
        <p className="text-sm text-muted-foreground">
          Contatos capturados pelo atendimento, qualificados por estágio.
        </p>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : (
        <>
          {stages.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {stages.map((s) => (
                <div key={s.id} className="rounded-xl border border-border p-4">
                  <p className="text-sm text-muted-foreground">{s.name}</p>
                  <p className="font-display text-2xl font-semibold">{s.count}</p>
                </div>
              ))}
            </div>
          )}
          <ContactsTable contacts={contacts} stages={stages} />
        </>
      )}
    </div>
  )
}
