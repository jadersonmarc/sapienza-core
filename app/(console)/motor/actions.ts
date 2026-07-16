"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  motorContext,
  createContent,
  transitionContent,
  regenerateContent,
  publishContent,
  connectChannel,
  MotorError,
} from "@/lib/motor/client"
import type { ContentStatus, Platform } from "@/lib/motor/types"

export type ActionState = { ok?: boolean; error?: string }

export async function createContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const prompt = String(formData.get("prompt") ?? "").trim()
  if (!prompt) return { error: "descreva o tema da peça" }
  let id: string
  try {
    const ctx = await motorContext()
    const created = await createContent(ctx, prompt)
    id = created.id
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao criar peça" }
  }
  revalidatePath("/motor/conteudo")
  redirect(`/motor/conteudo/${id}`)
}

export async function transitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    const to = String(formData.get("to") ?? "") as ContentStatus
    const scheduledAt = String(formData.get("scheduledAt") ?? "").trim() || undefined
    if (!id || !to) return { error: "transição inválida" }
    await transitionContent(ctx, id, to, scheduledAt ? new Date(scheduledAt).toISOString() : undefined)
    revalidatePath(`/motor/conteudo/${id}`)
    revalidatePath("/motor/conteudo")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha na transição" }
  }
}

export async function regenerateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    const prompt = String(formData.get("prompt") ?? "").trim() || undefined
    if (!id) return { error: "peça inválida" }
    await regenerateContent(ctx, id, prompt)
    revalidatePath(`/motor/conteudo/${id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao regenerar" }
  }
}

export async function publishAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    if (!id) return { error: "peça inválida" }
    await publishContent(ctx, id)
    revalidatePath(`/motor/conteudo/${id}`)
    revalidatePath("/motor/conteudo")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao publicar" }
  }
}

export async function connectChannelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const platform = String(formData.get("platform") ?? "") as Platform
    const credentials = String(formData.get("credentials") ?? "").trim() || undefined
    if (!platform) return { error: "canal inválido" }
    await connectChannel(ctx, platform, credentials)
    revalidatePath("/motor/canais")
    revalidatePath("/motor")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao conectar canal" }
  }
}
