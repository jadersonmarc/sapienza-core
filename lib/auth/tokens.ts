import { createHash, randomBytes } from "node:crypto"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// Tokens de uso único para reset de senha e verificação de e-mail. O token cru vai
// no link do e-mail; no banco guardamos só o HASH (sha256) — vazamento da tabela
// não expõe links utilizáveis. Single-use (used_at) + expiração.

export type TokenKind = "password_reset" | "email_verify"

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex")

/** Emite um token e devolve o valor CRU (só existe aqui e no link do e-mail). */
export async function issueToken(userId: string, kind: TokenKind, ttlMs: number): Promise<string> {
  const raw = randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + ttlMs).toISOString()
  await db.execute(sql`
    INSERT INTO public.auth_tokens (token_hash, user_id, kind, expires_at)
    VALUES (${hash(raw)}, ${userId}::uuid, ${kind}, ${expires}::timestamptz)
  `)
  return raw
}

/** Consome um token (marca usado). Devolve o user_id se válido; null caso
 *  contrário (inexistente/expirado/já usado/kind errado). */
export async function consumeToken(raw: string, kind: TokenKind): Promise<string | null> {
  if (!raw) return null
  const rows = (await db.execute(sql`
    UPDATE public.auth_tokens SET used_at = now()
     WHERE token_hash = ${hash(raw)} AND kind = ${kind}
       AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `)) as unknown as { user_id: string }[]
  return rows[0]?.user_id ?? null
}
