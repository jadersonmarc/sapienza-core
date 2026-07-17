import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"

// Aplica os .sql de drizzle/ (control plane) em ordem, uma vez cada, rastreando
// em public._migrations. Simples e sem dependência do drizzle-kit em runtime.

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL não definida")
  const sqlc = postgres(url, { prepare: false, max: 1 })

  // Roda no boot de cada container, e num deploy pode haver dois de pé ao mesmo
  // tempo. Sem lock, os dois leem `_migrations` vazia e tentam aplicar a mesma
  // migration: um commita, o outro morre com "already exists" e o container entra
  // em restart loop. O lock serializa; quem chega depois vê a migration aplicada e
  // pula. Liberado no fim da sessão (fecha junto com a conexão).
  await sqlc`SELECT pg_advisory_lock(hashtext('sapienza:migrate:control-plane'))`

  await sqlc`CREATE TABLE IF NOT EXISTS public._migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`

  const dir = join(process.cwd(), "drizzle")
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()

  for (const name of files) {
    const [{ exists }] = await sqlc`
      SELECT EXISTS(SELECT 1 FROM public._migrations WHERE name = ${name}) AS exists`
    if (exists) {
      console.log(`skip  ${name}`)
      continue
    }
    const body = readFileSync(join(dir, name), "utf8")
    await sqlc.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`INSERT INTO public._migrations (name) VALUES (${name})`
    })
    console.log(`apply ${name}`)
  }

  await sqlc`SELECT pg_advisory_unlock(hashtext('sapienza:migrate:control-plane'))`
  await sqlc.end()
  console.log("migrate — control plane pronto.")
}

main().catch((e) => {
  console.error("migrate falhou:", e)
  process.exit(1)
})
