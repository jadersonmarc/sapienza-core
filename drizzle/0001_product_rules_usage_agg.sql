-- Pré-requisitos p/ os data planes (PROMPT B / Margot):
--  1) product_rules: regras de produto do pricing.yaml (ex.: handoff_max_mensagens),
--     lidas read-only pelos produtos via kit — nunca chumbadas.
--  2) agregação de uso: trigger que consome UsageRecorded do outbox e incrementa
--     usage_counters, mantendo "só o core escreve nas tabelas de estado de public".

CREATE TABLE "product_rules" (
  "produto" "produto" PRIMARY KEY,
  "rules" jsonb NOT NULL DEFAULT '{}'
);

-- Aggrega UsageRecorded -> usage_counters. O produto só faz APPEND no outbox;
-- a escrita em usage_counters (estado) acontece aqui, no core (via trigger).
CREATE OR REPLACE FUNCTION aggregate_usage_recorded() RETURNS trigger AS $$
DECLARE
  v_metric text;
  v_period text;
  v_count  int;
BEGIN
  IF NEW.type <> 'UsageRecorded' THEN
    RETURN NEW;
  END IF;
  v_metric := NEW.payload->>'metric';
  v_period := NEW.payload->>'period';
  v_count  := COALESCE((NEW.payload->>'count')::int, 0);
  IF NEW.produto IS NULL OR v_metric IS NULL OR v_period IS NULL THEN
    RETURN NEW; -- payload incompleto: ignora com segurança
  END IF;

  INSERT INTO public.usage_counters (tenant_id, produto, period, metric, count, updated_at)
  VALUES (NEW.tenant_id, NEW.produto::produto, v_period, v_metric, v_count, now())
  ON CONFLICT (tenant_id, produto, period, metric)
  DO UPDATE SET count = public.usage_counters.count + EXCLUDED.count, updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_outbox_aggregate_usage
AFTER INSERT ON "event_outbox"
FOR EACH ROW EXECUTE FUNCTION aggregate_usage_recorded();
