import Link from "next/link"
import { eq } from "drizzle-orm"
import { currentContext, subscribedProducts } from "@/lib/console/current"
import { db, schema } from "@/lib/db"
import { getBillingIdentity } from "@/lib/tenant/billing"
import { tierRank } from "@/lib/billing/seats"
import { Eyebrow } from "@/components/eyebrow"
import { UsageCard } from "@/components/console/usage-card"
import { BillingForm } from "../faturas/billing-form"
import { OwnerForm } from "./owner-form"

export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string }>
}) {
  const { user, active } = await currentContext()
  if (!active) return null
  const { upgrade } = await searchParams

  const [products, identity, ownerRow] = await Promise.all([
    subscribedProducts(active.id),
    getBillingIdentity(active.id),
    db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1),
  ])
  const ownerName = ownerRow[0]?.name ?? ""

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Eyebrow>{active.name}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Minha conta</h1>
      </div>

      {upgrade && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
          Upgrade concluído — seu novo plano já está ativo e o novo limite vale a partir deste mês.
        </div>
      )}

      {/* Plano & uso */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Plano e uso</h2>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto assinado ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((p) => {
              const podeUpgrade = tierRank(p.tier) > 0 && tierRank(p.tier) < 3 && p.status === "active"
              return (
                <UsageCard
                  key={p.produto}
                  p={p}
                  action={
                    podeUpgrade ? (
                      <Link
                        href={`/minha-conta/upgrade?produto=${p.produto}`}
                        className="inline-flex rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      >
                        Fazer upgrade
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">Plano máximo</span>
                    )
                  }
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Titular + cobrança */}
      <section className="grid gap-4 lg:grid-cols-2">
        <OwnerForm name={ownerName} email={user.email} />
        <BillingForm identity={identity} taxIdReadOnly />
      </section>
    </div>
  )
}
