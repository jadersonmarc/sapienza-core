"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

export type NavItem = { href: string; label: string; exact?: boolean }
export type NavGroup = { label: string; items: NavItem[] }
export type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).items !== undefined
}

function linkClass(active: boolean): string {
  return `block rounded-md px-3 py-2 text-sm transition-colors ${
    active
      ? "bg-foreground/[0.06] font-medium text-foreground"
      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
  }`
}

function ItemLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
      {item.label}
    </Link>
  )
}

// Grupo colapsável. Abre por padrão quando contém a rota ativa; o toggle manual
// (override) tem precedência a partir do clique.
function Group({ group, pathname }: { group: NavGroup; pathname: string }) {
  const containsActive = group.items.some((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)))
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? containsActive

  return (
    <div>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        {group.label}
        <span className="font-mono text-[10px] leading-none">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 border-l border-border pl-2">
          {group.items.map((i) => (
            <ItemLink key={i.href} item={i} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ConsoleNav({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1" aria-label="Navegação do console">
      {entries.map((e) =>
        isGroup(e) ? (
          <Group key={e.label} group={e} pathname={pathname} />
        ) : (
          <ItemLink key={e.href} item={e} pathname={pathname} />
        ),
      )}
    </nav>
  )
}
