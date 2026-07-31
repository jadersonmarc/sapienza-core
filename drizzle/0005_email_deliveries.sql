-- Dedupe do consumer de e-mail (`mailer`) que drena o event_outbox. Grava o
-- event_id ANTES de enviar (na mesma tx): reprocessar o mesmo evento não dispara
-- e-mail duplicado (entrega at-least-once → efeito once). Ver lib/email/consumer.ts.
CREATE TABLE IF NOT EXISTS "email_deliveries" (
  "event_id" bigint PRIMARY KEY,
  "sent_at" timestamptz NOT NULL DEFAULT now()
);
