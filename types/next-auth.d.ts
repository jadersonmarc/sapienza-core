import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: { id: string; isSuperadmin: boolean } & DefaultSession["user"]
  }
  interface User {
    isSuperadmin?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    isSuperadmin?: boolean
  }
}
