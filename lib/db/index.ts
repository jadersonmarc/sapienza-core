import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// Inicialização preguiçosa: a conexão só é aberta no primeiro uso, não no import.
// Assim `next build` (que importa as páginas) não exige DATABASE_URL no build.

let _db: PostgresJsDatabase<typeof schema> | null = null

function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL não definida — configure o Postgres (ver README.md).")
  }
  // prepare:false p/ compatibilidade com poolers de transação (pgbouncer/supavisor).
  const client = postgres(connectionString, { prepare: false })
  _db = drizzle(client, { schema })
  return _db
}

// Proxy: delega toda propriedade/método ao db real, aberto sob demanda.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>
    const value = real[prop]
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})

export { schema }
