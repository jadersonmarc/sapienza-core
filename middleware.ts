import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Instância edge-safe (sem providers/bcrypt) só para o middleware.
export default NextAuth(authConfig).auth

export const config = {
  // Protege tudo menos assets estáticos, rotas de auth e a própria /login.
  // `api/cron` fica de fora porque não tem sessão: é chamado por agendador com
  // `x-webhook-secret` e se protege sozinho via cronAuthorized() (fail-closed).
  // Dentro do matcher, o callback authorized() o redirecionaria p/ /login (302).
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|login|logo-sapienza.png).*)"],
}
