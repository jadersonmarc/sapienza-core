"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Enquanto a peça está gerando em segundo plano, atualiza a rota a cada intervalo
// para o rascunho aparecer sozinho quando ficar pronto (sem o usuário recarregar).
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(t)
  }, [router, intervalMs])
  return null
}
