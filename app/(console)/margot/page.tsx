import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { margotContext, getSetup, MargotError } from "@/lib/margot/client"
import type { SetupStatus } from "@/lib/margot/types"

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
          ok ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
        aria-hidden
      >
        {ok ? "✓" : "•"}
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </li>
  )
}

export default async function MargotPage() {
  const ctx = await margotContext()

  let setup: SetupStatus | null = null
  let unavailable: string | null = null
  try {
    setup = await getSetup(ctx)
  } catch (e) {
    unavailable = e instanceof MargotError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>Margot Atendente</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Atendimento no WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Opere o atendimento, configure a agente e acompanhe o onboarding.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/margot/atendimento"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Abrir inbox
        </Link>
        <Link
          href="/margot/configuracao"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Configurar agente
        </Link>
        <Link
          href="/margot/crm"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Funil de leads
        </Link>
      </div>

      {unavailable ? (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Não foi possível falar com o serviço do Margot ({unavailable}). Verifique{" "}
            <span className="font-mono">MARGOT_API_URL</span> e se o data plane está no ar.
          </p>
        </div>
      ) : (
        setup && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Status de onboarding</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              <Check
                ok={setup.subscription_active}
                label="Assinatura ativa"
                hint="Plano Margot ativo para este tenant."
              />
              <Check
                ok={setup.agent_configured}
                label="Agente configurada"
                hint="Prompt/tom/fallback definidos."
              />
              <Check
                ok={setup.channel_connected}
                label="Canal conectado"
                hint={
                  setup.driver === "evolution"
                    ? "Instância Evolution + número dedicado confirmado."
                    : `Driver ${setup.driver}.`
                }
              />
              <Check
                ok={setup.dedicated_number_confirmed}
                label="Número dedicado confirmado"
                hint="Requisito: nunca o número pessoal/principal."
              />
            </ul>
          </div>
        )
      )}
    </div>
  )
}
