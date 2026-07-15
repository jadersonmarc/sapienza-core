import { redirect } from "next/navigation"
import { sql } from "drizzle-orm"
import { currentContext } from "@/lib/console/current"
import { db } from "@/lib/db"
import { Eyebrow } from "@/components/eyebrow"

// Visão Sapienza (super-admin): todos os tenants + contagem de assinaturas.
export default async function SuperPage() {
  const { user } = await currentContext()
  if (!user.isSuperadmin) redirect("/")

  const rows = (await db.execute(sql`
    SELECT t.name, t.slug,
           COUNT(s.id) FILTER (WHERE s.status = 'active') AS ativos,
           COALESCE(string_agg(DISTINCT s.produto::text, ', '), '—') AS produtos
      FROM public.tenants t
      LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
     GROUP BY t.id, t.name, t.slug
     ORDER BY t.name
  `)) as unknown as { name: string; slug: string; ativos: number; produtos: string }[]

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>Sapienza · Plataforma</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Todos os tenants</h1>
      </div>

      <div className="rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Tenant</th>
              <th className="px-4 py-2 font-medium">Slug</th>
              <th className="px-4 py-2 font-medium">Assinaturas ativas</th>
              <th className="px-4 py-2 font-medium">Produtos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-t border-border">
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.slug}</td>
                <td className="px-4 py-2">{r.ativos}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.produtos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
