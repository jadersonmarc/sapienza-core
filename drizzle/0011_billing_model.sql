-- Modelo comercial: anual (contrato 12m pago mensal, fidelidade, implantação
-- isenta) vs mensal (sem fidelidade, implantação = 1 mensalidade na adesão).
-- Muda só PREÇO e PRAZO — limites de IA/assento/canais são idênticos.
CREATE TYPE "billing_model_kind" AS ENUM ('anual', 'mensal');

-- ── plans: preço por MODELO (limites iguais nos dois) ────────────────────────
-- PK passa a (produto, tier, model). As linhas atuais viram 'anual'; o
-- pricing:sync materializa também as 'mensal'. Os produtos Go leem plans só para
-- LIMITES (incluso/canais) — que não mudam por modelo (usam LIMIT 1).
ALTER TABLE "plans" ADD COLUMN "model" "billing_model_kind" NOT NULL DEFAULT 'anual';
ALTER TABLE "plans" DROP CONSTRAINT "plans_pkey";
ALTER TABLE "plans" ADD PRIMARY KEY ("produto", "tier", "model");

-- ── subscriptions: modelo + último valor setado na recorrência do Asaas ──────
-- recurrence_value é a base de idempotência do cron de reconciliação (só chama o
-- Asaas quando o valor esperado diverge do já setado).
ALTER TABLE "subscriptions" ADD COLUMN "billing_model" "billing_model_kind" NOT NULL DEFAULT 'anual';
ALTER TABLE "subscriptions" ADD COLUMN "recurrence_value" numeric(12, 2);

-- ── coupons: modelo permitido; cupom NÃO tem mais duração própria ────────────
-- A vigência do desconto = vigência do termo da assinatura (anual = 12m; mensal
-- = indefinido). Fixo só pode ser resgatado no anual (validado na aplicação).
ALTER TABLE "coupons" ADD COLUMN "billing_model" text NOT NULL DEFAULT 'ambos'
  CHECK ("billing_model" IN ('anual', 'mensal', 'ambos'));
ALTER TABLE "coupons" DROP COLUMN "duration_months";

-- ── coupon_redemptions: modelo da assinatura no resgate (atribuição) ─────────
ALTER TABLE "coupon_redemptions" ADD COLUMN "billing_model" "billing_model_kind" NOT NULL DEFAULT 'anual';
