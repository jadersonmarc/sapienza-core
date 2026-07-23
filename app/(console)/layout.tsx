import Link from "next/link"
import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { Eyebrow } from "@/components/eyebrow"
import { TenantSwitcher } from "@/components/console/tenant-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { produtoLabel } from "@/lib/pricing/tier-label"
import { signOutAction } from "@/app/actions"

// Shell do console autenticado: header com tenant switcher, nav e sair.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, tenants, active } = await currentContext()

  // Só mostra os links de produto se o tenant ativo assina o produto.
  const subs = active ? await tenantSubscriptions(active.id) : []
  const subscribesMargot = subs.some((s) => s.produto === "margot" && s.status === "active")
  const subscribesMotor = subs.some((s) => s.produto === "motor" && s.status === "active")

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-lg font-semibold tracking-tight">
              Sapienza
            </Link>
            <TenantSwitcher tenants={tenants} activeId={active?.id ?? null} />
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground">Produtos</Link>
            {subscribesMargot && (
              <Link href="/margot" className="text-muted-foreground hover:text-foreground">{produtoLabel("margot")}</Link>
            )}
            {subscribesMotor && (
              <Link href="/motor" className="text-muted-foreground hover:text-foreground">{produtoLabel("motor")}</Link>
            )}
            <Link href="/faturas" className="text-muted-foreground hover:text-foreground">Faturas</Link>
            <Link href="/usuarios" className="text-muted-foreground hover:text-foreground">Usuários</Link>
            {user.isSuperadmin && (
              <Link href="/super" className="text-primary hover:underline">Admin</Link>
            )}
            <ThemeToggle />
            <form action={signOutAction}>
              <button className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
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
  )
}
