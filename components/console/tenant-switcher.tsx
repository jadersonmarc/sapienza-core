"use client"

import { useRef } from "react"
import type { TenantSummary } from "@/lib/tenant/context"
import { switchTenant } from "@/app/actions"

// Seletor de tenant: submete a server action ao trocar (um submit por change).
export function TenantSwitcher({
  tenants,
  activeId,
}: {
  tenants: TenantSummary[]
  activeId: string | null
}) {
  const formRef = useRef<HTMLFormElement>(null)
  if (tenants.length <= 1) {
    return (
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {tenants[0]?.name ?? "—"}
      </span>
    )
  }
  return (
    <form ref={formRef} action={switchTenant}>
      <select
        name="tenantId"
        defaultValue={activeId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-border bg-card px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </form>
  )
}
