import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: { id: string; isSuperadmin: boolean; sessionVersion: number } & DefaultSession["user"]
  }
  interface User {
    isSuperadmin?: boolean
    sessionVersion?: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    isSuperadmin?: boolean
    sessionVersion?: number
  }
}
