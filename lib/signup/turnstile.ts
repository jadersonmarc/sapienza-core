// Verificação do Cloudflare Turnstile (captcha) no checkout público. Seam: sem
// TURNSTILE_SECRET_KEY o captcha fica desligado (retorna true) — não bloqueia dev
// nem ambientes sem as chaves. Em prod, com a chave setada, um token inválido barra.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // captcha desligado (seam)
  if (!token) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set("remoteip", ip)
    const res = await fetch(VERIFY_URL, { method: "POST", body })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (e) {
    console.error("[turnstile] falha ao verificar:", e)
    return false
  }
}

/** Site key pública (client). Vazia = widget não renderiza (captcha desligado). */
export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
}
