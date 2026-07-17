# sapienza-core

**Control plane + console operacional único** da plataforma Sapienza SaaS. É o único dono do
schema `public` do Postgres: emite identidade, provisiona os schemas de tenant, agrega uso e
fatura. Os produtos (data planes) leem `public`, nunca escrevem — exceto o append no
`event_outbox`.

Evoluído a partir de `../spa-sapienza`, com a mesma stack e o mesmo design system.

## Como se encaixa

| Repo | Papel | Dono de qual dado | Deploy |
|---|---|---|---|
| **`sapienza-core`** (este) | Control plane + console (Next.js) | schema `public` + provisioning dos schemas de tenant | serviço Coolify |
| `sapienza-margot` | Data plane WhatsApp (Go) | schema `margot` + suas tabelas em `tenant_<id>` | serviço Coolify |
| `sapienza-motor` | Data plane conteúdo (TypeScript) | suas tabelas no mesmo `tenant_<id>` | serviço Coolify |
| `sapienza-kit` | Módulo Go (lib) | — (tenancy, gating, eventos) | importado pelo Margot |

**Um único Postgres.** `public` = control plane; `tenant_<id>` = um schema por tenant, onde os
dois produtos coabitam com tabelas distintas. Sem Redis: sessão é JWT stateless e os eventos
vivem no Postgres (`event_outbox` + `pg_notify`).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (tokens OKLCH) · shadcn/ui
(New York) · Drizzle ORM + postgres-js · NextAuth v5 (Credentials/JWT) · pnpm · vitest ·
deploy **Coolify** (não Vercel → `images.unoptimized`).

## Arquitetura

```
config/pricing.yaml     fonte única de preço/tier/regra — nada de preço no código
lib/pricing/load.ts     loader zod; scripts/pricing-sync.ts materializa em `plans`/`product_rules`
lib/db/schema.ts        Drizzle: as 11 tabelas do control plane
drizzle/*.sql           migrations à mão (acomodam triggers que o drizzle-kit não gera)
lib/provisioning/       activateSubscription: upsert subscription + CREATE SCHEMA + eventos, 1 tx
lib/events/emit.ts      append no event_outbox dentro da tx do chamador (outbox transacional)
lib/billing/compute.ts  cálculo puro: overage, Degrau 13, monthIndex
lib/billing/close.ts    fechamento do período → invoices + evento InvoiceIssued
lib/auth/product-jwt.ts emite o JWT curto (HS256, 300s) que os produtos validam
lib/{margot,motor}/     clients BFF: o console fala com a API do produto, server-side
app/(console)/          console por tenant; app/(console)/super/ = visão Sapienza
```

**A agregação de uso é um trigger SQL, não código TS** (`drizzle/0001_product_rules_usage_agg.sql`):
`AFTER INSERT ON event_outbox` filtra `UsageRecorded` e faz upsert somando em `usage_counters`.
O produto só faz append no outbox; a escrita de estado acontece aqui, no core.

### Schema `public`

`tenants` · `users` · `memberships` (user×tenant×role `owner|admin|member`) · `plans` (PK
`produto+tier`, materializada do YAML) · `product_rules` · `subscriptions` (`activated_at`
alimenta o Degrau 13; `hard_cap`) · `usage_counters` · `invoices` · `audit_log` ·
`product_endpoints` · `event_outbox`. Os cursores dos consumidores ficam em `bus.event_cursors`,
fora de `public` — coerente com "só o core escreve em `public`".

### Billing

`invoice = mensalidade_do_tier + max(0, count - incluso) × excedente_unitario`, com
**Degrau 13**: a partir do 13º mês da assinatura a mensalidade cai ao piso (o menor `mensal`
do produto). Fecha via `pnpm billing:close` ou `POST /api/cron/billing-close`.

## Regras de ouro

1. **Só o core escreve em `public`.** Produtos leem; a única escrita sancionada deles é o
   append no `event_outbox`.
