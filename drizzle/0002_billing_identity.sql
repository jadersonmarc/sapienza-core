-- Identidade de cobrança do tenant. O provedor de pagamento (Asaas) exige
-- CPF/CNPJ + e-mail para criar o cliente e emitir Pix/boleto; asaas_customer_id
-- guarda o id do cliente lá. Preenchido no onboarding (owner/admin), antes da
-- primeira cobrança.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS legal_name        text,
  ADD COLUMN IF NOT EXISTS tax_id            text, -- CPF/CNPJ (só dígitos)
  ADD COLUMN IF NOT EXISTS billing_email     text,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text;
