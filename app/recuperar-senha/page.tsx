import Link from "next/link"
import { redirect } from "next/navigation"
import { Eyebrow } from "@/components/eyebrow"
import { Button } from "@/components/ui/button"
import { requestPasswordReset } from "@/lib/auth/account"

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"

// Pede o link de reset de senha. Público (o usuário não está logado). Resposta
// sempre genérica — não revela se o e-mail existe (anti-enumeração).
export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>
}) {
  const { enviado } = await searchParams

  async function pedir(formData: FormData) {
    "use server"
    const email = String(formData.get("email") ?? "").trim()
    if (email) await requestPasswordReset(email)
    redirect("/recuperar-senha?enviado=1")
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <Eyebrow>Recuperar acesso</Eyebrow>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Redefinir senha</h1>
      {enviado ? (
        <p className="text-sm text-muted-foreground">
          Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. O link
          expira em 1 hora. Confira também a caixa de spam.
        </p>
      ) : (
        <form action={pedir} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">E-mail da conta</span>
            <input name="email" type="email" required autoComplete="email" className={field} />
          </label>
          <Button type="submit">Enviar link</Button>
        </form>
      )}
      <Link href="/login" className="text-sm text-muted-foreground hover:underline">
        ← Voltar ao login
      </Link>
    </main>
  )
}
