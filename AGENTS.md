# AGENTS.md — sapienza-core

Convenções para agentes/dev trabalhando no control plane + console.

## Princípios

- **Único dono de `public`.** Toda escrita em `public` acontece aqui. Produtos só leem.
- **Provisioning é o core.** `CREATE SCHEMA tenant_<id>` (vazio) + eventos no outbox;
  o core **não** cria tabelas de produto.
- **Eventos = Postgres.** Escrever em `public.event_outbox` na **mesma transação** da
  mudança de estado (padrão outbox transacional). `pg_notify` acorda consumidores.
  Contrato de payload = JSON, espelhando os structs de `sapienza-kit/events`.
- **Preço fora do código.** `config/pricing.yaml` é a verdade; `pnpm pricing:sync`
  materializa em `plans`. Billing lê `plans`/`subscriptions`, nunca constantes.

## Schema `public` (Drizzle)

`tenants`, `users`, `memberships(owner|admin|member)`, `plans`, `subscriptions`
(+ `activated_at`, `piso_mensal`, `hard_cap` p/ Degrau 13/cap), `usage_counters`,
`invoices`, `audit_log`, `product_endpoints`, `event_outbox`. Migrations em `drizzle/`.

## Billing (Degrau 13)

`invoice = mensalidade_tier + max(0, count - incluso) * excedente_unitario`.
Se `mês_da_assinatura >= 13` → `mensalidade_tier = piso` do produto. `hard_cap` bloqueia
ao atingir o incluso; sem cap, soft (fatura excedente).

## Auth

NextAuth v5 (de `spa-sapienza`). Adicionar emissão de JWT curto p/ produtos
(`lib/auth/product-jwt.ts`), assinado com chave compartilhada que o kit Go valida.
Roles `owner|admin|member`; superadmin Sapienza vê todos os tenants.

## Estilo

- Tokens semânticos (nunca cor fixa). Dark/light AA. pt-BR.
- Reusar `lib/agent/crypto.ts` (AES-256-GCM) para segredos por-tenant.
- Não reintroduzir Redis.

## Testes (vitest)

- Loader de `pricing.yaml` valida e materializa `plans`.
- Billing: tier + excedente + Degrau 13 + soft/hard cap.
- Provisioning: ativar assinatura cria schema e grava outbox.
- (Isolamento entre tenants é coberto no `sapienza-kit`.)
