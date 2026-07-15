-- Control-plane schema (public). Only sapienza-core writes here.
-- Generated intent mirrors lib/db/schema.ts; kept hand-authored so the
-- event_outbox NOTIFY trigger and the `bus` cursor schema live alongside it.

CREATE TYPE "membership_role" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "produto" AS ENUM ('margot', 'motor');
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'canceled');
CREATE TYPE "billing_cycle" AS ENUM ('mensal');
CREATE TYPE "invoice_status" AS ENUM ('open', 'issued', 'paid', 'void');

CREATE TABLE "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" ("slug");

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text,
  "is_superadmin" boolean NOT NULL DEFAULT false,
  "session_version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "role" "membership_role" NOT NULL DEFAULT 'member',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "memberships_user_tenant_idx" ON "memberships" ("user_id", "tenant_id");
CREATE INDEX "memberships_user_idx" ON "memberships" ("user_id");
CREATE INDEX "memberships_tenant_idx" ON "memberships" ("tenant_id");

CREATE TABLE "plans" (
  "produto" "produto" NOT NULL,
  "tier" text NOT NULL,
  "metric" text NOT NULL,
  "mensal" numeric(12,2) NOT NULL,
  "incluso" integer NOT NULL,
  "canais" integer,
  "excedente_unitario" numeric(12,2) NOT NULL,
  "piso" numeric(12,2) NOT NULL,
  PRIMARY KEY ("produto", "tier")
);

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "produto" "produto" NOT NULL,
  "tier" text NOT NULL,
  "status" "subscription_status" NOT NULL DEFAULT 'active',
  "cycle" "billing_cycle" NOT NULL DEFAULT 'mensal',
  "activated_at" timestamptz NOT NULL DEFAULT now(),
  "hard_cap" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "subscriptions_tenant_produto_idx" ON "subscriptions" ("tenant_id", "produto");
CREATE INDEX "subscriptions_tenant_idx" ON "subscriptions" ("tenant_id");

CREATE TABLE "usage_counters" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "produto" "produto" NOT NULL,
  "period" text NOT NULL,
  "metric" text NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenant_id", "produto", "period", "metric")
);

CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period" text NOT NULL,
  "status" "invoice_status" NOT NULL DEFAULT 'issued',
  "lines" jsonb NOT NULL DEFAULT '[]',
  "total_brl" numeric(12,2) NOT NULL,
  "issued_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "invoices_tenant_period_idx" ON "invoices" ("tenant_id", "period");

CREATE TABLE "product_endpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "produto" "produto" NOT NULL,
  "api_url" text NOT NULL,
  "secret_enc" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "product_endpoints_tenant_produto_idx" ON "product_endpoints" ("tenant_id", "produto");

CREATE TABLE "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" ("tenant_id");

CREATE TABLE "event_outbox" (
  "id" bigserial PRIMARY KEY,
  "type" text NOT NULL,
  "tenant_id" uuid NOT NULL,
  "produto" text,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- NOTIFY on every new event so consumers (Go products via kit) wake promptly.
CREATE OR REPLACE FUNCTION notify_event_outbox() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('sapienza_events', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_outbox_notify
AFTER INSERT ON "event_outbox"
FOR EACH ROW EXECUTE FUNCTION notify_event_outbox();

-- Per-consumer cursors live outside public so products never write to public.
CREATE SCHEMA IF NOT EXISTS "bus";
CREATE TABLE "bus"."event_cursors" (
  "consumer" text PRIMARY KEY,
  "last_id" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
