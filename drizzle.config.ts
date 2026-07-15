import type { Config } from "drizzle-kit"

// drizzle-kit lê DATABASE_URL do ambiente (.env é carregado automaticamente).
// `generate` funciona offline; `migrate`/`push`/`studio` precisam do DATABASE_URL.
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config
