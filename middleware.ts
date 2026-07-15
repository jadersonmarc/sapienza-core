import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Instância edge-safe (sem providers/bcrypt) só para o middleware.
export default NextAuth(authConfig).auth

export const config = {
  // Protege tudo menos assets estáticos, rotas de auth e a própria /login.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login|logo-sapienza.png).*)"],
}
