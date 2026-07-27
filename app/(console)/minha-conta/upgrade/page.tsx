import Link from "next/link"
import { notFound } from "next/navigation"
import { currentContext, subscribedProducts } from "@/lib/console/current"
import { loadPricing, type ProdutoId } from "@/lib/pricing/load"
import { tierRank } from "@/lib/billing/seats"
import { tierLabel, metricPlural } from "@/lib/pricing/tier-label"
import { Eyebrow } from "@/components/eyebrow"
import { UpgradeForm } from "./upgrade-form"

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string }>
}) {
  const { active } = await currentContext()
  if (!active) return null
  const { produto } = await searchParams
  if (produto !== "margot" && produto !== "motor") notFound()

  const products = await subscribedProducts(active.id)
  const cur = products.find((p) => p.produto === produto)
  if (!cur || cur.status !== "active") notFound()

  const def = loadPricing().produtos[produto as ProdutoId]
  const metric = metricPlural(def.metric)
  // Só tiers acima do atual.
  const options = def.tiers
    .filter((t) => tierRank(t.id) > tierRank(cur.tier))
    .map((t) => ({ id: t.id, label: tierLabel(t.id), mensal: t.mensal, incluso: t.incluso }))

  if (options.length === 0) notFound()

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <Eyebrow>{cur.nome}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Fazer upgrade</h1>
        <p className="text-sm text-muted-foreground">
          Plano atual: <span className="text-foreground">{tierLabel(cur.tier)}</span> · {cur.incluso} {metric}/mês.
          Ao subir de plano você refaz o pagamento agora, como uma nova assinatura: a 1ª cobrança do novo
          valor é feita na hora, a assinatura anterior é cancelada e o novo limite passa a valer neste mês.
        </p>
      </div>

      <UpgradeForm produto={produto} metric={metric} options={options} />

      <Link href="/minha-conta" className="inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← Voltar para Minha conta
      </Link>
    </div>
  )
}
