# Deploy — Sapienza SaaS (Coolify)

Guia de deploy da plataforma. **Um único Postgres** (regra de ouro): `public` é o
control plane (core), `tenant_<id>` são os schemas dos produtos. Deploy em **Coolify**
(não Vercel) — todos os serviços sobem independentes contra o mesmo banco.

## Topologia

| Serviço | Repo | Papel | Porta |
|---|---|---|---|
| Postgres 16 | — | banco único (public + tenant_\<id\>) | 5432 |
| core | `sapienza-core` | control plane + console (dono do `public`) | 3000 |
| margot | `sapienza-margot` | data plane WhatsApp (Go) | 8081 |
| motor | `sapienza-motor` | data plane conteúdo (Next) | 3000 |

Ordem de boot: **Postgres → core → (margot, motor)**. O core migra o `public`; os
produtos aplicam só as suas migrations de tenant.

## Boot (já nos Dockerfiles)

- **core**: `db:migrate && pricing:sync && start` (idempotente).
- **motor**: `provision && start` (catch-up: aplica migrations de tenant p/ assinantes ativos + drena o outbox).
- **margot**: migra o control plane do produto + sobe a API.

## Variáveis de ambiente

Compartilhadas (o MESMO valor onde indicado):

| Var | core | margot | motor | Observação |
|---|:-:|:-:|:-:|---|
| `DATABASE_URL` | ✅ | ✅ | ✅ | MESMO Postgres |
| `PRODUCT_JWT_SECRET` | ✅ | ✅ | ✅ | **igual nos três** (core emite, produtos validam) |
| `WEBHOOK_SECRET` | ✅ | — | ✅ | secret dos crons (HTTP) |
| `AUTH_SECRET` | ✅ | — | — | NextAuth |
| `MOTOR_ENC_KEY` | — | — | ✅ | AES-256-GCM (32 bytes base64) das credenciais de canal |
| `MARGOT_API_URL` / `MOTOR_API_URL` | ✅ | — | — | BFF do console → produto |
| `ANTHROPIC_API_KEY` | — | ✅ | ✅ | IA (sem ela, motor cai no fallback; analyzers/generate-draft ficam 503) |
| `S3_*` (endpoint/bucket/keys/public_url) | — | — | ✅ | imagem on-brand pública (opcional; sem isso publica sem imagem) |

Credenciais de canal (Instagram/LinkedIn/Facebook/Twitter/Threads) **não são env** —
são fornecidas por tenant no setup e cifradas em `motor_channels`.

## Crons

Duas opções (documentadas em cada repo). **GitHub Actions** já incluído em
`.github/workflows/` — basta configurar os secrets do repo:

- core: `CORE_URL`, `WEBHOOK_SECRET` → `billing-close` (dia 1, mês anterior).
- motor: `MOTOR_URL`, `WEBHOOK_SECRET` → `publish-scheduled` (15min),
  `close-approval-window` (1h), `provision` (10min), `generate-draft` (seg/qua/sex).

Alternativa **Coolify scheduled tasks** (sem URL pública): rodar o comando no container,
ex. core `pnpm billing:close -- --period YYYY-MM`, ou `curl` em `localhost` com o secret.

## CI

Cada repo tem `.github/workflows/ci.yml` (Postgres efêmero como service):
core/motor = typecheck + (build) + testes; margot/kit = vet + build + `go test -p 1`.

## Verificação pós-deploy

Reproduz o `sapienza-motor/scripts/e2e.sh` contra o ambiente: ativar assinatura de um
tenant no console → confirmar migrations de tenant aplicadas → gerar/publicar → conferir
`usage_counters` e, no fim do mês, `billing:close` → fatura.
