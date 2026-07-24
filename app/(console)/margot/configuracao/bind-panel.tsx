"use client"

import { useActionState } from "react"
import { bindChannelAction, generateWebhookSecretAction, type ChannelActionState } from "../actions"

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
const initial: ChannelActionState = {}

// Onboarding MANUAL (superadmin): vincular uma instância do Evolution criada à mão
// no painel — espelha o setup do spa-sapienza, que funciona. Depois, gerar o
// segredo e configurar o webhook da instância apontando para o Margot.
export function BindPanel() {
  const [bindState, bindAction, binding] = useActionState(bindChannelAction, initial)
  const [secretState, secretAction, generating] = useActionState(generateWebhookSecretAction, initial)

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-border p-4">
      <div>
        <h2 className="text-sm font-semibold">Vincular instância existente (superadmin)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Para usar uma instância criada manualmente no Evolution (mais confiável — igual ao setup do site).
          Vincule aqui, gere o segredo, e configure o webhook da instância no painel do Evolution.
        </p>
      </div>

      <form action={bindAction} className="space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Nome da instância no Evolution</span>
          <input name="evolution_instance" required className={field} placeholder="ex.: margot-cliente" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Número do WhatsApp (opcional)</span>
          <input name="whatsapp_number" className={field} placeholder="5521999999999" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dedicated_number_confirmed" defaultChecked />
          <span>Número dedicado confirmado</span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={binding}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {binding ? "Vinculando…" : "Vincular"}
          </button>
          {bindState.error && <span className="text-sm text-destructive">{bindState.error}</span>}
          {bindState.ok && <span className="text-sm text-muted-foreground">Instância vinculada.</span>}
        </div>
      </form>

      <form action={secretAction} className="space-y-2 border-t border-border pt-4">
        <button
          type="submit"
          disabled={generating}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {generating ? "Gerando…" : "Gerar segredo do webhook"}
        </button>
        {secretState.error && <span className="ml-3 text-sm text-destructive">{secretState.error}</span>}
        {secretState.secret && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
            <p className="font-medium text-foreground">
              Configure o webhook da instância no Evolution com:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>
                URL: a URL do serviço Margot que o Evolution consegue alcançar +{" "}
                <span className="font-mono">/webhook/evolution</span>. Se o Evolution não alcança o domínio
                custom, use a URL interna <span className="font-mono">.sslip.io</span> do container do Margot.
              </li>
              <li>
                Evento: <span className="font-mono">MESSAGES_UPSERT</span>
              </li>
              <li>
                Header <span className="font-mono">apikey</span>:{" "}
                <span className="font-mono break-all text-foreground">{secretState.secret}</span>
              </li>
            </ul>
            <p className="mt-2 text-muted-foreground">Guarde o segredo — ele só aparece agora.</p>
          </div>
        )}
      </form>
    </div>
  )
}
