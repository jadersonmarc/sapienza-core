import { describe, it, expect, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import bcrypt from "bcryptjs"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { PaymentProvider, Charge } from "@/lib/payments/asaas"

// Checkout self-service de ponta a ponta (com Asaas falso): cria conta em
// past_due, emite cobrança; o webhook reativa. Requer TEST_DATABASE_URL.

const dsn = process.env.TEST_DATABASE_URL
const maybe = dsn ? describe : describe.skip

class FakeProvider implements PaymentProvider {
  configured() {
    return true
  }
  async upsertCustomer() {
    return { id: "cus_checkout" }
  }
  async createCharge(input: { externalReference: string }): Promise<Charge> {
    return { id: "pay_" + input.externalReference.slice(0, 6), invoiceUrl: "https://asaas/i/checkout", status: "PENDING" }
  }
  async createCardSubscription(input: { externalReference: string }) {
    return { id: "sub_" + input.externalReference.slice(0, 6), status: "ACTIVE" }
  }
  async updateSubscriptionValue() {}
  async cancelSubscription() {}
}

maybe("checkoutSignup", () => {
  let raw: ReturnType<typeof postgres>
  let checkoutSignup: typeof import("@/lib/signup/checkout")["checkoutSignup"]
  let setPaymentProvider: typeof import("@/lib/payments/asaas")["setPaymentProvider"]
  let applyPaymentReceived: typeof import("@/lib/billing/reconcile")["applyPaymentReceived"]

  beforeAll(async () => {
    process.env.DATABASE_URL = dsn
    raw = postgres(dsn!, { prepare: false, max: 1 })
    await raw.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
                      DROP SCHEMA IF EXISTS bus CASCADE;`)
    for (const f of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
      await raw.unsafe(readFileSync(join(process.cwd(), "drizzle", f), "utf8"))
    }
    await raw`INSERT INTO public.plans (produto, tier, metric, mensal, incluso, canais, excedente_unitario, piso)
              VALUES ('margot','pro','resposta',700,1500,NULL,0.50,400),
                     ('margot','start','resposta',400,500,NULL,0.50,400),
                     ('motor','start','peca',400,12,1,25.0,400)`
    ;({ checkoutSignup } = await import("@/lib/signup/checkout"))
    ;({ setPaymentProvider } = await import("@/lib/payments/asaas"))
    ;({ applyPaymentReceived } = await import("@/lib/billing/reconcile"))
    setPaymentProvider(new FakeProvider())
  })
  afterAll(async () => {
    setPaymentProvider(null)
    await raw?.end()
  })

  const validCard = {
    card: { number: "5162306219378829", holderName: "CLIENTE CHECKOUT", expiryMonth: "05", expiryYear: "2030", ccv: "318" },
    postalCode: "89223-005",
    addressNumber: "277",
    phone: "(47) 3003-3030",
    remoteIp: "116.213.44.5",
  }

  it("cria conta em past_due + assinatura no cartão; o webhook de pagamento ativa", async () => {
    const { tenantId, invoiceId } = await checkoutSignup({
      name: "Cliente Checkout",
      taxId: "12345678000199",
      email: "novo@cliente.com",
      password: "SenhaForte123",
      produto: "margot",
      tier: "pro",
      ...validCard,
    })
    expect(invoiceId).toBeTruthy()

    // owner criado e loga com a senha escolhida
    const [u] = await raw<{ password_hash: string }[]>`SELECT password_hash FROM public.users WHERE email='novo@cliente.com'`
    expect(await bcrypt.compare("SenhaForte123", u.password_hash)).toBe(true)

    // assinatura bloqueada (past_due) até pagar
    const [sub0] = await raw<{ status: string }[]>`SELECT status FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    expect(sub0.status).toBe("past_due")

    // fatura de ativação com a cobrança (só a mensalidade)
    const [inv] = await raw<{ id: string; status: string; total_brl: string; provider_charge_id: string }[]>`
      SELECT id, status, total_brl, provider_charge_id FROM public.invoices WHERE tenant_id=${tenantId}::uuid`
    expect(inv.status).toBe("issued")
    expect(Number(inv.total_brl)).toBe(700)
    expect(inv.provider_charge_id).toMatch(/^sub_/)

    // guardou o id da assinatura recorrente (p/ cancelar depois)
    const [s] = await raw<{ provider_sub_id: string }[]>`
      SELECT provider_sub_id FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    expect(s.provider_sub_id).toMatch(/^sub_/)

    // webhook: pagou → fatura paga + assinatura ativa (conta liberada)
    await applyPaymentReceived(inv.provider_charge_id, inv.id)
    const [sub1] = await raw<{ status: string }[]>`SELECT status FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    const [inv1] = await raw<{ status: string }[]>`SELECT status FROM public.invoices WHERE id=${inv.id}::uuid`
    expect(sub1.status).toBe("active")
    expect(inv1.status).toBe("paid")
  })

  it("combo: cria margot+motor (past_due), 1 recorrência ao preço do combo, ativa junto ao pagar", async () => {
    const { tenantId, invoiceId } = await checkoutSignup({
      name: "Cliente Combo",
      taxId: "12345678000199",
      email: "combo@cliente.com",
      password: "SenhaForte123",
      produto: "combo",
      tier: "start",
      ...validCard,
    })
    expect(invoiceId).toBeTruthy()

    // duas assinaturas (margot + motor), ambas past_due, MESMO provider_sub_id
    const subs = await raw<{ produto: string; status: string; provider_sub_id: string }[]>`
      SELECT produto, status, provider_sub_id FROM public.subscriptions
       WHERE tenant_id=${tenantId}::uuid ORDER BY produto`
    expect(subs.map((s) => s.produto)).toEqual(["margot", "motor"])
    expect(subs.every((s) => s.status === "past_due")).toBe(true)
    expect(subs[0].provider_sub_id).toMatch(/^sub_/)
    expect(subs[0].provider_sub_id).toBe(subs[1].provider_sub_id)

    // fatura de ativação ao PREÇO DO COMBO (700), não a soma dos avulsos (800)
    const [inv] = await raw<{ id: string; total_brl: string; lines: unknown }[]>`
      SELECT id, total_brl, lines FROM public.invoices WHERE tenant_id=${tenantId}::uuid`
    expect(Number(inv.total_brl)).toBe(700)
    const lines = inv.lines as { produto: string; subtotal: number }[]
    expect(lines.map((l) => l.produto)).toEqual(["margot", "motor", "desconto_combo"])
    expect(lines.reduce((s, l) => s + Number(l.subtotal), 0)).toBe(700)

    // pagou → as DUAS assinaturas ativam
    await applyPaymentReceived("sub_" + inv.id.slice(0, 6), inv.id)
    const after = await raw<{ status: string }[]>`
      SELECT status FROM public.subscriptions WHERE tenant_id=${tenantId}::uuid`
    expect(after.every((s) => s.status === "active")).toBe(true)
  })

  it("recusa senha fraca e produto inválido, e e-mail já com conta ativa", async () => {
    const { CheckoutError } = await import("@/lib/signup/checkout")
    await expect(
      checkoutSignup({ name: "X", taxId: "1", email: "a@b.com", password: "fraca", produto: "margot", tier: "pro", ...validCard }),
    ).rejects.toThrow(CheckoutError)
    // 'novo@cliente.com' já foi cadastrado no teste anterior → e-mail duplicado
    await expect(
      checkoutSignup({ name: "Y", taxId: "12345678000199", email: "novo@cliente.com", password: "SenhaForte123", produto: "margot", tier: "pro", ...validCard }),
    ).rejects.toThrow(/já existe uma conta/)
  })

  it("mesmo nome de empresa NÃO funde contas: cada cadastro é um tenant novo", async () => {
    const a = await checkoutSignup({ name: "Mesma Empresa", taxId: "12345678000199", email: "a1@emp.com", password: "SenhaForte123", produto: "margot", tier: "pro", ...validCard })
    const b = await checkoutSignup({ name: "Mesma Empresa", taxId: "12345678000199", email: "b2@emp.com", password: "SenhaForte123", produto: "margot", tier: "pro", ...validCard })
    expect(a.tenantId).not.toBe(b.tenantId)
    const slugs = await raw<{ slug: string }[]>`SELECT slug FROM public.tenants WHERE name='Mesma Empresa' ORDER BY slug`
    expect(slugs.length).toBe(2)
    expect(slugs[0].slug).not.toBe(slugs[1].slug) // slug único (sufixado)
  })

  it("falha no provedor (cartão/Asaas) faz ROLLBACK — não deixa conta órfã", async () => {
    class FailingProvider extends FakeProvider {
      async createCardSubscription(): Promise<{ id: string; status: string }> {
        throw new Error("cartão recusado")
      }
    }
    setPaymentProvider(new FailingProvider())
    await expect(
      checkoutSignup({ name: "Órfã Teste", taxId: "12345678000199", email: "orfa@x.com", password: "SenhaForte123", produto: "margot", tier: "pro", ...validCard }),
    ).rejects.toThrow(/cartão recusado/)
    // conta desfeita: nem usuário, nem tenant sobraram
    const [{ nu }] = await raw<{ nu: number }[]>`SELECT count(*)::int AS nu FROM public.users WHERE email='orfa@x.com'`
    const [{ nt }] = await raw<{ nt: number }[]>`SELECT count(*)::int AS nt FROM public.tenants WHERE name='Órfã Teste'`
    expect(nu).toBe(0)
    expect(nt).toBe(0)
    setPaymentProvider(new FakeProvider()) // restaura p/ os próximos testes
  })

  it("o fechamento mensal NÃO sobrescreve a fatura de ativação já paga", async () => {
    const { closeTenantInvoice } = await import("@/lib/billing/close")
    // Reusa o tenant do 1º teste (fatura 'paid' com total 700).
    const [tenant] = await raw<{ tenant_id: string; period: string }[]>`
      SELECT tenant_id, period FROM public.invoices WHERE status='paid' LIMIT 1`
    const before = (await raw<{ total_brl: string; status: string }[]>`
      SELECT total_brl, status FROM public.invoices WHERE tenant_id=${tenant.tenant_id}::uuid AND period=${tenant.period}`)[0]
    const { total } = await closeTenantInvoice(tenant.tenant_id, tenant.period)
    const after = (await raw<{ total_brl: string; status: string }[]>`
      SELECT total_brl, status FROM public.invoices WHERE tenant_id=${tenant.tenant_id}::uuid AND period=${tenant.period}`)[0]
    // total e status intactos (não recomputou nem virou 'issued')
    expect(total).toBe(Number(before.total_brl))
    expect(after.status).toBe("paid")
    expect(after.total_brl).toBe(before.total_brl)
  })
})
