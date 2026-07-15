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

export type AgentConfig = {
  system_prompt: string
  tone: string
  fallback: string
  max_tokens: number
  ai_model: string
  driver: string
  dedicated_number_confirmed: boolean
}

export type SetupStatus = {
  channel_connected: boolean
  agent_configured: boolean
  subscription_active: boolean
  driver: string
  dedicated_number_confirmed: boolean
}
