import { eq } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { paymentProvider } from "@/lib/payments/asaas"

export type BillingIdentity = {
  legalName: string
  taxId: string
  billingEmail: string
  asaasCustomerId: string | null
}

/** Identidade de cobrança atual do tenant (campos vazios se ainda não preenchida). */
export async function getBillingIdentity(tenantId: string): Promise<BillingIdentity> {
  const [t] = await db
    .select({
      legalName: schema.tenants.legalName,
      taxId: schema.tenants.taxId,
      billingEmail: schema.tenants.billingEmail,
      asaasCustomerId: schema.tenants.asaasCustomerId,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
  return {
    legalName: t?.legalName ?? "",
    taxId: t?.taxId ?? "",
    billingEmail: t?.billingEmail ?? "",
    asaasCustomerId: t?.asaasCustomerId ?? null,
  }
}

/**
 * Grava a identidade de cobrança e cria/atualiza o cliente no provedor de
 * pagamento, guardando o id. Sem isso não há como emitir Pix/boleto.
 */
export async function saveBillingIdentity(
  tenantId: string,
  input: { legalName: string; taxId: string; billingEmail: string },
): Promise<{ customerCreated: boolean }> {
  const legalName = input.legalName.trim()
  const taxId = input.taxId.replace(/\D/g, "") // só dígitos
  const billingEmail = input.billingEmail.trim()
  if (!legalName) throw new Error("razão social / nome é obrigatório")
  if (taxId.length !== 11 && taxId.length !== 14) throw new Error("CPF (11) ou CNPJ (14) inválido")
  if (!billingEmail.includes("@")) throw new Error("e-mail de cobrança inválido")

  const current = await getBillingIdentity(tenantId)

  // Cria/atualiza no provedor (se configurado). Reusa o customer id existente.
  let asaasCustomerId = current.asaasCustomerId
  let customerCreated = false
  const provider = paymentProvider()
  if (provider.configured()) {
    const { id } = await provider.upsertCustomer({ name: legalName, taxId, email: billingEmail })
    asaasCustomerId = id
    customerCreated = true
  }

  await db
    .update(schema.tenants)
    .set({ legalName, taxId, billingEmail, asaasCustomerId, updatedAt: new Date() })
    .where(eq(schema.tenants.id, tenantId))

  return { customerCreated }
}
