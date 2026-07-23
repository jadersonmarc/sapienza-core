"use server"

import { revalidatePath } from "next/cache"
import {
  margotContext,
  sendMessage,
  handoff,
  putConfig,
  bindChannel,
  rotateWebhookSecret,
  connectChannel,
  patchContact,
  deleteContact,
  MargotError,
} from "@/lib/margot/client"
import type { AgentConfig, ChannelBinding } from "@/lib/margot/types"

export type ActionState = { ok?: boolean; error?: string }
// Estado do vínculo do canal — carrega o segredo do webhook quando gerado (uma vez).
export type ChannelActionState = { ok?: boolean; error?: string; secret?: string; instance?: string }
// Estado da conexão por QR — carrega o QR quando gerado.
export type ConnectState = { qr?: string; error?: string }

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

export async function updateContactAction(
  id: string,
  body: { name?: string; stage_id?: string; consent: boolean },
): Promise<void> {
  const ctx = await margotContext()
  await patchContact(ctx, id, body)
  revalidatePath("/margot/crm")
}

export async function deleteContactAction(id: string): Promise<void> {
  const ctx = await margotContext()
  await deleteContact(ctx, id)
  revalidatePath("/margot/crm")
}

export async function handoffAction(formData: FormData): Promise<void> {
  const ctx = await margotContext()
  const convId = String(formData.get("convId") ?? "")
  const mode = formData.get("mode") === "bot" ? "bot" : "human"
  if (convId) {
    await handoff(ctx, convId, mode)
    revalidatePath(`/margot/atendimento/${convId}`)
  }
}

export async function saveConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await margotContext()
    // Só o comportamento do agente; identidade/roteamento do canal é do vínculo.
    const cfg = {
      system_prompt: String(formData.get("system_prompt") ?? ""),
      tone: String(formData.get("tone") ?? ""),
      fallback: String(formData.get("fallback") ?? ""),
      max_tokens: Number(formData.get("max_tokens") ?? 0) || 0,
      ai_model: String(formData.get("ai_model") ?? ""),
    } as AgentConfig
    await putConfig(ctx, cfg)
    revalidatePath("/margot/configuracao")
    revalidatePath("/margot")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MargotError ? e.message : "falha ao salvar" }
  }
}

// Vínculo do canal — SOMENTE superadmin Sapienza (gate duro, server-side). A
// instância do Evolution é infra da Sapienza; o cliente não a define.
export async function bindChannelAction(
  _prev: ChannelActionState,
  formData: FormData,
): Promise<ChannelActionState> {
  try {
    const ctx = await margotContext()
    if (!ctx.isSuperadmin) return { error: "apenas o superadmin Sapienza vincula o canal" }
    const binding: ChannelBinding = {
      evolution_instance: String(formData.get("evolution_instance") ?? "").trim(),
      whatsapp_number: String(formData.get("whatsapp_number") ?? "").trim(),
      driver: String(formData.get("driver") ?? "evolution"),
      dedicated_number_confirmed: formData.get("dedicated_number_confirmed") === "on",
    }
    if (!binding.evolution_instance) return { error: "instância do Evolution é obrigatória" }
    await bindChannel(ctx, binding)
    revalidatePath("/margot/configuracao")
    revalidatePath("/margot")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MargotError ? e.message : "falha ao vincular canal" }
  }
}

// Conecta o WhatsApp (self-serve, owner/admin): provisiona a instância no
// Evolution e devolve o QR para escanear. O componente client faz o polling do
// status depois disto.
export async function connectChannelAction(
  _prev: ConnectState,
  _formData: FormData,
): Promise<ConnectState> {
  try {
    const ctx = await margotContext()
    const r = await connectChannel(ctx)
    return { qr: r.qr_base64 }
  } catch (e) {
    return { error: e instanceof MargotError ? e.message : "falha ao conectar o WhatsApp" }
  }
}

// Gera o segredo do webhook (mostrado uma vez) — SOMENTE superadmin. Requer o
// canal já vinculado.
export async function generateWebhookSecretAction(
  _prev: ChannelActionState,
  _formData: FormData,
): Promise<ChannelActionState> {
  try {
    const ctx = await margotContext()
    if (!ctx.isSuperadmin) return { error: "apenas o superadmin Sapienza gera o segredo" }
    const r = await rotateWebhookSecret(ctx)
    return { ok: true, secret: r.secret, instance: r.instance }
  } catch (e) {
    return { error: e instanceof MargotError ? e.message : "falha ao gerar segredo" }
  }
}
