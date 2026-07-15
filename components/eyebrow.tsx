import * as React from "react"
import { cn } from "@/lib/utils"

// Eyebrow é a assinatura "engenharia": rótulo em monospace, caixa-alta discreta,
// com um ponto petrol. Unifica hero e cabeçalhos de seção do site.
export function Eyebrow({
  children,
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      {children}
    </span>
  )
}
