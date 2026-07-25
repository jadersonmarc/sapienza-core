import Link from "next/link"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { produtoLabel, tierLabel } from "@/lib/pricing/tier-label"
import { CadastroForm } from "./cadastro-form"

export const metadata = { title: "Assinar — Sapienza", robots: { index: false } }
export const dynamic = "force-dynamic"

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function AssinarPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string; tier?: string }>
}) {
  const sp = await searchParams
  const produto = String(sp.produto ?? "")
  const tier = String(sp.tier ?? "")

  const rows = (await db.execute(
    sql`SELECT mensal FROM public.plans WHERE produto = ${produto} AND tier = ${tier}`,
  )) as unknown as { mensal: string }[]
  const plan = rows[0]

  if (!plan) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Escolha um plano</h1>
        <p className="mt-2 text-sm text-muted-foreground">Selecione um produto e plano no site para continuar.</p>
        <Link href="/" className="mt-6 inline-block text-primary hover:underline">
          Voltar ao site →
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-10 px-4 py-16 md:grid-cols-[1fr_1.1fr]">
      <div>
        <Link href="/" className="font-display text-base font-semibold">
          Sapienza <span className="font-mono text-xs text-muted-foreground">/console</span>
        </Link>
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {produtoLabel(produto)} <span className="text-muted-foreground">{tierLabel(tier)}</span>
        </h1>
        <div className="mt-4 rounded-xl border border-border p-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{brl(Number(plan.mensal))}</span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Crie sua conta, pague por PIX e o acesso é liberado assim que o pagamento é confirmado.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border p-6">
        <h2 className="text-lg font-semibold">Crie sua conta</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">É o seu acesso ao painel Sapienza.</p>
        <CadastroForm produto={produto} tier={tier} />
      </div>
    </main>
  )
}
