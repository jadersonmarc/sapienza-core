-- Id da assinatura recorrente no provedor (Asaas) por assinatura, para poder
-- CANCELAR a cobrança recorrente no cartão quando a conta é cancelada/excluída.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provider_sub_id" text;
