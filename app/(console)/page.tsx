import Link from "next/link"
import { currentContext, subscribedProducts } from "@/lib/console/current"
import { produtoLabel } from "@/lib/pricing/tier-label"
import { Eyebrow } from "@/components/eyebrow"
import { UsageCard } from "@/components/console/usage-card"

// Home do console: só os produtos que o tenant ATIVO assina, com uso vs incluso.
export default async function ConsoleHome() {
  const { active } = await currentContext()
  if (!active) return null
  const products = await subscribedProducts(active.id)

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Eyebrow>{active.name}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Suas ferramentas</h1>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum produto assinado ainda. Fale com a Sapienza para ativar {produtoLabel("margot")} ou {produtoLabel("motor")}.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <UsageCard
              key={p.produto}
              p={p}
              action={
                <Link
                  href="/minha-conta"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Gerenciar plano →
                </Link>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
