import Link from "next/link"
import { redirect } from "next/navigation"
import { Eyebrow } from "@/components/eyebrow"
import { Button } from "@/components/ui/button"
import { resetPassword } from "@/lib/auth/account"

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"

// Aplica a nova senha via token do e-mail. Público. Sucesso → /login; erro volta
// aqui com ?erro=. O token viaja na query (veio do link).
export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; erro?: string }>
}) {
  const { token, erro } = await searchParams
  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
        <Eyebrow>Redefinir senha</Eyebrow>
        <p className="text-sm text-destructive">Link inválido. Peça um novo em “Esqueci a senha”.</p>
        <Link href="/recuperar-senha" className="text-sm text-muted-foreground hover:underline">
          Pedir novo link
        </Link>
      </main>
    )
  }

  async function aplicar(formData: FormData) {
    "use server"
    const tk = String(formData.get("token") ?? "")
    const password = String(formData.get("password") ?? "")
    if (password !== String(formData.get("confirm") ?? "")) {
      redirect(`/redefinir-senha?token=${tk}&erro=${encodeURIComponent("As senhas não coincidem.")}`)
    }
    const r = await resetPassword(tk, password)
    if (!r.ok) redirect(`/redefinir-senha?token=${tk}&erro=${encodeURIComponent(r.error ?? "Falhou.")}`)
    redirect("/login?senha=1")
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <Eyebrow>Redefinir senha</Eyebrow>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Nova senha</h1>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      <form action={aplicar} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Nova senha (10+ com maiúscula, minúscula e número)</span>
          <input name="password" type="password" required autoComplete="new-password" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Confirmar senha</span>
          <input name="confirm" type="password" required autoComplete="new-password" className={field} />
        </label>
        <Button type="submit">Salvar nova senha</Button>
      </form>
    </main>
  )
}
