import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Instância edge-safe (sem providers/bcrypt) só para o middleware.
export default NextAuth(authConfig).auth

export const config = {
  // Protege tudo menos assets estáticos, rotas de auth e a própria /login.
  // `api/cron` fica de fora porque não tem sessão: é chamado por agendador com
  // `x-webhook-secret` e se protege sozinho via cronAuthorized() (fail-closed).
  // `health` fica de fora para responder 200 ao health check do Coolify em vez de
  // redirecionar para /login. Dentro do matcher, o callback authorized() faria 307.
  // `api/webhooks` (pagamento) também: sem sessão, se protege pelo token do provedor.
  // `api/public` (checkout do site): server-to-server, protegido pelo CHECKOUT_SECRET.
  matcher: ["/((?!api/auth|api/cron|api/webhooks|api/public|health|_next/static|_next/image|favicon.ico|login|logo-sapienza.png).*)"],
}
