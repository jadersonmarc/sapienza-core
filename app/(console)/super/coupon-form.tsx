"use client"

import { useActionState } from "react"
import { applyCouponAction, revokeCouponAction, type CouponState } from "./actions"

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
            <input id="coupon_code" name="code" className={`${field} uppercase`} placeholder="NORTEC2026" required />
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
