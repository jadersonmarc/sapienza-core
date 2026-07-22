import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { paymentProvider, setPaymentProvider, PaymentError } from "./asaas"

// Cliente do Asaas contra um fetch mockado — sem tocar a rede.

type Captured = { url: string; method: string; headers: Record<string, string>; body: unknown }

function mockFetch(status: number, json: unknown): Captured[] {
  const calls: Captured[] = []
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    })
    return new Response(JSON.stringify(json), { status })
  })
  return calls
}

describe("Asaas payment provider", () => {
  beforeEach(() => {
    setPaymentProvider(null) // limpa o cache do módulo
    process.env.ASAAS_BASE_URL = "https://sandbox.test/api/v3"
    process.env.ASAAS_API_KEY = "sandbox-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setPaymentProvider(null)
  })

  it("configured() reflete a env", () => {
    expect(paymentProvider().configured()).toBe(true)
    setPaymentProvider(null)
    process.env.ASAAS_API_KEY = ""
    expect(paymentProvider().configured()).toBe(false)
  })

  it("upsertCustomer manda cpfCnpj/email com o header access_token e devolve o id", async () => {
    const calls = mockFetch(200, { id: "cus_123" })
    const r = await paymentProvider().upsertCustomer({
      name: "Empresa X",
      taxId: "12345678000199",
      email: "fin@empresa.com",
    })
    expect(r.id).toBe("cus_123")
    expect(calls[0].url).toBe("https://sandbox.test/api/v3/customers")
    expect(calls[0].method).toBe("POST")
    expect(calls[0].headers.access_token).toBe("sandbox-key")
    expect(calls[0].body).toMatchObject({ name: "Empresa X", cpfCnpj: "12345678000199", email: "fin@empresa.com" })
  })

  it("createCharge monta a cobrança e devolve id + invoiceUrl", async () => {
    const calls = mockFetch(200, {
      id: "pay_9",
      invoiceUrl: "https://asaas/i/pay_9",
      status: "PENDING",
    })
    const c = await paymentProvider().createCharge({
      customerId: "cus_123",
      value: 800,
      dueDate: "2026-08-10",
      description: "Sapienza 2026-07",
      externalReference: "inv-abc",
    })
    expect(c).toEqual({ id: "pay_9", invoiceUrl: "https://asaas/i/pay_9", status: "PENDING" })
    expect(calls[0].url).toBe("https://sandbox.test/api/v3/payments")
    expect(calls[0].body).toMatchObject({
      customer: "cus_123",
      billingType: "UNDEFINED",
      value: 800,
      dueDate: "2026-08-10",
      externalReference: "inv-abc",
    })
  })

  it("propaga erro do Asaas como PaymentError com a descrição", async () => {
    mockFetch(400, { errors: [{ description: "CPF/CNPJ inválido" }] })
    await expect(
      paymentProvider().upsertCustomer({ name: "X", taxId: "1", email: "a@b.com" }),
    ).rejects.toThrowError(PaymentError)
    // e a mensagem carrega a descrição
    await expect(
      paymentProvider().upsertCustomer({ name: "X", taxId: "1", email: "a@b.com" }),
    ).rejects.toThrow(/CPF\/CNPJ inválido/)
  })
})
