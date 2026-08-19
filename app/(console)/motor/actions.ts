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
  republishContent,
  connectChannel,
  disconnectChannel,
  saveEditorConfig,
  generatePieceImage,
  setPieceImage,
  runAnalysis,
  applyRecommendation,
  acceptProposal,
  discardProposal,
  createClipFromUrl,
  updateClip,
  correctClipTranscript,
  importClipFromConnector,
  deleteClip,
  deleteClipVideo,
  MotorError,
  type CaptionStyleInput,
} from "@/lib/motor/client"
import type { AnalysisType, ContentFormat, ContentStatus, Platform } from "@/lib/motor/types"

export type ActionState = { ok?: boolean; error?: string; message?: string }

// Monta o estilo de legenda do motion a partir do form (item 8a). Só inclui o que foi
// escolhido; tudo vazio → undefined (herda o default do tenant). Valores fora dos
// tokens são ignorados aqui e revalidados no motor.
const CAP_FONTS = ["display", "sans", "mono"] as const
const CAP_COLORS = ["default", "accent", "signal"] as const
function pickCaptionStyle(formData: FormData): CaptionStyleInput | undefined {
  const font = String(formData.get("captionFont") ?? "").trim()
  const color = String(formData.get("captionColor") ?? "").trim()
  const highlight = String(formData.get("captionHighlight") ?? "").trim()
  const out: CaptionStyleInput = {}
  if ((CAP_FONTS as readonly string[]).includes(font)) out.font = font as CaptionStyleInput["font"]
  if ((CAP_COLORS as readonly string[]).includes(color)) out.color = color as CaptionStyleInput["color"]
  if ((CAP_COLORS as readonly string[]).includes(highlight)) out.highlight = highlight as CaptionStyleInput["highlight"]
  return Object.keys(out).length > 0 ? out : undefined
}

// Importa um arquivo da conta de nuvem conectada (Drive/Dropbox) para a esteira.
export async function importFromConnectorAction(
  provider: string,
  fileRef: string,
): Promise<{ error?: string; ok?: boolean }> {
  if (!fileRef.trim()) return { error: "informe o ID/caminho do arquivo" }
  try {
    const ctx = await motorContext()
    await importClipFromConnector(ctx, provider, fileRef.trim())
    return { ok: true }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao importar da nuvem" }
  }
}

// Corrige um termo na transcrição e propaga para os clipes do vídeo.
export async function correctTranscriptAction(
  sourceId: string,
  from: string,
  to: string,
): Promise<{ error?: string; corrected?: number; requeued?: number }> {
  if (!from.trim() || !to.trim()) return { error: "preencha a palavra errada e a correção" }
  try {
    const ctx = await motorContext()
    return await correctClipTranscript(ctx, sourceId, from.trim(), to.trim())
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao corrigir" }
  }
}

// Exclui um clipe (local; não despublica). O componente faz refresh depois.
export async function deleteClipAction(id: string): Promise<{ error?: string }> {
  try {
    const ctx = await motorContext()
    await deleteClip(ctx, id)
    return {}
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao excluir o clipe" }
  }
}

// Exclui o vídeo-fonte + clipes em cascata; volta para a lista de Clipes.
export async function deleteClipVideoAction(sourceId: string): Promise<{ error?: string }> {
  try {
    const ctx = await motorContext()
    await deleteClipVideo(ctx, sourceId)
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao excluir o vídeo" }
  }
  revalidatePath("/motor/clipes")
  redirect("/motor/clipes")
}

// Editor-lite: reajusta o corte de um clipe e re-renderiza.
export async function editClipAction(
  id: string,
  patch: {
    inMs?: number
    outMs?: number
    aspect?: "9x16" | "16x9"
    brandOn?: boolean
    captionPosition?: "bottom" | "center" | "top"
    hd?: boolean
  },
): Promise<{ error?: string }> {
  try {
    const ctx = await motorContext()
    await updateClip(ctx, id, patch)
    return {}
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao ajustar o clipe" }
  }
}

// Clipes Inteligentes: cria uma fonte por URL. O worker processa em segundo plano;
// a página faz polling do status.
export async function createClipFromUrlAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const url = String(formData.get("url") ?? "").trim()
  if (!url) return { error: "cole a URL de um vídeo" }
  try {
    const ctx = await motorContext()
    await createClipFromUrl(ctx, url)
    revalidatePath("/motor/clipes")
    return { ok: true, message: "Vídeo na fila — os clipes aparecem aqui quando ficarem prontos." }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao enfileirar o vídeo" }
  }
}

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
  const channel = String(formData.get("channel") ?? "instagram") === "linkedin" ? "linkedin" : "instagram"
  // Preferências opcionais ("" = automático → não envia; o motor valida).
  const archetype = String(formData.get("archetype") ?? "").trim() || undefined
  const audio = String(formData.get("audio") ?? "").trim() || undefined
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || undefined
  // Estilo de legenda (item 8a): só monta o objeto com o que foi escolhido ("" =
  // herda o default do tenant). O motor sanitiza/valida os tokens.
  const captionStyle = pickCaptionStyle(formData)
  let id: string
  try {
    const ctx = await motorContext()
    const created = await createMotion(ctx, prompt, channel, { archetype, audio, imageUrl, captionStyle })
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

export async function republishAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await motorContext()
    const id = String(formData.get("id") ?? "")
    if (!id) return { error: "peça inválida" }
    await republishContent(ctx, id)
    revalidatePath(`/motor/conteudo/${id}`)
    // Reprocesso roda em segundo plano; o resultado aparece em publish_error.
    return { ok: true, message: "Reprocesso iniciado — atualize em instantes para ver o resultado." }
  } catch (e) {
    return { error: e instanceof MotorError ? e.message : "falha ao reprocessar" }
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
      handle: String(formData.get("handle") ?? "").trim(),
      logo_url: String(formData.get("logo_url") ?? "").trim(),
      // Estilo de legenda default (item 8a). Reusa o mesmo picker do form de peça; o
      // motor sanitiza os tokens. Tudo vazio → null (herda os valores atuais).
      caption_style: pickCaptionStyle(formData) ?? null,
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
