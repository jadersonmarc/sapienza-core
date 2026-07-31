// Envio de e-mail transacional atrás de uma interface fina — trocável e testável,
// espelha o PaymentProvider (lib/payments/asaas.ts). Provider real: Resend.
// Sem RESEND_API_KEY/MAIL_FROM, cai no NoopMailer (loga e não envia) — seam que
// não quebra build/boot; o e-mail só "opera" em prod com as envs setadas.

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text?: string
}

export interface Mailer {
  configured(): boolean
  send(msg: EmailMessage): Promise<void>
}

// ── Resend ───────────────────────────────────────────────────────────────────
class ResendMailer implements Mailer {
  private readonly apiKey: string | undefined
  private readonly from: string | undefined
  constructor() {
    this.apiKey = process.env.RESEND_API_KEY
    this.from = process.env.MAIL_FROM
  }
  configured(): boolean {
    return Boolean(this.apiKey && this.from)
  }
  async send(msg: EmailMessage): Promise<void> {
    // Import dinâmico: só carrega o SDK quando há envio real de fato.
    const { Resend } = await import("resend")
    const client = new Resend(this.apiKey!)
    const { error } = await client.emails.send({
      from: this.from!,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
    })
    if (error) throw new Error(`resend: ${error.name}: ${error.message}`)
  }
}

// ── Noop (sem envs) ──────────────────────────────────────────────────────────
class NoopMailer implements Mailer {
  configured(): boolean {
    return false
  }
  async send(msg: EmailMessage): Promise<void> {
    console.warn(`[mailer] sem RESEND_API_KEY/MAIL_FROM — e-mail NÃO enviado: "${msg.subject}" → ${msg.to}`)
  }
}

// ── Fake (testes) ────────────────────────────────────────────────────────────
export class FakeMailer implements Mailer {
  sent: EmailMessage[] = []
  configured(): boolean {
    return true
  }
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg)
  }
}

let override: Mailer | null = null
let cached: Mailer | null = null

/** Mailer ativo. Resend se configurado; senão Noop. Override tem prioridade (testes). */
export function mailer(): Mailer {
  if (override) return override
  if (!cached) {
    const resend = new ResendMailer()
    cached = resend.configured() ? resend : new NoopMailer()
  }
  return cached
}

/** Injeta um mailer (ex.: FakeMailer nos testes). `null` restaura o padrão. */
export function setMailer(m: Mailer | null): void {
  override = m
  cached = null
}
