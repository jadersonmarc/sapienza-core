import Link from "next/link"
import { comboFor, comboPreco, loadPricing, precoDe, type ProdutoId } from "@/lib/pricing/load"
import { produtoLabel, tierLabel } from "@/lib/pricing/tier-label"
import { CadastroForm } from "./cadastro-form"

export const metadata = { title: "Assinar — Sapienza", robots: { index: false } }
export const dynamic = "force-dynamic"

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// Preço por MODELO (pricing.yaml). Combo lê comboPreco; avulso lê precoDe — nunca
// do `plans` (que agora tem 1 linha por modelo e ambiguaria o SELECT).
function resolveSummary(
  produto: string,
  tier: string,
): { anual: number; mensal: number; inclusos: string } | null {
  if (produto === "combo") {
    if (!comboFor(tier)) return null
    const p = loadPricing()
    const respostas = p.produtos.margot.tiers.find((t) => t.id === tier)?.incluso
    const pecas = p.produtos.motor.tiers.find((t) => t.id === tier)?.incluso
    if (respostas == null || pecas == null) return null
    return {
      anual: comboPreco(tier, "anual"),
      mensal: comboPreco(tier, "mensal"),
      inclusos: `${respostas.toLocaleString("pt-BR")} respostas + ${pecas} peças por mês`,
    }
  }
  if (produto !== "margot" && produto !== "motor") return null
  const p = loadPricing()
  if (!p.produtos[produto as ProdutoId].tiers.find((t) => t.id === tier)) return null
  return {
    anual: precoDe(produto as ProdutoId, tier, "anual"),
    mensal: precoDe(produto as ProdutoId, tier, "mensal"),
    inclusos: "",
  }
}

export default async function AssinarPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string; tier?: string }>
}) {
  const sp = await searchParams
  const produto = String(sp.produto ?? "")
  const tier = String(sp.tier ?? "")

  const summary = resolveSummary(produto, tier)

  if (!summary) {
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
            <span className="text-3xl font-semibold">{brl(summary.anual)}</span>
            <span className="text-sm text-muted-foreground">/mês no anual</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">ou {brl(summary.mensal)}/mês no mensal</p>
          {summary.inclusos && (
            <p className="mt-3 text-sm text-foreground">{summary.inclusos}</p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            Escolha o modelo ao lado. Cobrança mensal recorrente no cartão; o acesso é liberado
            assim que o pagamento é confirmado.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border p-6">
        <h2 className="text-lg font-semibold">Crie sua conta</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">É o seu acesso ao painel Sapienza.</p>
        <CadastroForm produto={produto} tier={tier} precoAnual={summary.anual} precoMensal={summary.mensal} />
      </div>
    </main>
  )
}
