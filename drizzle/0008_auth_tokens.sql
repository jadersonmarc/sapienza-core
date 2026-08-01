-- Verificação de e-mail (soft) + tokens de auth (reset de senha / verificação).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz;

-- Token aleatório guardado por HASH (sha256), single-use (used_at) + expiração.
CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "token_hash" text PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "auth_tokens_user_idx" ON "auth_tokens" ("user_id");
