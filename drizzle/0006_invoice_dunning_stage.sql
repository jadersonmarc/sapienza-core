-- Dunning (inadimplência): estágio da fatura vencida. 0=nenhum, 1=venceu,
-- 2=aviso de bloqueio, 3=bloqueado, 4=cancelado. O cron de dunning avança só
-- pra frente (idempotente). Ver app/api/cron/dunning/route.ts.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "dunning_stage" smallint NOT NULL DEFAULT 0;
