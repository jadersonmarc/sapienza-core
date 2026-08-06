"use client"

import { useActionState, useState } from "react"
import {
  applyCouponAction,
  revokeCouponAction,
  createCouponAction,
  toggleCouponActiveAction,
  type CouponState,
  type CouponCatalogState,
} from "./actions"

const initial: CouponState = {}
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

// Concessão de desconto pelo superadmin, sem passar pelo checkout. Aplica sobre a
// recorrência do Asaas da assinatura já existente (mexe só no preço).
export function ApplyCouponForm({ tenants }: { tenants: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(applyCouponAction, initial)

  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <h2 className="text-sm font-semibold">Aplicar cupom a uma assinatura</h2>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={label} htmlFor="coupon_tenant_id">
              Cliente
            </label>
            <select id="coupon_tenant_id" name="tenant_id" className={field} required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="coupon_code">
              Código do cupom
            </label>
            <input id="coupon_code" name="code" className={`${field} uppercase`} placeholder="SAPIENZA2026" required />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Aplicando…" : "Aplicar cupom"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
          {state.ok && <span className="text-sm text-muted-foreground">{state.info ?? "Cupom aplicado."}</span>}
        </div>
      </form>
    </div>
  )
}

const catalogInitial: CouponCatalogState = {}

// Cria um cupom no catálogo. Os campos de escopo aparecem conforme o tipo de
// escopo (global não leva nada; produto leva produto+plano; combo leva plano).
export function CreateCouponForm() {
  const [state, action, pending] = useActionState(createCouponAction, catalogInitial)
  const [kind, setKind] = useState("fixo")
  const [scope, setScope] = useState("global")

  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <h2 className="text-sm font-semibold">Criar cupom</h2>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={label} htmlFor="new_code">Código</label>
            <input id="new_code" name="code" className={`${field} uppercase`} placeholder="SAPIENZA2026" required />
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="new_kind">Tipo</label>
            <select id="new_kind" name="kind" className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="fixo">Fixo (R$)</option>
              <option value="percentual">Percentual (%)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="new_value">{kind === "percentual" ? "Valor (%)" : "Valor (R$)"}</label>
            <input id="new_value" name="value" type="number" step="0.01" min="0" className={field} required />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={label} htmlFor="new_scope">Escopo</label>
            <select id="new_scope" name="scope_kind" className={field} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="global">Global (qualquer plano)</option>
              <option value="produto">Produto + plano</option>
              <option value="combo">Combo + plano</option>
            </select>
          </div>
          {scope === "produto" && (
            <div className="space-y-1">
              <label className={label} htmlFor="new_produto">Produto</label>
              <select id="new_produto" name="scope_produto" className={field} defaultValue="margot">
                <option value="margot">Margot Atendente</option>
                <option value="motor">Margot Editora</option>
              </select>
            </div>
          )}
          {scope !== "global" && (
            <div className="space-y-1">
              <label className={label} htmlFor="new_tier">Plano</label>
              <select id="new_tier" name="scope_tier" className={field} defaultValue="pro">
                <option value="start">Start</option>
                <option value="pro">Pro</option>
                <option value="scale">Premium</option>
              </select>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={label} htmlFor="new_redeem_by">Resgatável até (opcional)</label>
            <input id="new_redeem_by" name="redeem_by" type="date" className={field} />
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="new_max">Máx. de resgates (opcional)</label>
            <input id="new_max" name="max_redemptions" type="number" min="1" step="1" className={field} placeholder="∞" />
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="new_model">Modelo permitido</label>
            <select id="new_model" name="billing_model" className={field} defaultValue="ambos">
              <option value="ambos">Ambos</option>
              <option value="anual">Só anual</option>
              <option value="mensal">Só mensal</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Criando…" : "Criar cupom"}
          </button>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
          {state.ok && <span className="text-sm text-muted-foreground">Cupom criado.</span>}
        </div>
      </form>
    </div>
  )
}

// Liga/desliga um cupom do catálogo.
export function ToggleCouponButton({ couponId, active }: { couponId: string; active: boolean }) {
  const [state, action, pending] = useActionState(toggleCouponActiveAction, catalogInitial)
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="coupon_id" value={couponId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.06] disabled:opacity-50"
      >
        {pending ? "…" : active ? "Desativar" : "Ativar"}
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

// Revoga um resgate ativo (a recorrência volta ao preço de tabela).
export function RevokeCouponButton({ redemptionId }: { redemptionId: string }) {
  const [state, action, pending] = useActionState(revokeCouponAction, initial)
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="redemption_id" value={redemptionId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        {pending ? "Revogando…" : "Revogar"}
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}
