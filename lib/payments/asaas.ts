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

// Assinatura RECORRENTE no cartão (transparente): o cliente digita o cartão na
// NOSSA página; mandamos os dados uma vez ao Asaas, que guarda o cartão e cobra
// todo mês sozinho. O primeiro pagamento é capturado na criação — cartão recusado
// devolve erro aqui. O webhook do 1º pagamento (externalReference = fatura) ativa.
export type CardSubscriptionInput = {
  customerId: string
  value: number
  description: string
  externalReference: string // id da nossa fatura de ativação (p/ o webhook reconciliar)
  nextDueDate: string // "YYYY-MM-DD" — 1ª cobrança
  remoteIp: string // exigido pelo Asaas p/ antifraude no cartão
  card: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string }
  // Asaas exige do titular: nome, e-mail, CPF/CNPJ, CEP, número e telefone.
  holder: { name: string; email: string; taxId: string; postalCode: string; addressNumber: string; phone: string }
}
export type CardSubscription = { id: string; status: string }

export interface PaymentProvider {
  /** Há credenciais configuradas (senão não dá para cobrar). */
  configured(): boolean
  /** Cria/atualiza o cliente e devolve o id no provedor. */
  upsertCustomer(input: CustomerInput): Promise<{ id: string }>
  /** Emite uma cobrança avulsa (usada no excedente do fechamento mensal). */
  createCharge(input: ChargeInput): Promise<Charge>
  /** Cria a assinatura recorrente no cartão (transparente). */
  createCardSubscription(input: CardSubscriptionInput): Promise<CardSubscription>
  /** Cancela a assinatura recorrente no provedor (para de cobrar o cartão). */
  cancelSubscription(subscriptionId: string): Promise<void>
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

  async createCardSubscription(input: CardSubscriptionInput): Promise<CardSubscription> {
    const r = await this.req<{ id: string; status?: string }>("POST", "/subscriptions", {
      customer: input.customerId,
      billingType: "CREDIT_CARD",
      cycle: "MONTHLY",
      value: input.value,
      nextDueDate: input.nextDueDate,
      description: input.description,
      externalReference: input.externalReference,
      remoteIp: input.remoteIp,
      creditCard: {
        holderName: input.card.holderName,
        number: input.card.number,
        expiryMonth: input.card.expiryMonth,
        expiryYear: input.card.expiryYear,
        ccv: input.card.ccv,
      },
      creditCardHolderInfo: {
        name: input.holder.name,
        email: input.holder.email,
        cpfCnpj: input.holder.taxId,
        postalCode: input.holder.postalCode,
        addressNumber: input.holder.addressNumber,
        phone: input.holder.phone,
      },
    })
    return { id: r.id, status: r.status ?? "" }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.req("DELETE", `/subscriptions/${subscriptionId}`)
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
