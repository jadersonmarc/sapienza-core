"use server"

import { revalidatePath } from "next/cache"
import { margotContext, sendMessage, handoff, putConfig, MargotError } from "@/lib/margot/client"
import type { AgentConfig } from "@/lib/margot/types"

export type ActionState = { ok?: boolean; error?: string }

export async function sendMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await margotContext()
    const convId = String(formData.get("convId") ?? "")
    const text = String(formData.get("text") ?? "").trim()
    if (!convId || !text) return { error: "mensagem vazia" }
    await sendMessage(ctx, convId, text)
    revalidatePath(`/margot/atendimento/${convId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MargotError ? e.message : "falha ao enviar" }
  }
}

export async function handoffAction(formData: FormData): Promise<void> {
  const ctx = await margotContext()
  const convId = String(formData.get("convId") ?? "")
  if (convId) {
    await handoff(ctx, convId)
    revalidatePath(`/margot/atendimento/${convId}`)
  }
}

export async function saveConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await margotContext()
    const cfg: AgentConfig = {
      system_prompt: String(formData.get("system_prompt") ?? ""),
      tone: String(formData.get("tone") ?? ""),
      fallback: String(formData.get("fallback") ?? ""),
      max_tokens: Number(formData.get("max_tokens") ?? 0) || 0,
      ai_model: String(formData.get("ai_model") ?? ""),
      driver: String(formData.get("driver") ?? "evolution"),
      dedicated_number_confirmed: formData.get("dedicated_number_confirmed") === "on",
    }
    await putConfig(ctx, cfg)
    revalidatePath("/margot/configuracao")
    revalidatePath("/margot")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MargotError ? e.message : "falha ao salvar" }
  }
}
