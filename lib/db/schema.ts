import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  jsonb,
  boolean,
  integer,
  smallint,
  numeric,
  bigserial,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ── Control plane: schema `public`. O sapienza-core é o ÚNICO que escreve aqui.
// Produtos (data planes) só LEEM estas tabelas via kit. Ver SPEC.md / AGENTS.md.

// ── Enums ────────────────────────────────────────────────────────────────────
export const membershipRole = pgEnum("membership_role", ["owner", "admin", "member"])
export const produtoEnum = pgEnum("produto", ["margot", "motor"])
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
])
export const billingCycle = pgEnum("billing_cycle", ["mensal"])
// Modelo comercial: anual (contrato 12m, fidelidade) vs mensal (sem fidelidade).
export const billingModelKind = pgEnum("billing_model_kind", ["anual", "mensal"])
export const invoiceStatus = pgEnum("invoice_status", ["open", "issued", "paid", "void", "overdue"])

// ── tenants (identidade canônica do cliente na plataforma) ───────────────────
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  // Identidade de cobrança (para emitir Pix/boleto no provedor de pagamento).
  legalName: text("legal_name"),
  taxId: text("tax_id"), // CPF/CNPJ (só dígitos)
  billingEmail: text("billing_email"),
  asaasCustomerId: text("asaas_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("tenants_slug_idx").on(t.slug)])

// ── users (identidade; auth via NextAuth) ────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  // Equipe Sapienza: super-admin de plataforma (vê todos os tenants).
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  // Bump invalida sessões JWT antigas (após troca de senha).
  sessionVersion: integer("session_version").notNull().default(0),
  // Verificação de e-mail (soft): null = não confirmado. Não bloqueia acesso.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ── auth_tokens (reset de senha + verificação de e-mail) ─────────────────────
// Token aleatório guardado por HASH (sha256). Single-use (used_at) + expiração.
// Ver lib/auth/tokens.ts.
export const authTokens = pgTable("auth_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'password_reset' | 'email_verify'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("auth_tokens_user_idx").on(t.userId)])

// ── memberships (usuário ↔ tenant ↔ role) ────────────────────────────────────
export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  role: membershipRole("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("memberships_user_tenant_idx").on(t.userId, t.tenantId),
  index("memberships_user_idx").on(t.userId),
  index("memberships_tenant_idx").on(t.tenantId),
])

// ── plans (materializada de config/pricing.yaml via `pnpm pricing:sync`) ──────
export const plans = pgTable("plans", {
  produto: produtoEnum("produto").notNull(),
  tier: text("tier").notNull(), // start|pro|scale
  model: billingModelKind("model").notNull().default("anual"), // preço por modelo
  metric: text("metric").notNull(), // resposta|peca
  mensal: numeric("mensal", { precision: 12, scale: 2 }).notNull(),
  incluso: integer("incluso").notNull(),
  canais: integer("canais"), // motor: canais inclusos; margot: null
  excedenteUnitario: numeric("excedente_unitario", { precision: 12, scale: 2 }).notNull(),
  // Piso da mensalidade (Degrau 13): menor `mensal` anual do produto.
  piso: numeric("piso", { precision: 12, scale: 2 }).notNull(),
}, (t) => [primaryKey({ columns: [t.produto, t.tier, t.model] })])

// ── product_rules (regras de produto do pricing.yaml; lidas pelos data planes) ─
export const productRules = pgTable("product_rules", {
  produto: produtoEnum("produto").primaryKey(),
  // ex.: { handoff_max_mensagens: 15, janela_aprovacao_horas: 48, ... }
  rules: jsonb("rules").notNull().default({}),
})

// ── subscriptions (tenant ↔ produto ↔ tier ↔ status) ─────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  produto: produtoEnum("produto").notNull(),
  tier: text("tier").notNull(),
  status: subscriptionStatus("status").notNull().default("active"),
  cycle: billingCycle("cycle").notNull().default("mensal"),
  // Modelo comercial (anual|mensal). Último valor setado na recorrência do Asaas
  // (base de idempotência do cron de reconciliação).
  billingModel: billingModelKind("billing_model").notNull().default("anual"),
  recurrenceValue: numeric("recurrence_value", { precision: 12, scale: 2 }),
  // Degrau 13: mês >= 13 desde activatedAt → mensalidade cai ao piso.
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  // Gating: soft (default) fatura excedente; hard bloqueia ao atingir o incluso.
  hardCap: boolean("hard_cap").notNull().default(false),
  // Assinatura recorrente no cartão (Asaas) — usada para cancelar a cobrança.
  providerSubId: text("provider_sub_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subscriptions_tenant_produto_idx").on(t.tenantId, t.produto),
  index("subscriptions_tenant_idx").on(t.tenantId),
])

// ── usage_counters (agregado do UsageRecorded reportado pelos produtos) ───────
export const usageCounters = pgTable("usage_counters", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  produto: produtoEnum("produto").notNull(),
  period: text("period").notNull(), // "YYYY-MM"
  metric: text("metric").notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.produto, t.period, t.metric] })])

