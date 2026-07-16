import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { secretMatches, cronAuthorized } from "@/lib/auth/webhook"

// O gate dos jobs agendados. Puro (sem DB): o caminho negado do handler retorna
// antes de tocar o banco, e lib/db é lazy — importar a rota não conecta.

function reqWith(secret?: string): Request {
  return new Request("http://localhost/api/cron/billing-close", {
    method: "POST",
    headers: secret ? { "x-webhook-secret": secret } : {},
  })
}

describe("secretMatches", () => {
  it("aceita o segredo correto", () => {
    expect(secretMatches("s3gr3d0", "s3gr3d0")).toBe(true)
  })

  it("rejeita segredo errado, ausente ou de outro comprimento", () => {
    expect(secretMatches("errado", "s3gr3d0")).toBe(false)
    expect(secretMatches(null, "s3gr3d0")).toBe(false)
    expect(secretMatches(undefined, "s3gr3d0")).toBe(false)
    expect(secretMatches("", "s3gr3d0")).toBe(false)
    // Hash antes do compare: comprimento diferente não estoura o timingSafeEqual.
    expect(secretMatches("x".repeat(500), "s3gr3d0")).toBe(false)
  })
})

describe("cronAuthorized", () => {
  const original = process.env.WEBHOOK_SECRET
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = "s3gr3d0"
  })
  afterEach(() => {
    if (original === undefined) delete process.env.WEBHOOK_SECRET
    else process.env.WEBHOOK_SECRET = original
  })

  it("autoriza com o header correto", () => {
    expect(cronAuthorized(reqWith("s3gr3d0"))).toBe(true)
  })

  it("nega sem header e com header errado", () => {
    expect(cronAuthorized(reqWith())).toBe(false)
    expect(cronAuthorized(reqWith("errado"))).toBe(false)
  })

  it("nega quando WEBHOOK_SECRET não está configurada (fail-closed)", () => {
    delete process.env.WEBHOOK_SECRET
    expect(cronAuthorized(reqWith("s3gr3d0"))).toBe(false)
  })
})

describe("POST /api/cron/billing-close", () => {
  const original = process.env.WEBHOOK_SECRET
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = "s3gr3d0"
  })
  afterEach(() => {
    if (original === undefined) delete process.env.WEBHOOK_SECRET
    else process.env.WEBHOOK_SECRET = original
  })

  // Regressão: a rota já esteve dentro do matcher do middleware, que a
  // redirecionava p/ /login (302). Como o agendador não segue redirect e trata
  // 3xx como sucesso, o faturamento silenciosamente nunca rodava. O handler tem
  // de responder 401 — nunca 3xx — para uma chamada sem credencial.
  it("responde 401 (não redirect) sem o header", async () => {
    const { POST } = await import("@/app/api/cron/billing-close/route")
    const res = await POST(reqWith())
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" })
  })

  it("responde 401 com o header errado", async () => {
    const { POST } = await import("@/app/api/cron/billing-close/route")
    const res = await POST(reqWith("errado"))
    expect(res.status).toBe(401)
  })
})
