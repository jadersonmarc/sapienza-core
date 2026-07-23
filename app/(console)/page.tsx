import { currentContext, subscribedProducts } from "@/lib/console/current"
import { tierLabel } from "@/lib/pricing/tier-label"
import { Eyebrow } from "@/components/eyebrow"

// Home do console: só os produtos que o tenant ATIVO assina, com uso vs incluso.
export default async function ConsoleHome() {
  const { active } = await currentContext()
  if (!active) return null
  const products = await subscribedProducts(active.id)

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Eyebrow>{active.name}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Suas ferramentas</h1>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum produto assinado ainda. Fale com a Sapienza para ativar Margot ou Motor.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((p) => {
            const pct = p.incluso > 0 ? Math.min(100, Math.round((p.count / p.incluso) * 100)) : 0
            const over = Math.max(0, p.count - p.incluso)
            return (
              <div key={p.produto} className="glass rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-semibold">{p.nome}</span>
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {tierLabel(p.tier)} · {p.status}
                  </span>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {p.count} / {p.incluso} {p.metric}s
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={over > 0 ? "h-full bg-signal" : "h-full bg-primary"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {over > 0 && (
                    <p className="text-xs text-signal">
                      {over} excedente(s) × R$ {p.excedenteUnitario.toFixed(2)}
                      {p.hardCap ? " · cap rígido" : ""}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
