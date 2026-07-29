// DTOs espelhando a API do Motor (sapienza-motor/app/api/v1/*). JSON snake_case
// nas linhas do banco; camelCase nos envelopes que o Motor monta à mão.

export type ContentStatus = "draft" | "in_review" | "scheduled" | "published" | "archived"

export type ContentFormat = "blog" | "linkedin" | "instagram"

export type ContentItem = {
  id: string
  slug: string
  status: ContentStatus
  format: ContentFormat
  pilar: string | null
  current_revision_id: string | null
  review_deadline_at: string | null
  scheduled_at: string | null
  published_at: string | null
  regen_count: number
  image_url: string | null
  publish_error: string | null
  // Geração de rascunho em segundo plano: generating=true enquanto a IA escreve;
  // generate_error guarda a falha da última tentativa (null = ok).
  generating: boolean
  generate_error: string | null
  // Motion (peça em movimento / vídeo). is_motion marca a peça; render_* é o estado
  // do serviço de render; video_url é o MP4 pronto (R2).
  is_motion: boolean
  motion_preset: string | null
  motion_aspect: string | null
  video_url: string | null
  render_status: string | null
  render_error: string | null
  title?: string | null
}

export type ContentRevision = {
  title: string
  body_markdown: string
  excerpt: string | null
}

export type ContentDetail = ContentItem & { revision: ContentRevision | null }

// Revisão proposta pela IA (aguardando aceitar/descartar).
export type Proposal = {
  id: string
  title: string
  body_markdown: string
  excerpt: string | null
  proposed_from: { type?: string; recommendation: string } | null
  created_at: string
}

export type Platform =
  | "instagram"
  | "linkedin"
  | "blog"
  | "facebook"
  | "twitter"
  | "threads"
  | "wordpress"
  | "webhook"

export type ChannelsStatus = {
  limit: number
  channels: { platform: Platform; enabled: boolean }[]
}

export type SocialPlatform = "instagram" | "linkedin"

export type SocialCaption = {
  platform: SocialPlatform
  body: string
  hashtags: string[]
  model: string | null
}

export type SocialDraft = {
  platform: SocialPlatform
  body: string
  hashtags: string[]
  status: string
}

export type SocialDraftsResult = {
  drafts: SocialDraft[]
  platforms: { platform: SocialPlatform; label: string }[]
}

export type AnalysisType = "quality" | "seo" | "emotional" | "thematic"

export type Analysis = {
  type: AnalysisType
  payload: unknown
  model: string | null
  created_at: string
}

export type AnalysesResult = {
  analyses: Analysis[]
  types: { type: AnalysisType; label: string }[]
}

// Config do agente de criação (Margot Editora) por tenant.
export type EditorConfig = {
  system_prompt: string
  tone: string
  themes: string[]
  format: ContentFormat
  model: string | null
  enabled: boolean
  cadence_days: number
}

export type SetupStatus = {
  active: boolean
  tier: string | null
  channelLimit: number
  slotsUsed?: number
  slotsRemaining?: number
  connected: Platform[]
  available: { platform: Platform; requires: string[] }[]
}
