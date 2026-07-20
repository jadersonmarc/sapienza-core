"use client"

import { useActionState } from "react"
import { bindChannelAction, generateWebhookSecretAction, type ChannelActionState } from "../actions"
import type { AgentConfig } from "@/lib/margot/types"

const initial: ChannelActionState = {}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const labelCls = "text-sm font-medium"

// Vínculo do canal (superadmin Sapienza): qual instância do Evolution roteia para
// este tenant. `cfg` é null em modo criação (canal ainda não existe).
export function ChannelForm({ cfg }: { cfg: AgentConfig | null }) {
  const [state, action, pending] = useActionState(bindChannelAction, initial)
  const [secretState, secretAction, secretPending] = useActionState(generateWebhookSecretAction, initial)

  return (
    <div className="space-y-6 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Vínculo do canal (Sapienza)</h2>
        <p className="text-xs text-muted-foreground">
          Instância dedicada do Evolution que roteia o WhatsApp deste cliente. Infra da Sapienza —
          o cliente não altera.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelCls} htmlFor="evolution_instance">
              Instância do Evolution *
            </label>
            <input
              id="evolution_instance"
              name="evolution_instance"
              required
              defaultValue={cfg?.evolution_instance ?? ""}
              placeholder="ex.: cliente-acme"
              className={field}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls} htmlFor="whatsapp_number">
              Número do WhatsApp
            </label>
            <input
              id="whatsapp_number"
              name="whatsapp_number"
              defaultValue={cfg?.whatsapp_number ?? ""}
              placeholder="5521999999999"
              className={field}
            />
          </div>
        </div>

        <div className="space-y-1 sm:max-w-[50%]">
          <label className={labelCls} htmlFor="driver">
            Driver de WhatsApp
          </label>
          <select id="driver" name="driver" defaultValue={cfg?.driver || "evolution"} className={field}>
            <option value="evolution">evolution (padrão)</option>
            <option value="meta">meta (oficial — plugável)</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="dedicated_number_confirmed"
            defaultChecked={cfg?.dedicated_number_confirmed ?? false}
            className="h-4 w-4"
          />
          Número dedicado confirmado (nunca o número pessoal/principal do cliente)
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Salvando…" : cfg ? "Salvar vínculo" : "Vincular canal"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
          {state.ok && <span className="text-sm text-muted-foreground">Canal vinculado.</span>}
        </div>
      </form>

      {/* Segredo do webhook: só faz sentido depois do canal existir. */}
      {cfg && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Gere o segredo do webhook e cole-o no header <span className="font-mono">apikey</span> da
            instância no Evolution. Mostrado uma única vez.
          </p>
          <form action={secretAction}>
            <button
              type="submit"
              disabled={secretPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {secretPending ? "Gerando…" : "Gerar segredo do webhook"}
            </button>
          </form>
          {secretState.error && <p className="text-sm text-destructive">{secretState.error}</p>}
          {secretState.secret && (
            <div className="space-y-1 rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">
                Segredo para a instância <span className="font-mono">{secretState.instance}</span> (copie
                agora):
              </p>
              <code className="block break-all text-sm">{secretState.secret}</code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
