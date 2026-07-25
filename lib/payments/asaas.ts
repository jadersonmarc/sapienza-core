// Provedor de pagamento atrás de uma interface, para o resto do sistema não
// depender do Asaas diretamente (trocável por Iugu/etc.). O Asaas cobre o caso
// BR/PME: Pix + boleto, cobrança avulsa com vencimento, webhook de pagamento.
//
// Auth: header `access_token`. Base URL por env (sandbox por padrão). As chaves
// são distintas entre sandbox e produção.

export type CustomerInput = { name: string; taxId: string; email: string }
export type ChargeInput = {
  customerId: string
  value: number
  dueDate: string // "YYYY-MM-DD"
  description: string
  externalReference: string // id da nossa invoice, para reconciliar no webhook
  billingType?: "PIX" | "BOLETO" | "UNDEFINED" // UNDEFINED = cliente escolhe
}
export type Charge = { id: string; invoiceUrl: string; status: string }

// Checkout hospedado com assinatura RECORRENTE no cartão. O cliente digita o
// cartão na página do Asaas (nunca no nosso servidor); o Asaas cobra todo mês.
export type CheckoutInput2 = {
  value: number
  description: string
  externalReference: string // id da nossa fatura de ativação (p/ o webhook reconciliar)
  nextDueDate: string // "YYYY-MM-DD" — 1ª cobrança
  customer: { name: string; taxId: string; email: string }
  successUrl: string
  cancelUrl: string
}
export type CheckoutSession = { id: string; url: string }

export interface PaymentProvider {
  /** Há credenciais configuradas (senão não dá para cobrar). */
  configured(): boolean
  /** Cria/atualiza o cliente e devolve o id no provedor. */
  upsertCustomer(input: CustomerInput): Promise<{ id: string }>
  /** Emite uma cobrança avulsa (usada no excedente do fechamento mensal). */
  createCharge(input: ChargeInput): Promise<Charge>
  /** Cria a sessão de checkout hospedado (assinatura recorrente no cartão). */
  createCheckout(input: CheckoutInput2): Promise<CheckoutSession>
}

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "PaymentError"
  }
}

class Asaas implements PaymentProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey)
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl.replace(/\/$/, "") + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "sapienza-core",
        access_token: this.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    })
    const text = await res.text()
    if (!res.ok) {
      // Asaas devolve { errors: [{ description }] }
      let msg = text
      try {
        const j = JSON.parse(text) as { errors?: { description?: string }[] }
        msg = j.errors?.map((e) => e.description).filter(Boolean).join("; ") || text
      } catch {
        /* corpo não-JSON */
      }
      throw new PaymentError(res.status, msg || `HTTP ${res.status}`)
    }
    return (text ? JSON.parse(text) : {}) as T
  }

  async upsertCustomer(input: CustomerInput): Promise<{ id: string }> {
    const r = await this.req<{ id: string }>("POST", "/customers", {
      name: input.name,
      cpfCnpj: input.taxId,
      email: input.email,
    })
    return { id: r.id }
  }

  async createCharge(input: ChargeInput): Promise<Charge> {
    const r = await this.req<{ id: string; invoiceUrl: string; status: string }>("POST", "/payments", {
      customer: input.customerId,
      billingType: input.billingType ?? "UNDEFINED",
      value: input.value,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
    })
    return { id: r.id, invoiceUrl: r.invoiceUrl, status: r.status }
  }

  async createCheckout(input: CheckoutInput2): Promise<CheckoutSession> {
    const r = await this.req<{ id: string; link?: string }>("POST", "/checkouts", {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 60,
      callback: { successUrl: input.successUrl, cancelUrl: input.cancelUrl, expiredUrl: input.cancelUrl },
      items: [{ name: input.description, value: input.value, quantity: 1 }],
      customerData: { name: input.customer.name, cpfCnpj: input.customer.taxId, email: input.customer.email },
      subscription: { cycle: "MONTHLY", nextDueDate: input.nextDueDate },
      externalReference: input.externalReference,
    })
    // Prefere o link retornado; senão monta pela base (sandbox vs produção).
    const base = this.baseUrl.includes("sandbox") ? "https://sandbox.asaas.com" : "https://www.asaas.com"
    return { id: r.id, url: r.link || `${base}/checkoutSession/show?id=${r.id}` }
  }
}

let cached: PaymentProvider | null = null

/** Provedor de pagamento configurado por env (ASAAS_BASE_URL/ASAAS_API_KEY). */
export function paymentProvider(): PaymentProvider {
  if (cached) return cached
  const baseUrl = process.env.ASAAS_BASE_URL ?? "https://sandbox.asaas.com/api/v3"
  const apiKey = process.env.ASAAS_API_KEY ?? ""
  cached = new Asaas(baseUrl, apiKey)
  return cached
}

/** Para testes: injeta um provedor falso. */
export function setPaymentProvider(p: PaymentProvider | null): void {
  cached = p
}
