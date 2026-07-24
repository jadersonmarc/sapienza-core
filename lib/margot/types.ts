// DTOs espelhando a API do Margot (internal/api/api.go). JSON snake_case.

export type Conversation = {
  id: string
  contact_phone: string
  contact_name: string | null
  mode: "bot" | "human"
  status: string
  last_message_at: string | null
}

export type Message = {
  id: string
  conversation_id: string
  direction: "in" | "out"
  sender: "contact" | "bot" | "human"
  content: string
  provider_id: string | null
  status: string
  created_at: string
}

// CRM / funil de leads.
export type Contact = {
  id: string
  phone: string
  name: string | null
  source: string
  stage_id: string | null
  consent: boolean
}

export type Stage = {
  id: string
  name: string
  position: number
  count: number
}

// Automações do atendimento (regras avaliadas antes da IA).
export type AutomationType = "off_hours" | "welcome" | "keyword"

export type AutomationTrigger = {
  keywords?: string[]
  timezone?: string
  weekdays?: number[]
  start?: string
  end?: string
}

export type AutomationAction = {
  reply?: string
  handoff?: boolean
}

export type Automation = {
  id: string
  type: AutomationType
  trigger: AutomationTrigger
  action: AutomationAction
  enabled: boolean
  position: number
}

export type AgentConfig = {
  // Identidade do canal (vínculo) — read-only aqui; editada via bindChannel.
  evolution_instance: string
  whatsapp_number: string
  // Comportamento do agente — editado via putConfig.
  system_prompt: string
  tone: string
  fallback: string
  max_tokens: number
  ai_model: string
  driver: string
  dedicated_number_confirmed: boolean
}

// Vínculo do canal: qual instância do Evolution roteia para o tenant. Setado no
// onboarding (superadmin Sapienza).
export type ChannelBinding = {
  evolution_instance: string
  whatsapp_number: string
  driver: string
  dedicated_number_confirmed: boolean
}

// Segredo de webhook gerado uma única vez (para colar no Evolution).
export type WebhookSecret = { instance: string; secret: string; aviso: string }

// Onboarding self-serve por QR.
export type QRResponse = { qr_base64: string }
export type ChannelStatus = {
  connected: boolean
  state: string
  number: string
  // Diagnóstico da config real do webhook no Evolution (superadmin).
  webhook_url?: string
  webhook_enabled?: boolean
  webhook_events?: string[]
}

export type SetupStatus = {
  channel_connected: boolean
  agent_configured: boolean
  subscription_active: boolean
  driver: string
  dedicated_number_confirmed: boolean
}
