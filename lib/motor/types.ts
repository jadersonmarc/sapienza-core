// DTOs espelhando a API do Motor (sapienza-motor/app/api/v1/*). JSON snake_case
// nas linhas do banco; camelCase nos envelopes que o Motor monta à mão.

export type ContentStatus = "draft" | "in_review" | "scheduled" | "published" | "archived"

export type ContentItem = {
  id: string
  slug: string
  status: ContentStatus
  pilar: string | null
  current_revision_id: string | null
  review_deadline_at: string | null
  scheduled_at: string | null
  published_at: string | null
  regen_count: number
}

export type ContentRevision = {
  title: string
  body_markdown: string
  excerpt: string | null
}

export type ContentDetail = ContentItem & { revision: ContentRevision | null }

export type Platform = "instagram" | "linkedin" | "blog"

export type ChannelsStatus = {
  limit: number
  channels: { platform: Platform; enabled: boolean }[]
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
