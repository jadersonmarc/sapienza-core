import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"
import { validatePasswordStrength } from "@/lib/auth/password"
import { issueToken, consumeToken } from "@/lib/auth/tokens"

// Fluxos de conta: reset de senha e verificação de e-mail (soft). Os e-mails NÃO
// saem inline: emitem eventos no outbox → o consumer `mailer` envia. O link do
// e-mail leva o token CRU; o banco guarda só o hash (lib/auth/tokens.ts).

const CONSOLE_URL = (process.env.CONSOLE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const HOUR = 3_600_000

/** tenant_id p/ o outbox (obrigatório). Eventos de conta são resolvidos pelo
 *  e-mail do payload no mailer, então o tenant aqui é só cosmético. */
async function firstTenantId(userId: string): Promise<string> {
  const rows = (await db.execute(sql`
    SELECT tenant_id FROM public.memberships WHERE user_id = ${userId}::uuid ORDER BY created_at LIMIT 1
  `)) as unknown as { tenant_id: string }[]
  return rows[0]?.tenant_id ?? NIL_UUID
}

/** Pede reset de senha. Silencioso quanto à existência do e-mail (anti-enumeração). */
export async function requestPasswordReset(email: string): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT id FROM public.users WHERE lower(email) = ${email.trim().toLowerCase()}
  `)) as unknown as { id: string }[]
  const user = rows[0]
  if (!user) return // não vaza se o e-mail existe
  const raw = await issueToken(user.id, "password_reset", HOUR)
  const link = `${CONSOLE_URL}/redefinir-senha?token=${raw}`
  const tid = await firstTenantId(user.id)
  await db.transaction((tx) =>
    emitEvent(tx, { type: "PasswordResetRequested", tenantId: tid, payload: { email, link } }),
  )
}

/** Aplica a nova senha via token. Bump de session_version derruba sessões antigas. */
export async function resetPassword(rawToken: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const bad = validatePasswordStrength(newPassword)
  if (bad) return { ok: false, error: bad }
  const userId = await consumeToken(rawToken, "password_reset")
  if (!userId) return { ok: false, error: "Link inválido ou expirado. Peça um novo." }
  const hash = await bcrypt.hash(newPassword, 12)
  await db.execute(sql`
    UPDATE public.users
       SET password_hash = ${hash}, session_version = session_version + 1, updated_at = now()
     WHERE id = ${userId}::uuid
  `)
  return { ok: true }
}

/** Dispara o e-mail de verificação (soft; não bloqueia nada). TTL de 7 dias. */
export async function requestEmailVerification(userId: string, email: string): Promise<void> {
  const raw = await issueToken(userId, "email_verify", 7 * 24 * HOUR)
  const link = `${CONSOLE_URL}/verificar-email?token=${raw}`
  const tid = await firstTenantId(userId)
  await db.transaction((tx) =>
    emitEvent(tx, { type: "EmailVerificationRequested", tenantId: tid, payload: { email, link } }),
  )
}

/** Confirma o e-mail via token. Retorna true se confirmou. */
export async function verifyEmail(rawToken: string): Promise<boolean> {
  const userId = await consumeToken(rawToken, "email_verify")
  if (!userId) return false
  await db.execute(sql`
    UPDATE public.users SET email_verified_at = now(), updated_at = now() WHERE id = ${userId}::uuid
  `)
  return true
}
