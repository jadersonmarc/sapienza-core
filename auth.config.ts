import type { NextAuthConfig } from "next-auth"

// Config edge-safe (sem bcrypt/driver de DB) — usada pelo middleware.
// O provider Credentials (Node runtime) é adicionado em auth.ts.
// Diferença vs spa-sapienza: aqui NÃO há `role` no usuário (role é por
// membership, resolvido por tenant em runtime). A sessão carrega só isSuperadmin.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    // Todo o console exige login; /login é sempre liberado.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl
      if (pathname.startsWith("/login")) return true
      return isLoggedIn
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.isSuperadmin = (user as { isSuperadmin?: boolean }).isSuperadmin ?? false
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.isSuperadmin = (token.isSuperadmin as boolean) ?? false
      return session
    },
  },
  providers: [], // definidos em auth.ts
} satisfies NextAuthConfig
