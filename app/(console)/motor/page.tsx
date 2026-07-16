import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, getSetup, MotorError } from "@/lib/motor/client"
import type { SetupStatus } from "@/lib/motor/types"

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

export default async function MotorPage() {
  const ctx = await motorContext()

  let setup: SetupStatus | null = null
  let unavailable: string | null = null
  try {
    setup = await getSetup(ctx)
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>Motor de Conteúdo</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Conteúdo multi-canal</h1>
        <p className="text-sm text-muted-foreground">
          Gere peças, aprove (janela de 48h) e publique nos canais conectados.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/motor/conteudo"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Ver conteúdo
        </Link>
        <Link
          href="/motor/calendario"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Calendário
        </Link>
        <Link
          href="/motor/canais"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Configurar canais
        </Link>
      </div>

      {unavailable ? (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Não foi possível falar com o serviço do Motor ({unavailable}). Verifique{" "}
            <span className="font-mono">MOTOR_API_URL</span> e se o data plane está no ar.
          </p>
        </div>
      ) : (
        setup && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Status de onboarding</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              <Check
                ok={setup.active}
                label="Assinatura ativa"
                hint={setup.tier ? `Plano Motor ${setup.tier} ativo.` : "Plano Motor ativo para este tenant."}
              />
              <Check
                ok={setup.connected.length > 0}
                label="Canal conectado"
                hint={
                  setup.channelLimit > 0
                    ? `${setup.connected.length}/${setup.channelLimit} canal(is) — ${setup.connected.join(", ") || "nenhum"}.`
                    : "Nenhum canal disponível no plano."
                }
              />
            </ul>
            {setup.available.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Disponíveis para conectar:{" "}
                <span className="font-mono">{setup.available.map((a) => a.platform).join(", ")}</span>.
              </p>
            )}
          </div>
        )
      )}
    </div>
  )
}
