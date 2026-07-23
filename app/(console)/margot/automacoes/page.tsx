import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, listAutomations, MargotError } from "@/lib/margot/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import type { Automation } from "@/lib/margot/types"
import { AutomationForm } from "./automation-form"

const TYPE_LABEL: Record<string, string> = {
  keyword: "Palavra-chave",
  welcome: "Boas-vindas",
  off_hours: "Fora do horário",
}

// Automações do atendimento (Margot Atendente): regras que respondem/encaminham
// antes de acionar a IA. Espelha o /admin/automacoes do spa-sapienza.
export default async function AutomacoesPage() {
  const ctx = await margotContext()

  let automations: Automation[] = []
  let unavailable: string | null = null
  try {
    automations = await listAutomations(ctx)
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
          · Automações
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Automações</h1>
        <p className="text-sm text-muted-foreground">
          Regras que respondem ou encaminham antes de acionar a IA — por palavra-chave, boas-vindas ou fora do
          horário. Avaliadas na ordem; a primeira que casar decide.
        </p>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
      ) : (
        <>
          {automations.length > 0 && (
            <div className="space-y-3">
              {automations.map((a) => (
                <details key={a.id} className="rounded-xl border border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {TYPE_LABEL[a.type] ?? a.type}
                    {!a.enabled && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}
                  </summary>
                  <div className="mt-4">
                    <AutomationForm automation={a} />
                  </div>
                </details>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-border p-4">
            <h2 className="mb-3 text-sm font-semibold">Nova automação</h2>
            <AutomationForm />
          </div>
        </>
      )}
    </div>
  )
}
