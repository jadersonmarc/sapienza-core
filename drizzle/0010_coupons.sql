-- Cupons de desconto (control plane; o core é dono do public). O cupom altera
-- SÓ o preço: o plano contratado, os hard caps de uso e os limites de assento
-- seguem os do plano. O Asaas não tem cupom nativo em assinatura — o desconto é
-- calculado aqui e a recorrência do Asaas recebe o valor JÁ líquido.
CREATE TABLE IF NOT EXISTS "coupons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Guardado normalizado em MAIÚSCULAS; comparação case-insensitive via upper().
  "code" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('percentual', 'fixo')),
  -- percentual: 0..100 (%); fixo: BRL abatido da mensalidade.
  "value" numeric(12, 2) NOT NULL CHECK ("value" >= 0),
  -- Escopo: global (qualquer plano), produto (produto+tier específico) ou combo
  -- (combo de um tier). scope_produto só p/ 'produto'; scope_tier p/ 'produto'/'combo'.
  "scope_kind" text NOT NULL CHECK ("scope_kind" IN ('global', 'produto', 'combo')),
  "scope_produto" produto,
  "scope_tier" text,
  "redeem_by" date,                 -- data limite p/ RESGATE (null = sem limite)
  "max_redemptions" integer,        -- null = ilimitado
  "redemption_count" integer NOT NULL DEFAULT 0,
  "duration_months" integer,        -- null = enquanto a assinatura viver
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  -- Coerência do escopo: produto exige scope_produto+scope_tier; combo exige
  -- scope_tier (sem produto); global não usa nenhum.
  CONSTRAINT "coupons_scope_ck" CHECK (
    ("scope_kind" = 'global'  AND "scope_produto" IS NULL     AND "scope_tier" IS NULL)
 OR ("scope_kind" = 'produto' AND "scope_produto" IS NOT NULL AND "scope_tier" IS NOT NULL)
 OR ("scope_kind" = 'combo'   AND "scope_produto" IS NULL     AND "scope_tier" IS NOT NULL)
  )
);
-- Unicidade case-insensitive do código.
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_idx" ON "coupons" (upper("code"));

-- Resgates: UM registro por assinatura (recorrência Asaas), com início e fim do
-- desconto calculados no ato da concessão. É o que dá atribuição depois
-- (revendedor, campanha). produto = 'margot' | 'motor' | 'combo' (alvo comercial).
CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "coupon_id" uuid NOT NULL REFERENCES "coupons"("id") ON DELETE RESTRICT,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  -- Recorrência do Asaas cujo valor foi descontado (a mesma p/ combo margot+motor).
  "provider_sub_id" text,
  "produto" text NOT NULL,
  "tier" text NOT NULL,
  "base_value" numeric(12, 2) NOT NULL,     -- preço de tabela (pricing.yaml → plans)
  "discount_amount" numeric(12, 2) NOT NULL,
  "net_value" numeric(12, 2) NOT NULL,      -- valor enviado ao Asaas
  "starts_on" date NOT NULL,
  "ends_on" date,                            -- null = enquanto a assinatura viver
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'expired', 'revoked')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "coupon_redemptions_coupon_idx" ON "coupon_redemptions" ("coupon_id");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_tenant_idx" ON "coupon_redemptions" ("tenant_id");
-- Não empilha cupom: no máximo UM resgate ativo por recorrência do Asaas. Também
-- torna a expiração idempotente (só há um alvo ativo por assinatura).
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_active_sub_idx"
  ON "coupon_redemptions" ("provider_sub_id")
  WHERE "status" = 'active' AND "provider_sub_id" IS NOT NULL;
-- Varredura da expiração: resgates ativos com fim vencido.
CREATE INDEX IF NOT EXISTS "coupon_redemptions_expiry_idx"
  ON "coupon_redemptions" ("ends_on")
  WHERE "status" = 'active';
