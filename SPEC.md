# SPEC — sapienza-core

Control plane **+ console operacional único** da plataforma Sapienza SaaS. Único
dono do schema `public`; provisiona os schemas de tenant; agrega uso e fatura;
emite identidade (auth) para os produtos.

## Topologia da plataforma

| Repo / módulo | Papel | Dono de qual dado | Deploy |
|---|---|---|---|
| `sapienza-core` (este) | Control plane + console (Next.js) | schema `public` + provisioning de schema de tenant | serviço Coolify |
| `sapienza-margot` | Data plane (Margot, WhatsApp — Go) | suas tabelas em cada `tenant_<id>` | serviço Coolify |
| `sapienza-motor` | Data plane (conteúdo — TypeScript) | suas tabelas no mesmo `tenant_<id>` | serviço Coolify |
| `sapienza-kit` | Go module privado | (código) tenancy, gating, contratos | importado pelos produtos Go |

## Regras de ouro

1. Um Postgres. `public` = control plane; `tenant_<id>` = schema por tenant (2 produtos coabitam).
2. **Só o core escreve em `public`.** Produtos só leem.
3. Cada produto é dono só das suas tabelas no schema do tenant e roda suas migrations.
4. Console único no core; um login mostra só os produtos assinados.
5. Preço/tier/regra vêm de `config/pricing.yaml`; nunca chumbado.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4, shadcn (new-york), pnpm.
- Drizzle ORM + postgres-js (Postgres).
- NextAuth v5 (Credentials/JWT), `sessionVersion` p/ invalidação.
- Deploy Coolify (não Vercel): `images.unoptimized`.
- Seedado a partir de `../spa-sapienza` (ver `../INVENTORY.md`).

## Schema `public` (core é o único dono)

`tenants`, `users`, `memberships` (user↔tenant↔role: `owner|admin|member`), `plans`
(materializada de `pricing.yaml`), `subscriptions` (tenant↔produto↔tier↔status↔ciclo +
Degrau 13), `usage_counters` (tenant, produto, período, métrica, count), `invoices`,
`audit_log` (control-plane), `product_endpoints` (tenant×produto → api_url + segredo
AES), `event_outbox` (id, type, tenant_id, produto, payload jsonb, created_at) com
`pg_notify` no insert. Migrations em `drizzle/` (control).

## `config/pricing.yaml` — fonte única

Materializa currency/setup(+degrau_13)/produtos(margot,motor: tiers, incluso, canais,
excedente, regras)/combo_sistema_sapienza/portas_pagamento. Loader tipado (zod) valida
no boot e **faz upsert em `plans`** para os produtos Go lerem via kit.

- **Degrau 13**: mês ≥ 13 da assinatura → mensalidade cai ao piso.

## Provisioning (via eventos)

Ao ativar assinatura (transação): insere `subscription` → `CREATE SCHEMA tenant_<id>`
(vazio; core **não** cria tabelas de produto) → grava `event_outbox`
(`TenantProvisioned` + `SubscriptionActivated{produto}`). Produtos escutam e aplicam
suas migrations de tenant (validado no PROMPT B).

## Billing & medição

Produtos reportam `UsageRecorded` (outbox) → core agrega em `usage_counters`.
Fechamento mensal: `invoice = mensalidade_tier + max(0, count-incluso) *
excedente_unitario`, respeitando Degrau 13. Gating **soft** por padrão (fatura
excedente); flag `hard_cap` por plano bloqueia. Emite `TierExceeded`/`InvoiceIssued`.

## Auth multiusuário

Email+senha (argon2id/bcrypt), convite magic-link, roles owner/admin/member, um
usuário em múltiplos tenants (troca de contexto via cookie `active_tenant`). Core
emite **JWT curto** para os produtos (validado pelo kit). Superadmin Sapienza vê todos
os tenants. **Sem Redis** (sessão NextAuth JWT stateless; eventos em Postgres).

## Console único

Login → resolve tenant(s) → mostra só produtos assinados (lê `subscriptions`). Áreas:
uso vs tier, faturas, gestão de usuários do tenant, troca de tenant, visão super-admin
(Sapienza). Para operar produto, chama a API do produto (padrão BFF). Reusa o design
system do `spa-sapienza` (Bricolage Grotesque + IBM Plex Sans/Mono, tokens OKLCH
petróleo/tinta, logo `logo-sapienza.png`).

## Não-objetivos (PROMPT B / futuros)

- Margot (WhatsApp Meta Cloud API) e Motor (state machine de conteúdo, TS).
- Redis. Operação real dos motores no console (só cards/uso/billing por ora).

## Aceite

Ver `../INVENTORY.md` e o plano PROMPT A. Resumo: um Postgres; `public` só escrito
pelo core; ativar assinatura provisiona schema + eventos; console mostra só produtos
assinados; billing/Degrau 13/gating corretos vs `pricing.yaml`; isolamento entre
tenants comprovado; sobe no docker-compose.
