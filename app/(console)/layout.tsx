import Link from "next/link"
import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { Eyebrow } from "@/components/eyebrow"
import { TenantSwitcher } from "@/components/console/tenant-switcher"
import { ConsoleNav, type NavEntry } from "@/components/console/console-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import { produtoLabel } from "@/lib/pricing/tier-label"
import { signOutAction } from "@/app/actions"

// Shell do console autenticado: sidebar lateral hierárquica (grupos por produto,
// só os assinados) + tenant switcher + tema/sair. Espelha o admin do spa-sapienza.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, tenants, active } = await currentContext()

  const subs = active ? await tenantSubscriptions(active.id) : []
  const subscribesMargot = subs.some((s) => s.produto === "margot" && s.status === "active")
  const subscribesMotor = subs.some((s) => s.produto === "motor" && s.status === "active")

  const entries: NavEntry[] = [
    { href: "/", label: "Início", exact: true },
    ...(subscribesMargot
      ? [
          {
            label: produtoLabel("margot"),
            items: [
              { href: "/margot", label: "Visão geral", exact: true },
              { href: "/margot/atendimento", label: "Atendimento" },
              { href: "/margot/crm", label: "Funil" },
              { href: "/margot/configuracao", label: "Agente" },
              { href: "/margot/automacoes", label: "Automações" },
            ],
          } as NavEntry,
        ]
      : []),
    ...(subscribesMotor
      ? [
          {
            label: produtoLabel("motor"),
            items: [
              { href: "/motor", label: "Visão geral", exact: true },
              { href: "/motor/conteudo", label: "Conteúdo" },
              { href: "/motor/calendario", label: "Calendário" },
              { href: "/motor/canais", label: "Canais" },
              { href: "/motor/relatorio", label: "Relatório" },
            ],
          } as NavEntry,
        ]
      : []),
    { href: "/faturas", label: "Faturas" },
    { href: "/usuarios", label: "Usuários" },
    ...(user.isSuperadmin ? [{ href: "/super", label: "Admin" } as NavEntry] : []),
  ]

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-border bg-card/40 p-4 lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between lg:flex-col lg:items-start lg:gap-4">
          <Link href="/" className="font-display text-base font-semibold text-foreground">
            Sapienza <span className="font-mono text-xs text-muted-foreground">/console</span>
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <form action={signOutAction}>
              <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Sair</button>
            </form>
          </div>
        </div>

        {active && <TenantSwitcher tenants={tenants} activeId={active.id} />}
        {active && <ConsoleNav entries={entries} />}

        <div className="mt-auto hidden flex-col gap-3 lg:flex">
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {user.email}
            {user.isSuperadmin ? <><br /><span className="uppercase tracking-wider">superadmin</span></> : null}
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOutAction} className="flex-1">
              <button className="w-full rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-5xl px-6 py-8">
          {!active ? (
            <div className="space-y-3">
              <Eyebrow>Sem acesso</Eyebrow>
              <p className="text-sm text-muted-foreground">
                Sua conta ainda não está vinculada a nenhuma empresa. Fale com o suporte Sapienza.
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
