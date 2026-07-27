import Link from "next/link"
import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { Eyebrow } from "@/components/eyebrow"
import { TenantSwitcher } from "@/components/console/tenant-switcher"
import { ConsoleNav, type NavEntry } from "@/components/console/console-nav"
import { ConsoleSidebar } from "@/components/console/console-sidebar"
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
              { href: "/motor/agente", label: "Agente" },
              { href: "/motor/conteudo", label: "Conteúdo" },
              { href: "/motor/midia", label: "Mídia" },
              { href: "/motor/calendario", label: "Calendário" },
              { href: "/motor/canais", label: "Canais" },
              { href: "/motor/relatorio", label: "Relatório" },
            ],
          } as NavEntry,
        ]
      : []),
    { href: "/minha-conta", label: "Minha conta" },
    { href: "/faturas", label: "Faturas" },
    { href: "/usuarios", label: "Usuários" },
    ...(user.isSuperadmin ? [{ href: "/super", label: "Admin" } as NavEntry] : []),
  ]

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <ConsoleSidebar
        brand={
          <Link href="/" className="font-display text-base font-semibold text-foreground">
            Sapienza <span className="font-mono text-xs text-muted-foreground">/console</span>
          </Link>
        }
      >
        {active && <TenantSwitcher tenants={tenants} activeId={active.id} />}
        {active && <ConsoleNav entries={entries} />}

        <div className="mt-auto flex flex-col gap-3">
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
      </ConsoleSidebar>

      <div className="min-w-0 flex-1">
        <main className="px-4 py-6 sm:px-6 sm:py-8">
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
