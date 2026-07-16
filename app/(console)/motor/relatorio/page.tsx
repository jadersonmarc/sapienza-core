import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext, listContent, MotorError } from "@/lib/motor/client"
import { motorMonthlyBilling, currentPeriod } from "@/lib/motor/report"
import type { ContentItem, ContentStatus } from "@/lib/motor/types"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "rascunho",
  in_review: "em aprovação",
  scheduled: "agendada",
  published: "publicada",
  archived: "arquivada",
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default async function RelatorioPage() {
  const ctx = await motorContext()
  const period = currentPeriod()

  const billing = await motorMonthlyBilling(ctx.tenantId, period)

  let items: ContentItem[] = []
  let unavailable: string | null = null
  try {
    items = await listContent(ctx)
  } catch (e) {
    unavailable = e instanceof MotorError ? `${e.status} — ${e.message}` : "serviço indisponível"
  }

  const byStatus = items.reduce<Record<string, number>>((acc, it) => {
    acc[it.status] = (acc[it.status] ?? 0) + 1
    return acc
  }, {})
  const publishedThisMonth = items.filter(
    (it) => it.published_at && it.published_at.slice(0, 7) === period,
  ).length

  const monthLabel = new Date(`${period}-01T00:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            Motor
          </Link>{" "}
          · Relatório
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Relatório do mês</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono text-xs">{period}</span> · {monthLabel}. Prévia — a fatura é
          fechada no fim do ciclo.
        </p>
      </div>

      {billing ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Faturamento (peças publicadas)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Plano" value={billing.tier} hint={`${brl(billing.mensal)}/mês`} />
            <Stat
              label="Peças publicadas"
              value={`${billing.count}`}
              hint={`incluídas: ${billing.incluso}`}
            />
            <Stat
              label="Excedente"
              value={brl(billing.excedente)}
              hint={`${Math.max(0, billing.count - billing.incluso)} × ${brl(billing.excedenteUnitario)}`}
            />
            <Stat label="Estimado no mês" value={brl(billing.subtotal)} hint="mensalidade + excedente" />
          </div>
          {billing.hardCap && billing.count >= billing.incluso && (
            <p className="text-xs text-destructive">
              Hard cap atingido: novas publicações ficam bloqueadas até o próximo ciclo ou upgrade.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sem assinatura Motor ativa para faturar.</p>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Atividade editorial</h2>
        {unavailable ? (
          <p className="text-sm text-muted-foreground">Serviço indisponível ({unavailable}).</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="Total de peças" value={`${items.length}`} />
              <Stat label="Publicadas neste mês" value={`${publishedThisMonth}`} />
              <Stat
                label="Em produção"
                value={`${(byStatus.draft ?? 0) + (byStatus.in_review ?? 0) + (byStatus.scheduled ?? 0)}`}
                hint="rascunho + aprovação + agendadas"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABEL) as ContentStatus[]).map((s) => (
                <span key={s} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                  {STATUS_LABEL[s]}: <span className="font-mono">{byStatus[s] ?? 0}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
