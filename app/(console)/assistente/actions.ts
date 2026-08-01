"use server"

import { currentContext } from "@/lib/console/current"
import { tenantSubscriptions } from "@/lib/tenant/context"
import { ask, isAssistantConfigured, type ChatTurn } from "@/lib/insights/assistant"
import type { Subs } from "@/lib/insights/tools"
import { getContentStats, motorContext } from "@/lib/motor/client"
import { getStats, margotContext } from "@/lib/margot/client"

export type AssistantState = { reply?: string; error?: string; usedTools?: string[] }

// Pergunta ao assistente. O histórico (texto) vem do cliente; o tenant é resolvido
// aqui pela sessão (nunca pelo modelo). Só as tools dos produtos assinados entram.
export async function askAssistant(history: ChatTurn[]): Promise<AssistantState> {
  if (!isAssistantConfigured()) return { error: "Assistente indisponível (ANTHROPIC_API_KEY não configurada)." }
  const { active } = await currentContext()
  if (!active) return { error: "Conta sem empresa vinculada." }

  const subs = await tenantSubscriptions(active.id)
  const s: Subs = {
    motor: subs.some((x) => x.produto === "motor" && x.status === "active"),
    margot: subs.some((x) => x.produto === "margot" && x.status === "active"),
  }
  if (!s.motor && !s.margot) return { error: "Nenhum produto ativo para analisar." }

  // deps resolvem o tenant da SESSÃO (motorContext/margotContext) — não do modelo.
  const deps = {
    editoraStats: async (period?: string) => getContentStats(await motorContext(), period),
    atendenteStats: async () => getStats(await margotContext()),
  }

  try {
    const { reply, usedTools } = await ask(history, s, deps)
    return { reply, usedTools }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao consultar o assistente." }
  }
}
