import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  numeric,
  bigserial,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core"

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
export const invoiceStatus = pgEnum("invoice_status", ["open", "issued", "paid", "void"])

// ── tenants (identidade canônica do cliente na plataforma) ───────────────────
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

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
  metric: text("metric").notNull(), // conversa|peca
  mensal: numeric("mensal", { precision: 12, scale: 2 }).notNull(),
  incluso: integer("incluso").notNull(),
  canais: integer("canais"), // motor: canais inclusos; margot: null
  excedenteUnitario: numeric("excedente_unitario", { precision: 12, scale: 2 }).notNull(),
  // Piso da mensalidade (Degrau 13): menor `mensal` do produto.
  piso: numeric("piso", { precision: 12, scale: 2 }).notNull(),
}, (t) => [primaryKey({ columns: [t.produto, t.tier] })])

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
  // Degrau 13: mês >= 13 desde activatedAt → mensalidade cai ao piso.
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  // Gating: soft (default) fatura excedente; hard bloqueia ao atingir o incluso.
  hardCap: boolean("hard_cap").notNull().default(false),
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
