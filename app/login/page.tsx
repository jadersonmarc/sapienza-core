import { redirect } from "next/navigation"
import { auth, signIn } from "@/auth"
import { Eyebrow } from "@/components/eyebrow"
import { Button } from "@/components/ui/button"

// Login do console. Server Action chama signIn (Credentials).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect("/")
  const { error } = await searchParams

  async function login(formData: FormData) {
    "use server"
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      })
    } catch (e) {
      // NextAuth relança um redirect em caso de sucesso; só tratamos falha real.
      if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e
      redirect("/login?error=1")
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6">
      <div className="space-y-3">
        <Eyebrow>Sapienza · Console</Eyebrow>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">
          Acesse as ferramentas que sua empresa assina — num só lugar.
        </p>
      </div>

      <form action={login} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">E-mail</label>
          <input
            id="email" name="email" type="email" required autoComplete="email"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">Senha</label>
          <input
            id="password" name="password" type="password" required autoComplete="current-password"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">E-mail ou senha inválidos.</p>
        )}
        <Button type="submit" className="w-full">Entrar</Button>
      </form>
    </main>
  )
}
