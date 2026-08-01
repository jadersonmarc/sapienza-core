-- Histórico do assistente de métricas (control plane; o core é dono do public).
-- Escopado por tenant_id + user_id em TODA query (lib/insights/store.ts).
CREATE TABLE IF NOT EXISTS "assistant_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "assistant_conversations_owner_idx"
  ON "assistant_conversations" ("tenant_id", "user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "assistant_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "assistant_messages_conv_idx"
  ON "assistant_messages" ("conversation_id", "created_at");
