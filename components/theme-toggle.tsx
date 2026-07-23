"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

// Alterna claro/escuro (mesmo padrão do spa-sapienza). Ícone via CSS (.dark) para
// não haver mismatch de hidratação nem estado no cliente.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => {
        const isDark = document.documentElement.classList.contains("dark")
        setTheme(isDark ? "light" : "dark")
      }}
      aria-label="Alternar tema claro/escuro"
      className={`inline-flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  )
}
