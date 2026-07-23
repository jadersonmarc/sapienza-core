"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  motorContext,
  createContent,
  createFromBrief,
  updateContent,
  transitionContent,
  regenerateContent,
  publishContent,
  connectChannel,
  generateSocialCaption,
  saveSocialCaption,
  runAnalysis,
  MotorError,
} from "@/lib/motor/client"
import type { AnalysisType, ContentStatus, Platform, SocialPlatform } from "@/lib/motor/types"

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

export async function createFromBriefAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const objetivo = String(formData.get("objetivo") ?? "").trim()
  if (!objetivo) return { error: "descreva o objetivo do conteúdo" }
  let id: string
  try {
    const ctx = await motorContext()
    const created = await createFromBrief(ctx, {
      objetivo,
      pontosChave: String(formData.get("pontosChave") ?? "").trim() || undefined,
      publico: String(formData.get("publico") ?? "").trim() || undefined,
      tom: String(formData.get("tom") ?? "").trim() || undefined,
      pilar: String(formData.get("pilar") ?? "").trim() || undefined,
    })
    id = created.id
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao gerar do brief" }
  }
  revalidatePath("/motor/conteudo")
  redirect(`/motor/conteudo/${id}`)
}

export async function saveContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim()
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  if (!id) return { error: "peça inválida" }
  if (!title || !bodyMarkdown) return { error: "título e corpo são obrigatórios" }
  try {
    const ctx = await motorContext()
    await updateContent(ctx, id, { title, bodyMarkdown, excerpt: excerpt || undefined })
    revalidatePath(`/motor/conteudo/${id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao salvar" }
  }
}

export async function transitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    const to = String(formData.get("to") ?? "") as ContentStatus
    const scheduledAt = String(formData.get("scheduledAt") ?? "").trim() || undefined
    if (!id || !to) return { error: "transição inválida" }
    await transitionContent(ctx, id, to, {
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    })
    revalidatePath(`/motor/conteudo/${id}`)
    revalidatePath("/motor/conteudo")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha na transição" }
  }
}

/** Rejeição explícita: volta a peça para rascunho com um motivo (auditado); sai do
 *  caminho de auto-publicação da janela de 48h. */
export async function rejectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    const note = String(formData.get("note") ?? "").trim()
    if (!id) return { error: "peça inválida" }
    if (!note) return { error: "informe o motivo da rejeição" }
    await transitionContent(ctx, id, "draft", { note })
    revalidatePath(`/motor/conteudo/${id}`)
    revalidatePath("/motor/conteudo")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao rejeitar" }
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

export async function generateSocialAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    const platform = String(formData.get("platform") ?? "") as SocialPlatform
    if (!id || (platform !== "instagram" && platform !== "linkedin")) return { error: "dados inválidos" }
    await generateSocialCaption(ctx, id, platform)
    revalidatePath(`/motor/conteudo/${id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao gerar legenda" }
  }
}

/** Parseia hashtags de texto livre: remove #, separa por espaço/vírgula, deduplica. */
function parseHashtags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, "").trim())
        .filter(Boolean),
    ),
  )
}

export async function saveSocialAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    const platform = String(formData.get("platform") ?? "") as SocialPlatform
    const body = String(formData.get("body") ?? "").trim()
    if (!id || (platform !== "instagram" && platform !== "linkedin")) return { error: "dados inválidos" }
    if (!body) return { error: "a legenda não pode ficar vazia" }
    await saveSocialCaption(ctx, id, platform, body, parseHashtags(String(formData.get("hashtags") ?? "")))
    revalidatePath(`/motor/conteudo/${id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao salvar legenda" }
  }
}

export async function runAnalysisAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    const type = String(formData.get("type") ?? "") as AnalysisType
    if (!id || !type) return { error: "dados inválidos" }
    await runAnalysis(ctx, id, type)
    revalidatePath(`/motor/conteudo/${id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao analisar" }
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
