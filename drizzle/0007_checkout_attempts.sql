-- Rate-limit do checkout público (por IP + e-mail em janela). Sem Redis → conta
-- em Postgres. Ver lib/signup/rate-limit.ts.
CREATE TABLE IF NOT EXISTS "checkout_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ip" text,
  "email" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "checkout_attempts_ip_idx" ON "checkout_attempts" ("ip", "created_at");
CREATE INDEX IF NOT EXISTS "checkout_attempts_email_idx" ON "checkout_attempts" ("email", "created_at");
