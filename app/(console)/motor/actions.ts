"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  motorContext,
  createContent,
  createMotion,
  createFromBrief,
  deleteContent,
  updateContent,
  transitionContent,
  regenerateContent,
  publishContent,
  connectChannel,
  disconnectChannel,
  saveEditorConfig,
  generatePieceImage,
  setPieceImage,
  runAnalysis,
  applyRecommendation,
  acceptProposal,
  discardProposal,
  MotorError,
} from "@/lib/motor/client"
import type { AnalysisType, ContentFormat, ContentStatus, Platform } from "@/lib/motor/types"

export type ActionState = { ok?: boolean; error?: string; message?: string }

export async function createContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const prompt = String(formData.get("prompt") ?? "").trim()
  if (!prompt) return { error: "descreva o tema da peça" }
  const raw = String(formData.get("format") ?? "blog")
  const format: ContentFormat = raw === "linkedin" || raw === "instagram" ? raw : "blog"
  let id: string
  try {
    const ctx = await motorContext()
    const created = await createContent(ctx, prompt, format)
    id = created.id
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao criar peça" }
  }
  revalidatePath("/motor/conteudo")
  redirect(`/motor/conteudo/${id}`)
}

export async function createMotionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const prompt = String(formData.get("prompt") ?? "").trim()
  if (!prompt) return { error: "descreva o tema da peça em movimento" }
  let id: string
  try {
    const ctx = await motorContext()
    const created = await createMotion(ctx, prompt)
    id = created.id
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao criar peça de motion" }
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

/** Exclui a peça e volta para a lista. */
export async function deleteContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "")
  if (!id) return { error: "peça inválida" }
  try {
    const ctx = await motorContext()
    await deleteContent(ctx, id)
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao excluir" }
  }
  revalidatePath("/motor/conteudo")
  redirect("/motor/conteudo")
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

export async function applyRecommendationAction(input: {
  id: string
  type?: string
  recommendation: string
}): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    await applyRecommendation(ctx, input.id, { type: input.type, recommendation: input.recommendation })
    revalidatePath(`/motor/conteudo/${input.id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao gerar proposta" }
  }
}

export async function acceptProposalAction(id: string, pid: string): Promise<void> {
  const ctx = await motorContext()
  await acceptProposal(ctx, id, pid)
  revalidatePath(`/motor/conteudo/${id}`)
}

export async function discardProposalAction(id: string, pid: string): Promise<void> {
  const ctx = await motorContext()
  await discardProposal(ctx, id, pid)
  revalidatePath(`/motor/conteudo/${id}`)
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
    // Publicação roda em segundo plano — o resultado aparece na peça em instantes.
    return { ok: true, message: "Publicação iniciada — atualize a página em instantes para ver o resultado." }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao publicar" }
  }
}

/** Gera a imagem on-brand da peça no formato do canal e a persiste. */
export async function generatePieceImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    if (!id) return { error: "peça inválida" }
    await generatePieceImage(ctx, id)
    revalidatePath(`/motor/conteudo/${id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao gerar imagem" }
  }
}

/** Troca a imagem da peça por uma URL da biblioteca de mídia. */
export async function setPieceImageAction(id: string, imageUrl: string): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    if (!id || !imageUrl) return { error: "dados inválidos" }
    await setPieceImage(ctx, id, imageUrl)
    revalidatePath(`/motor/conteudo/${id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao trocar imagem" }
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

/** Salva a config do agente de criação (aba "Agente"). */
export async function saveEditorConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const raw = String(formData.get("format") ?? "blog")
    const format: ContentFormat = raw === "linkedin" || raw === "instagram" ? raw : "blog"
    const themes = String(formData.get("themes") ?? "")
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
    const model = String(formData.get("model") ?? "").trim()
    const cadence = Number(formData.get("cadence_days") ?? 7)
    await saveEditorConfig(ctx, {
      system_prompt: String(formData.get("system_prompt") ?? "").trim(),
      tone: String(formData.get("tone") ?? "").trim(),
      themes,
      format,
      model: model || null,
      enabled: formData.get("enabled") === "on",
      cadence_days: Number.isFinite(cadence) ? cadence : 7,
    })
    revalidatePath("/motor/agente")
    revalidatePath("/motor")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao salvar" }
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

export async function disconnectChannelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const platform = String(formData.get("platform") ?? "") as Platform
    if (!platform) return { error: "canal inválido" }
    await disconnectChannel(ctx, platform)
    revalidatePath("/motor/canais")
    revalidatePath("/motor")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao desconectar canal" }
  }
}
