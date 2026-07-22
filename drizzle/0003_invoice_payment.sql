-- Campos de pagamento na fatura: id da cobrança no provedor, link de pagamento
-- (página Pix/boleto), vencimento e quando foi paga. Status ganha 'overdue'.
--
-- ALTER TYPE ADD VALUE roda em transação no PG12+ desde que o valor novo não seja
-- usado na mesma transação (o migrate roda cada arquivo numa tx). Quem usa
-- 'overdue' é o webhook, em outra conexão — ok.
ALTER TYPE "invoice_status" ADD VALUE IF NOT EXISTS 'overdue';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS provider_charge_id text,
  ADD COLUMN IF NOT EXISTS payment_url         text,
  ADD COLUMN IF NOT EXISTS due_date            date,
  ADD COLUMN IF NOT EXISTS paid_at             timestamptz;
