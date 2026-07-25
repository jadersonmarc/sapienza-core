import Link from "next/link"
import { PixPanel } from "./pix-panel"

export const metadata = { title: "Pagamento — Sapienza", robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function PagamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>
}) {
  const { invoice } = await searchParams

  if (!invoice) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Pagamento não encontrado</h1>
        <Link href="/" className="mt-6 inline-block text-primary hover:underline">
          Voltar ao site →
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Link href="/" className="font-display text-base font-semibold">
        Sapienza <span className="font-mono text-xs text-muted-foreground">/console</span>
      </Link>
      <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">Pague com PIX</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Escaneie o QR Code ou copie o código no app do seu banco. O acesso é liberado automaticamente
        assim que o pagamento cai.
      </p>
      <div className="mt-6">
        <PixPanel invoiceId={invoice} />
      </div>
    </main>
  )
}