2. **Preço nunca chumbado** — vem de `pricing.yaml` → `plans`.
3. Cada produto é dono só das suas tabelas no schema do tenant e roda as próprias migrations.
   O core cria o schema **vazio**.
4. Console único; um login mostra só os produtos assinados.
5. **Tokens semânticos** sempre (`bg-background`, `text-foreground`…), nunca cor fixa. AA nos
   dois temas.

## Desenvolvimento

```bash
pnpm install
cp .env.example .env
pnpm db:migrate     # cria o schema public (idempotente, rastreado em public._migrations)
pnpm pricing:sync   # valida config/pricing.yaml e materializa `plans` + `product_rules`
pnpm db:seed --email voce@exemplo.com --password ... --superadmin
pnpm dev            # http://localhost:3000
```

| Comando | O que faz |
|---|---|
| `pnpm test` | vitest |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:migrate` | aplica `drizzle/*.sql` em ordem, cada um numa transação |
| `pnpm db:seed` | cria/atualiza usuário (`--superadmin`, `--tenant`, `--role`) |
| `pnpm pricing:sync` | YAML → `plans`/`product_rules` (upsert idempotente) |
| `pnpm pricing:public` | projeta o JSON público de preços p/ o site (ver nota abaixo) |
| `pnpm billing:close` | fechamento mensal → `invoices` (`--period YYYY-MM`) |

> **Os testes de integração pulam em silêncio sem `TEST_DATABASE_URL`.** `pnpm test` sem essa
> variável passa verde cobrindo só lógica pura — os que tocam o banco (trigger de uso, seats)
> nem aparecem. Para rodar a suíte de verdade:
> ```bash
> docker run -d --name pg-test -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
> TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres pnpm test
> ```
> Esses testes **dropam e recriam o schema `public`** — nunca aponte para um banco real.

> `pnpm pricing:public` escreve por default **fora deste repo** (`../spa-sapienza`); a sincronia
> com o site é manual. Por padrão omite setup/combo/portas/excedente (só com `--full`).

## Variáveis de ambiente

| Var | Obrigatória | Observação |
|---|:-:|---|
| `DATABASE_URL` | ✅ | o MESMO Postgres dos produtos |
| `AUTH_SECRET` | ✅ | NextAuth — `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | ✅ fora do Vercel | `true` no Coolify |
| `PRODUCT_JWT_SECRET` | ✅ | **o MESMO valor no core, margot e motor**; o core emite, os produtos validam |
| `WEBHOOK_SECRET` | ✅ p/ o cron | sem ele `/api/cron/*` nega tudo (fail-closed) — e o faturamento nunca roda |
| `MARGOT_API_URL` / `MOTOR_API_URL` | p/ operar produtos | BFF do console → API do produto |
| `AGENT_TOKEN_ENC_KEY` | — | AES-256-GCM; hoje nenhum caminho ativo a lê |

## Deploy

Ver **[`DEPLOY.md`](./DEPLOY.md)** — guia completo da plataforma na VPS (Coolify). O boot já é
idempotente (`db:migrate && pricing:sync && start`), sem passo manual de migration.

Cron: `.github/workflows/billing-close.yml` (dia 1, 06:00 UTC) → `POST /api/cron/billing-close`.
Secrets do repo: `CORE_URL`, `WEBHOOK_SECRET`.

## Estado atual

O console cobre login, uso vs. tier, faturas, gestão de usuários (com gate de seats), troca de
tenant, visão superadmin (read-only) e a operação de Margot/Motor via BFF.

Ainda fora do console, por ora:

- **Criar tenant e ativar assinatura** — hoje são `pnpm db:seed --tenant` e
  `tsx scripts/e2e-activate.ts <tenant-uuid>`, rodados no terminal do container (ver `DEPLOY.md`).
- **Convite por e-mail e redefinição de senha** — o acesso de um novo membro ainda depende de o
  superadmin definir a senha via `pnpm db:seed`.

Ver também `SPEC.md` (arquitetura e regras), `CLAUDE.md`/`AGENTS.md` (convenções) e
`../INVENTORY.md`.
