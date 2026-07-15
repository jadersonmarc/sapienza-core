import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"

// Aplica os .sql de drizzle/ (control plane) em ordem, uma vez cada, rastreando
// em public._migrations. Simples e sem dependência do drizzle-kit em runtime.

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL não definida")
  const sqlc = postgres(url, { prepare: false, max: 1 })

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

  await sqlc.end()
  console.log("migrate — control plane pronto.")
}

main().catch((e) => {
  console.error("migrate falhou:", e)
  process.exit(1)
})
