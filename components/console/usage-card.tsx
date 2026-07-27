import type { ProductCard } from "@/lib/console/current"
import { tierLabel, metricPlural } from "@/lib/pricing/tier-label"

// Card de uso de um produto assinado, com cópia honesta sobre a regra de negócio:
// o `incluso` são unidades INCLUSAS no mês (não um teto), salvo quando hard_cap;
// e mostra QUANDO a cota renova (estilo Claude). Reusado na home e em Minha Conta.
export function UsageCard({ p, action }: { p: ProductCard; action?: React.ReactNode }) {
  const pct = p.incluso > 0 ? Math.min(100, Math.round((p.count / p.incluso) * 100)) : 0
  const over = Math.max(0, p.count - p.incluso)
  const metric = metricPlural(p.metric)
  const blocked = p.hardCap && p.count >= p.incluso

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-semibold">{p.nome}</span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {tierLabel(p.tier)} · {p.status}
        </span>
      </div>

      <div className="mt-4 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            <span className="text-foreground">{p.count}</span> de {p.incluso} {metric} este mês
          </span>
          <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={over > 0 ? "h-full bg-signal" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Renovação da cota (estilo "renova em N dias"). */}
        <p className="pt-1 text-xs text-muted-foreground">
          Renova {p.renewal.label} · em {p.renewal.daysLeft} {p.renewal.daysLeft === 1 ? "dia" : "dias"}
        </p>

        {/* Regra de excedente vs. limite rígido. */}
        {p.hardCap ? (
          <p className={`text-xs ${blocked ? "text-destructive" : "text-muted-foreground"}`}>
            {blocked
              ? `Limite atingido — publica até ${p.incluso} ${metric}/mês (limite rígido).`
              : `Limite rígido: até ${p.incluso} ${metric}/mês.`}
          </p>
        ) : over > 0 ? (
          <p className="text-xs text-signal">
            {over} excedente(s) × R$ {p.excedenteUnitario.toFixed(2)} = R${" "}
            {(over * p.excedenteUnitario).toFixed(2)} este mês
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Acima de {p.incluso}: R$ {p.excedenteUnitario.toFixed(2)} por {p.metric === "peca" ? "peça" : "unidade"}.
          </p>
        )}
      </div>

      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