// ── invoices (fechamento mensal) ─────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  period: text("period").notNull(), // "YYYY-MM"
  status: invoiceStatus("status").notNull().default("issued"),
  // linhas: [{ produto, tier, mensal, incluso, count, excedente, subtotal }]
  lines: jsonb("lines").notNull().default([]),
  totalBrl: numeric("total_brl", { precision: 12, scale: 2 }).notNull(),
  // Pagamento (provedor): id da cobrança, link Pix/boleto, vencimento, pago em.
  providerChargeId: text("provider_charge_id"),
  paymentUrl: text("payment_url"),
  dueDate: date("due_date"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // Dunning (inadimplência): 0=nenhum, 1=venceu, 2=aviso de bloqueio, 3=bloqueado,
  // 4=cancelado. O cron de dunning só avança pra frente (idempotência). Ver
  // app/api/cron/dunning/route.ts.
  dunningStage: smallint("dunning_stage").notNull().default(0),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("invoices_tenant_period_idx").on(t.tenantId, t.period),
])

// ── product_endpoints (console→produto: URL + segredo AES por tenant×produto) ─
export const productEndpoints = pgTable("product_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  produto: produtoEnum("produto").notNull(),
  apiUrl: text("api_url").notNull(),
  // Segredo (ex.: token/credencial do produto) cifrado em repouso — lib/agent/crypto.ts.
  secretEnc: text("secret_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("product_endpoints_tenant_produto_idx").on(t.tenantId, t.produto)])

// ── audit_log (control-plane; distinto do audit editorial do Motor) ──────────
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_log_tenant_idx").on(t.tenantId)])

// ── event_outbox (barramento transacional; consumido por produtos via kit) ───
export const eventOutbox = pgTable("event_outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: text("type").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  produto: text("produto"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("event_outbox_id_idx").on(t.id)])

// ── checkout_attempts (rate-limit do checkout público; janela por IP+e-mail) ──
// O endpoint público cria tenant + tenta cobrança; sem barreira é superfície de
// fraude de cartão. Registra cada tentativa; lib/signup/rate-limit.ts conta na
// janela. Sem Redis (CLAUDE.md) → contagem em Postgres.
export const checkoutAttempts = pgTable("checkout_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ip: text("ip"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("checkout_attempts_ip_idx").on(t.ip, t.createdAt),
  index("checkout_attempts_email_idx").on(t.email, t.createdAt),
])

// ── email_deliveries (dedupe do consumer de e-mail; entrega at-least-once) ─────
// O consumer `mailer` drena o event_outbox e envia 1 e-mail por evento. Grava o
// event_id aqui ANTES de enviar (por transação): reprocessar o mesmo evento não
// dispara e-mail duplicado. Ver lib/email/consumer.ts.
export const emailDeliveries = pgTable("email_deliveries", {
  eventId: bigint("event_id", { mode: "number" }).primaryKey(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
})

// ── assistant chats (histórico do assistente de métricas; por tenant × usuário) ─
// Control-plane (o core é dono do public). Escopado por tenant_id + user_id em
// TODA query (lib/insights/store.ts) — não é schema-por-tenant.
export const assistantConversations = pgTable("assistant_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("assistant_conversations_owner_idx").on(t.tenantId, t.userId, t.updatedAt)])

export const assistantMessages = pgTable("assistant_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => assistantConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("assistant_messages_conv_idx").on(t.conversationId, t.createdAt)])

// ── coupons (cupom de desconto; o Asaas recebe o valor JÁ líquido) ────────────
// O cupom altera SÓ o preço — plano, hard caps de IA e limites de assento seguem
// os do plano. Código único case-insensitive (upper). Escopo global|produto|combo.
export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(), // normalizado em MAIÚSCULAS
  kind: text("kind").notNull(), // 'percentual' | 'fixo'
  value: numeric("value", { precision: 12, scale: 2 }).notNull(), // % ou BRL
  scopeKind: text("scope_kind").notNull(), // 'global' | 'produto' | 'combo'
  scopeProduto: produtoEnum("scope_produto"),
  scopeTier: text("scope_tier"),
  redeemBy: date("redeem_by"), // data limite p/ resgate (null = sem limite)
  maxRedemptions: integer("max_redemptions"), // null = ilimitado
  redemptionCount: integer("redemption_count").notNull().default(0),
  // Modelo(s) em que o cupom pode ser resgatado: 'anual' | 'mensal' | 'ambos'.
  // Cupom NÃO tem duração própria — a vigência = o termo da assinatura.
  billingModel: text("billing_model").notNull().default("ambos"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("coupons_code_idx").on(sql`upper(${t.code})`)])

// ── coupon_redemptions (um por assinatura/recorrência; atribuição + expiração) ─
export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "restrict" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  providerSubId: text("provider_sub_id"), // recorrência Asaas descontada
  produto: text("produto").notNull(), // 'margot' | 'motor' | 'combo'
  tier: text("tier").notNull(),
  billingModel: billingModelKind("billing_model").notNull().default("anual"),
  baseValue: numeric("base_value", { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull(),
  netValue: numeric("net_value", { precision: 12, scale: 2 }).notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"), // null = enquanto a assinatura viver
  status: text("status").notNull().default("active"), // 'active' | 'expired' | 'revoked'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [
  index("coupon_redemptions_coupon_idx").on(t.couponId),
  index("coupon_redemptions_tenant_idx").on(t.tenantId),
])
