import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { verifyEmail } from "@/lib/auth/account"

export const runtime = "nodejs"

// Confirma o e-mail via token do link. Consome o token no carregamento (single-use).
// Verificação é soft — não bloqueia nada; isto só marca email_verified_at.
export default async function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const ok = token ? await verifyEmail(token) : false

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <Eyebrow>Verificação de e-mail</Eyebrow>
      {ok ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">E-mail confirmado ✓</h1>
          <p className="text-sm text-muted-foreground">Obrigado! Seu e-mail está confirmado.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link de verificação é inválido ou já foi usado. Se precisar, peça um novo pelo console.
          </p>
        </>
      )}
      <Link href="/login" className="text-sm text-muted-foreground hover:underline">
        Ir para o login
      </Link>
    </main>
  )
}
