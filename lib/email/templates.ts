import type { EmailMessage } from "./mailer"

// Templates dos e-mails transacionais. Puros: recebem o payload do evento + o
// destinatário e devolvem a EmailMessage (ou null se o evento não gera e-mail).
// pt-BR, HTML simples e sóbrio (sem depender de imagens externas).

const CONSOLE_URL = (process.env.CONSOLE_URL ?? process.env.NEXTAUTH_URL ?? "https://console.sapienzalabs.com.br").replace(/\/$/, "")
const BRAND = "Sapienza Labs"

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:700;font-size:18px;letter-spacing:-0.02em;margin-bottom:24px">${BRAND}</div>
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 16px;font-size:19px;line-height:1.3">${esc(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#71717a;font-size:12px;margin-top:24px">Este é um e-mail automático da plataforma ${BRAND}.</p>
  </div></body></html>`
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#18181b;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;display:inline-block;font-weight:600">${esc(label)}</a></p>`
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${esc(text)}</p>`
}

type Payload = Record<string, unknown>
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v))

/** Monta o e-mail de um evento do outbox. `to` já resolvido pelo consumer.
 *  Retorna null quando o tipo não gera e-mail (o consumer só chama para os que geram). */
export function buildEmail(type: string, payload: Payload, to: string): EmailMessage | null {
  switch (type) {
    case "WelcomeOwner": {
      const slug = str(payload.slug)
      const setup = payload.needs_password_setup === true
      const loginUrl = str(payload.login_url) || `${CONSOLE_URL}/login`
      const body =
        p(`Sua conta na ${BRAND} foi criada${slug ? ` (${slug})` : ""}.`) +
        (setup
          ? p("Para começar, defina sua senha:") + button(loginUrl, "Definir senha")
          : p("Você já pode acessar o console com o e-mail e a senha que escolheu.") + button(loginUrl, "Acessar o console"))
      return { to, subject: `Bem-vindo à ${BRAND}`, html: layout("Conta criada", body) }
    }
    case "PaymentReceived": {
      const period = str(payload.period)
      const total = str(payload.total_brl)
      const body =
        p("Recebemos seu pagamento. Obrigado!") +
        (period ? p(`Período: ${period}`) : "") +
        (total ? p(`Valor: R$ ${total}`) : "") +
        button(`${CONSOLE_URL}/faturas`, "Ver faturas")
      return { to, subject: "Pagamento confirmado", html: layout("Pagamento confirmado", body) }
    }
    case "InvoiceOverdue": {
      const url = str(payload.payment_url)
      const body =
        p("Não conseguimos confirmar o pagamento da sua fatura. Seu acesso continua ativo por enquanto.") +
        (url ? button(url, "Pagar agora") : p("Acesse o console para regularizar."))
      return { to, subject: "Pagamento pendente", html: layout("Pagamento pendente", body) }
    }
    case "BlockImminent": {
      const url = str(payload.payment_url)
      const body =
        p("Sua fatura segue em aberto. O acesso será bloqueado em breve se o pagamento não for confirmado.") +
        (url ? button(url, "Pagar agora") : button(`${CONSOLE_URL}/faturas`, "Ver faturas"))
      return { to, subject: "Seu acesso será bloqueado em breve", html: layout("Aviso de bloqueio", body) }
    }
    case "SubscriptionBlocked": {
      const url = str(payload.payment_url)
      const body =
        p("Seu acesso foi bloqueado por falta de pagamento. Assim que a fatura for paga, o acesso é reativado automaticamente.") +
        (url ? button(url, "Pagar e reativar") : button(`${CONSOLE_URL}/faturas`, "Ver faturas"))
      return { to, subject: "Acesso bloqueado", html: layout("Acesso bloqueado", body) }
    }
    case "SubscriptionCanceled": {
      const body =
        p("Sua assinatura foi cancelada por inadimplência. Para voltar a usar a plataforma, entre em contato conosco.")
      return { to, subject: "Assinatura cancelada", html: layout("Assinatura cancelada", body) }
    }
    case "PasswordResetRequested": {
      const link = str(payload.link)
      const body =
        p("Recebemos um pedido para redefinir sua senha. Se não foi você, ignore este e-mail.") +
        button(link, "Redefinir senha") +
        p("O link expira em 1 hora.")
      return { to, subject: "Redefinir sua senha", html: layout("Redefinir senha", body) }
    }
    case "EmailVerificationRequested": {
      const link = str(payload.link)
      const body =
        p("Confirme seu e-mail para garantir o recebimento de avisos importantes (faturas, cobrança).") +
        button(link, "Confirmar e-mail")
      return { to, subject: "Confirme seu e-mail", html: layout("Confirmar e-mail", body) }
    }
    case "ContentPublishFailed": {
      const title = str(payload.title)
      const failures = Array.isArray(payload.failures) ? (payload.failures as { platform?: unknown }[]) : []
      const canais = failures.map((f) => str(f.platform)).filter(Boolean)
      const lista = canais.length ? canais.join(", ") : "um ou mais canais"
      const body =
        p(`A publicação da peça${title ? ` "${title}"` : ""} falhou em: ${lista}.`) +
        p("Os demais canais foram publicados normalmente. Você pode reprocessar só os que falharam no console.") +
        button(`${CONSOLE_URL}/motor/conteudo`, "Abrir conteúdo")
      return { to, subject: "Falha ao publicar em um canal", html: layout("Falha na publicação", body) }
    }
    default:
      return null
  }
}

/** Tipos de evento que geram e-mail (o consumer ignora os demais). */
export const EMAIL_EVENT_TYPES = new Set<string>([
  "WelcomeOwner",
  "PaymentReceived",
  "InvoiceOverdue",
  "BlockImminent",
  "SubscriptionBlocked",
  "SubscriptionCanceled",
  "PasswordResetRequested",
  "EmailVerificationRequested",
  "ContentPublishFailed",
])
