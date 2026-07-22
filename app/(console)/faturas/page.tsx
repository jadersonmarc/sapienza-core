import { desc, eq } from "drizzle-orm"
import { currentContext } from "@/lib/console/current"
import { db, schema } from "@/lib/db"
import { getBillingIdentity } from "@/lib/tenant/billing"
import { Eyebrow } from "@/components/eyebrow"
import { BillingForm } from "./billing-form"

type Line = { produto: string; tier: string; count: number; incluso: number; excedente: number; subtotal: number }

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paga", cls: "bg-primary/15 text-primary" },
  overdue: { label: "Vencida", cls: "bg-destructive/15 text-destructive" },
  issued: { label: "Em aberto", cls: "bg-muted text-muted-foreground" },
  open: { label: "Em aberto", cls: "bg-muted text-muted-foreground" },
  void: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
}

export default async function FaturasPage() {
  const { active } = await currentContext()
  if (!active) return null

  const [invoices, identity] = await Promise.all([
    db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.tenantId, active.id))
      .orderBy(desc(schema.invoices.period)),
    getBillingIdentity(active.id),
  ])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>{active.name}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Faturas</h1>
      </div>

      <BillingForm identity={identity} />

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma fatura emitida ainda.</p>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => {
            const lines = (inv.lines as Line[]) ?? []
            const st = STATUS[inv.status] ?? STATUS.issued
            const payable = inv.paymentUrl && inv.status !== "paid" && inv.status !== "void"
            return (
              <div key={inv.id} className="rounded-xl border border-border p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{inv.period}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    {inv.dueDate && inv.status !== "paid" && (
                      <span className="text-xs text-muted-foreground">vence {String(inv.dueDate)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-semibold">
                      R$ {Number(inv.totalBrl).toFixed(2)}
                    </span>
                    {payable && (
                      <a
                        href={inv.paymentUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      >
                        Pagar
                      </a>
                    )}
                  </div>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 font-medium">Produto</th>
                      <th className="py-1 font-medium">Tier</th>
                      <th className="py-1 text-right font-medium">Uso/Incluso</th>
                      <th className="py-1 text-right font-medium">Excedente</th>
                      <th className="py-1 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">{l.produto}</td>
                        <td className="py-1 font-mono text-xs">{l.tier}</td>
                        <td className="py-1 text-right">{l.count}/{l.incluso}</td>
                        <td className="py-1 text-right">R$ {Number(l.excedente).toFixed(2)}</td>
                        <td className="py-1 text-right">R$ {Number(l.subtotal).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
