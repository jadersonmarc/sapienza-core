import { desc, eq } from "drizzle-orm"
import { currentContext } from "@/lib/console/current"
import { db, schema } from "@/lib/db"
import { Eyebrow } from "@/components/eyebrow"

type Line = { produto: string; tier: string; count: number; incluso: number; excedente: number; subtotal: number }

export default async function FaturasPage() {
  const { active } = await currentContext()
  if (!active) return null

  const invoices = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.tenantId, active.id))
    .orderBy(desc(schema.invoices.period))

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>{active.name}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Faturas</h1>
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma fatura emitida ainda.</p>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => {
            const lines = (inv.lines as Line[]) ?? []
            return (
              <div key={inv.id} className="rounded-xl border border-border p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{inv.period}</span>
                  <span className="font-display text-lg font-semibold">
                    R$ {Number(inv.totalBrl).toFixed(2)}
                  </span>
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
