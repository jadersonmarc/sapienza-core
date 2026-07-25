// Templates de e-mail transacional. HTML inline (clientes de e-mail ignoram CSS
// externo). Tom sóbrio, um acento petrol. pt-BR.

export function paymentConfirmedEmail(opts: {
  name: string
  loginUrl: string
  produto?: string
  tier?: string
}): { subject: string; html: string } {
  const nome = opts.name?.trim() || "Olá"
  const plano = [opts.produto, opts.tier].filter(Boolean).join(" ").trim()
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a2230">
    <p style="font:600 12px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#1f6f78;margin:0 0 8px">Sapienza</p>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 12px">Pagamento confirmado 🎉</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${nome}, recebemos seu pagamento${plano ? ` do <strong>${plano}</strong>` : ""} e sua conta já está <strong>ativa</strong>.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Acesse seu painel para começar:</p>
    <p style="margin:0 0 24px">
      <a href="${opts.loginUrl}" style="display:inline-block;background:#1f6f78;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Acessar o painel</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#5b6472;margin:0 0 4px">Ou use este link: <a href="${opts.loginUrl}" style="color:#1f6f78">${opts.loginUrl}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#5b6472;margin:24px 0 0">Qualquer dúvida, é só responder este e-mail.</p>
  </div>`
  return { subject: "Pagamento confirmado — acesse seu painel Sapienza", html }
}
