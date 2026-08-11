import { describe, expect, it } from "vitest"
import { buildEmail, EMAIL_EVENT_TYPES } from "./templates"

// buildEmail é puro (payload + destinatário → e-mail). Cobre os alertas da
// Margot Atendente sem tocar no banco.

describe("buildEmail — alertas da Margot", () => {
  it("HandoffTriggered gera e-mail ao owner com link da conversa e o motivo", () => {
    const msg = buildEmail(
      "HandoffTriggered",
      { conversation_id: "conv-123", reason: "max_mensagens" },
      "dono@tenant.com",
    )
    expect(msg).not.toBeNull()
    expect(msg?.to).toBe("dono@tenant.com")
    expect(msg?.subject).toMatch(/humano/i)
    expect(msg?.html).toContain("/margot/atendimento/conv-123")
    expect(msg?.html).toMatch(/limite de mensagens/i)
  })

  it("AppointmentSignaled gera e-mail de agendamento com link da conversa", () => {
    const msg = buildEmail("AppointmentSignaled", { conversation_id: "conv-9" }, "dono@tenant.com")
    expect(msg).not.toBeNull()
    expect(msg?.subject).toMatch(/agendamento/i)
    expect(msg?.html).toContain("/margot/atendimento/conv-9")
  })

  it("ambos os tipos estão registrados como geradores de e-mail", () => {
    expect(EMAIL_EVENT_TYPES.has("HandoffTriggered")).toBe(true)
    expect(EMAIL_EVENT_TYPES.has("AppointmentSignaled")).toBe(true)
  })
})
