// Envio de e-mail transacional via Resend (API REST, sem SDK). Seam: sem
// RESEND_API_KEY, apenas loga e não envia — não quebra o fluxo que dispara
// (ex.: webhook de pagamento). From configurável por env.

export type EmailInput = { to: string; subject: string; html: string }

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail(input: EmailInput): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || "Sapienza <no-reply@sapienzalabs.com.br>"
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY ausente — não enviei "${input.subject}" para ${input.to}`)
    return { sent: false, error: "email não configurado" }
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[email] Resend ${res.status}: ${body}`)
      return { sent: false, error: `resend ${res.status}` }
    }
    return { sent: true }
  } catch (e) {
    console.error("[email] exceção ao enviar:", e)
    return { sent: false, error: e instanceof Error ? e.message : String(e) }
  }
}
