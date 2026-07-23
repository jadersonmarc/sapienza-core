import { redirect } from "next/navigation"
import { sql } from "drizzle-orm"
import { currentContext } from "@/lib/console/current"
import { db } from "@/lib/db"
import { tierLabel } from "@/lib/pricing/tier-label"
import { mesesRestantes, multaCancelamento, FIDELIDADE_MESES } from "@/lib/billing/fidelidade"
import { Eyebrow } from "@/components/eyebrow"
import { NewTenantForm } from "./new-tenant-form"
import { ActivateForm } from "./activate-form"
import { CancelForm } from "./cancel-form"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

// Visão Sapienza (super-admin): onboarding (criar cliente + ativar assinatura) +
// todos os tenants.
export default async function SuperPage() {
  const { user } = await currentContext()
  if (!user.isSuperadmin) redirect("/")

  const rows = (await db.execute(sql`
    SELECT t.id, t.name, t.slug,
           COUNT(s.id) FILTER (WHERE s.status = 'active') AS ativos,
           COALESCE(string_agg(DISTINCT s.produto::text, ', '), '—') AS produtos
      FROM public.tenants t
      LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
     GROUP BY t.id, t.name, t.slug
     ORDER BY t.name
  `)) as unknown as { id: string; name: string; slug: string; ativos: number; produtos: string }[]

  // Assinaturas ativas com o marco da fidelidade (12 meses) + multa sugerida — guia
  // para o superadmin no cancelamento manual (cliente pede por contato).
  const subs = (await db.execute(sql`
    SELECT s.tenant_id, t.name, s.produto::text AS produto, s.tier, s.activated_at, p.mensal
      FROM public.subscriptions s
      JOIN public.tenants t ON t.id = s.tenant_id
      JOIN public.plans p ON p.produto = s.produto AND p.tier = s.tier
     WHERE s.status = 'active'
     ORDER BY t.name, s.produto
  `)) as unknown as { tenant_id: string; name: string; produto: string; tier: string; activated_at: string; mensal: string }[]

  const now = new Date()
  const ativos = subs.map((s) => {
    const at = new Date(s.activated_at)
    const restantes = mesesRestantes(at, now)
    return {
      ...s,
      restantes,
      cumprida: restantes === 0,
      multa: multaCancelamento(Number(s.mensal), at, now),
    }
  })

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>Sapienza · Plataforma</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Onboarding & tenants</h1>
      </div>

      <NewTenantForm />
      <ActivateForm tenants={rows.map((r) => ({ id: r.id, name: r.name }))} />

      <div className="space-y-2 pt-2">
        <h2 className="text-sm font-medium text-muted-foreground">Assinaturas ativas · fidelidade {FIDELIDADE_MESES} meses</h2>
        <p className="text-xs text-muted-foreground">
          Cancelamento é manual (o cliente pede por contato). A multa sugerida é 50% das mensalidades
          restantes até completar a fidelidade — some quando cumprida. Combine e cobre à parte antes de cancelar.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Tenant</th>
              <th className="px-4 py-2 font-medium">Produto</th>
              <th className="px-4 py-2 font-medium">Plano</th>
              <th className="px-4 py-2 font-medium">Fidelidade</th>
              <th className="px-4 py-2 font-medium">Multa sugerida</th>
              <th className="px-4 py-2 font-medium">Cancelar</th>
            </tr>
          </thead>
          <tbody>
            {ativos.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>Nenhuma assinatura ativa.</td>
              </tr>
            ) : (
              ativos.map((s) => (
                <tr key={`${s.tenant_id}-${s.produto}`} className="border-t border-border">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.produto}</td>
                  <td className="px-4 py-2">{tierLabel(s.tier)}</td>
                  <td className="px-4 py-2 text-xs">
                    {s.cumprida ? (
                      <span className="text-muted-foreground">cumprida</span>
                    ) : (
                      <span>faltam {s.restantes} {s.restantes === 1 ? "mês" : "meses"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{s.cumprida ? "—" : brl(s.multa)}</td>
                  <td className="px-4 py-2">
                    <CancelForm tenantId={s.tenant_id} produto={s.produto} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="pt-2 text-sm font-medium text-muted-foreground">Todos os tenants</h2>

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
