import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// Rate-limit do checkout público (anti-abuso/fraude de cartão). Conta tentativas
// por IP e por e-mail numa janela; sem Redis (CLAUDE.md), a contagem vive em
// public.checkout_attempts. Defaults conservadores (aquisição é por indicação =
// baixo volume) — ajustáveis por env se necessário.

const WINDOW_MS = 60 * 60 * 1000 // 1 hora
const MAX_PER_IP = Number(process.env.CHECKOUT_MAX_PER_IP ?? 5)
const MAX_PER_EMAIL = Number(process.env.CHECKOUT_MAX_PER_EMAIL ?? 3)

export class RateLimitError extends Error {
  constructor(msg = "Muitas tentativas. Aguarde alguns minutos e tente de novo.") {
    super(msg)
    this.name = "RateLimitError"
  }
}

/** Bloqueia se estourou o limite na janela; senão registra a tentativa atual.
 *  Lança RateLimitError quando excedido (a tentativa NÃO é registrada nesse caso). */
export async function assertCheckoutAllowed(ip: string, email: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const [row] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE ip = ${ip}) AS ip_count,
      count(*) FILTER (WHERE lower(email) = ${email.toLowerCase()}) AS email_count
    FROM public.checkout_attempts
    WHERE created_at > ${since}::timestamptz
  `)) as unknown as { ip_count: number; email_count: number }[]

  if (Number(row.ip_count) >= MAX_PER_IP || Number(row.email_count) >= MAX_PER_EMAIL) {
    throw new RateLimitError()
  }
  await db.execute(sql`
    INSERT INTO public.checkout_attempts (ip, email) VALUES (${ip}, ${email.toLowerCase()})
  `)
}
