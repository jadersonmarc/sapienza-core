"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

// Sidebar do console. No desktop (lg+) é fixa e sempre aberta; no mobile vira uma barra
// no topo com um hambúrguer que abre/fecha o menu (recolhido por padrão) e fecha sozinho
// ao navegar — senão o menu inteiro ficaria na frente do conteúdo em cada página.
export function ConsoleSidebar({
  brand,
  children,
}: {
  brand: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Navegação App Router é soft (o componente não remonta) — fecha o menu na troca de rota.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <aside className="flex shrink-0 flex-col gap-4 border-b border-border bg-card/40 p-4 lg:w-60 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between lg:block">
        {brand}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="console-menu"
          aria-label="Menu"
          className="rounded-md border border-border p-2 text-foreground hover:bg-muted lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      <div
        id="console-menu"
        className={`${open ? "flex" : "hidden"} flex-1 flex-col gap-4 lg:flex`}
      >
        {children}
      </div>
    </aside>
  )
}
