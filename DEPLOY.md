# Deploy — Sapienza SaaS na VPS (Hostinger + Coolify)

Caminho do zero até o primeiro cliente operando. Siga na ordem: cada passo assume o anterior.

**Regra de ouro: um único Postgres.** `public` é o control plane (core); `tenant_<id>` são os
schemas dos produtos. Os três serviços sobem **independentes** contra o mesmo banco — deploy de
um não derruba os outros.

| Serviço | Repo | Papel | Porta interna |
|---|---|---|---|
| Postgres 16 | — | banco único (`public` + `tenant_<id>`) | 5432 |
| core | `sapienza-core` | control plane + console | 3000 |
| margot | `sapienza-margot` | data plane WhatsApp (Go) | 8081 |
| motor | `sapienza-motor` | data plane conteúdo (Next) | 3000 |

Ordem de boot: **Postgres → core → (margot, motor)**. O core migra o `public`; os produtos
aplicam só as próprias migrations de tenant. Cada boot é idempotente — **não há passo manual de
migration**.

> ### Build Pack = **Dockerfile** nos três. Não use Nixpacks.
>
> O Coolify vem com **Nixpacks** por padrão, e ele **ignora o Dockerfile do repo** — gera um
> próprio. Isso quebra os três serviços, cada um de um jeito:
>
> - **margot**: o Nixpacks roda `go mod download`, que tenta resolver o `replace ../sapienza-kit`
>   e falha (`open /sapienza-kit/go.mod: no such file or directory`). O nosso Dockerfile compila
>   com `-mod=vendor` justamente para não buscar o kit: ele já está no `vendor/`.
> - **core e motor**: falham **em runtime, não no build** — pior de diagnosticar. O boot deles é
>   o `CMD` do Dockerfile (`db:migrate && pricing:sync && start` / `provision && start`); sem
>   ele o serviço sobe sem criar o `public`, sem materializar o `pricing.yaml` e sem aplicar as
>   migrations de tenant.
> - **todos**: o Nixpacks injeta as envs como `ARG`/`ENV` nas camadas da imagem, então
>   `PRODUCT_JWT_SECRET`, `MARGOT_ENC_KEY` e as chaves de API ficam legíveis num
>   `docker history`. Com o Dockerfile próprio, as envs só existem em runtime.
>
> Em cada aplicação: **Configuration → Build Pack → Dockerfile** → redeploy.

### E o `sapienza-kit`?

A plataforma tem **quatro** repos, mas só três serviços: o `sapienza-kit` **não é deployado**.
É uma biblioteca Go (multi-tenancy, gating, contrato de eventos, validação de JWT) que a Margot
importa e que vai **dentro do binário dela** — não tem `cmd/`, nem Dockerfile, nem porta, e não
deve virar serviço no Coolify. Procurá-lo na lista de aplicações é procurar o que não existe.

Ele está vendorizado no repo da Margot (`vendor/`), o que torna o build Docker hermético — o
Coolify não precisa de credencial para buscar um módulo Go privado. Duas consequências que
aparecem no dia a dia:

- **Mudou o kit? Rode `go mod vendor` na Margot e faça o deploy dela.** Com `vendor/` presente,
  o Go compila do vendor e ignora o `replace` local: sem esse passo a Margot roda o kit antigo
  em produção **e a CI passa verde**, porque compila o mesmo código velho.
- O kit não tem release nem versão para escolher no deploy. O que está em produção é o que foi
  vendorizado no commit da Margot que você subiu.

O Motor é TypeScript e **não** usa o kit: reimplementa a mesma cola em `lib/platform/*`. Por
isso uma regra de plataforma (ex.: como o cap é calculado) pode precisar de ajuste nos dois
lugares — kit para a Margot, `lib/platform` para o Motor.

---

## 0. Pré-requisitos

- VPS Hostinger com **Coolify** instalado (KVM 2 ou superior; o build do Next consome RAM).
- DNS dos três subdomínios apontando para o IP da VPS — ver **Domínios** abaixo.
- Evolution API já rodando (você já tem) — anote `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.
- Os repos no GitHub, na branch `master`. Só três viram aplicação no Coolify (core, margot,
  motor); o `sapienza-kit` é biblioteca e vai dentro da Margot — ver acima.
- **Opcional:** bucket R2/S3. Só é necessário se for publicar no Instagram ou Threads, que
  exigem imagem. Sem ele o Motor publica em blog/LinkedIn/X/Facebook normalmente.

### Domínios (DNS + Coolify)

São **duas** metades — as duas precisam estar certas, ou o domínio dá 404:

**1. DNS.** No painel onde o domínio é gerenciado (com VPS Hostinger, normalmente o **hPanel →
Domínios → Zona DNS**; confira os nameservers com `dig +short <domínio> NS`), crie um registro
**A** por subdomínio, todos apontando para o **IP da VPS** (hPanel → VPS → Overview mostra o IP):

| Tipo | Nome | Aponta para | TTL |
|---|---|---|---|
| A | `console` | `<IP-da-VPS>` | 300 |
| A | `margot` | `<IP-da-VPS>` | 300 |
| A | `motor` | `<IP-da-VPS>` | 300 |

O campo **Nome** é só o rótulo (`console`), não o domínio inteiro. O **valor** é só o IP — sem
porta, sem `http://`, sem espaço (um espaço colado junto vira "IPv4 inválido"). Confira a
propagação: `dig +short console.<domínio> A` deve devolver o IP.

**2. Coolify.** Em cada app, campo **Domains**, a URL pública com **https** (o Coolify emite o
Let's Encrypt): core → `https://console.<domínio>`, margot → `https://margot.<domínio>`, motor →
`https://motor.<domínio>`. Depois de setar, **redeploy a app** — o proxy só registra a rota no
deploy; sem isso ela responde 404 mesmo com o DNS certo.

## 1. Gere os segredos — uma vez, e guarde

```bash
openssl rand -base64 32   # AUTH_SECRET          (core)
openssl rand -base64 32   # PRODUCT_JWT_SECRET   (core + margot + motor: o MESMO valor)
openssl rand -base64 32   # WEBHOOK_SECRET       (core + motor: o MESMO valor)
openssl rand -base64 32   # MOTOR_ENC_KEY        (motor)
openssl rand -base64 32   # MARGOT_ENC_KEY       (margot)
openssl rand -base64 32   # EVOLUTION_WEBHOOK_SECRET (margot + config da Evolution)
```

Duas coisas que dão trabalho se erradas:

- **`PRODUCT_JWT_SECRET` precisa ser idêntico nos três serviços.** O core emite o JWT, os
  produtos validam. Diferente → todas as chamadas do console para os produtos dão 401.
- **`MOTOR_ENC_KEY` / `MARGOT_ENC_KEY` não podem ser perdidas nem trocadas depois.** Elas
  cifram as credenciais de canal dos clientes; trocar torna o que já está gravado ilegível.

## 2. Postgres

No Coolify: **New Resource → Database → PostgreSQL 16**. Nome sugerido: `sapienza-db`.

- **Não** publique a porta 5432 para a internet. Os serviços falam pela rede interna do Coolify.
- Anote a connection string interna — é o `DATABASE_URL` dos três serviços.
- Ative os backups automáticos agora, não depois. É o único lugar com estado.

## 3. core (primeiro — ele cria o `public`)

**New Resource → Application → GitHub → `sapienza-core`**, branch `master`, **Build Pack:
Dockerfile** (o default é Nixpacks — troque, ver aviso acima), domínio
`https://console.seudominio.com` (o Coolify emite o SSL).

Envs:

| Var | Valor |
|---|---|
| `DATABASE_URL` | a string interna do passo 2 |
| `AUTH_SECRET` | do passo 1 |
| `AUTH_TRUST_HOST` | `true` |
| `AUTH_URL` | `https://console.<seu-domínio>` — sem ele, o login redireciona para `localhost` depois de autenticar |
| `PRODUCT_JWT_SECRET` | do passo 1 |
| `WEBHOOK_SECRET` | do passo 1 |
| `MARGOT_API_URL` | `https://margot.<seu-domínio>` — a URL **pública** |
| `MOTOR_API_URL` | `https://motor.<seu-domínio>` — a URL **pública** |
| `ASAAS_API_KEY` / `ASAAS_BASE_URL` / `ASAAS_WEBHOOK_TOKEN` | pagamentos (Pix/boleto). **Sandbox** primeiro (`ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`); sem eles as faturas são calculadas mas não geram cobrança |
| `CHECKOUT_SECRET` | `openssl rand -base64 32`. Autoriza o checkout self-service do site (`POST /api/public/checkout`). **O mesmo valor** deve ir na app do site (`spa-sapienza`: `CHECKOUT_SECRET` + `CORE_CHECKOUT_URL=https://console.<seu-domínio>/api/public/checkout`). Sem ele a rota recusa tudo (401) |

> **Não use `http://margot:8081` / `http://motor:3000`.** Esses nomes de container só existem em
> docker-compose; no Coolify cada app é isolada e o container tem nome de UUID, então o core não
> resolve `motor` e o console dá **500** ("Não foi possível falar com o serviço do Motor"). Use a
> URL pública `https://…` (a API do produto já é pública e protegida pelo JWT curto do core). O
> core e o produto no mesmo servidor fazem hairpin pelo proxy — funciona no Coolify; se algum dia
> der timeout, o plano B é ligar as apps numa rede predefinida do Coolify e usar o nome real do
> container.

Deploy. O boot roda `db:migrate && pricing:sync && start`: cria o `public`, materializa o
`pricing.yaml` em `plans`/`product_rules` e sobe o console. Confirme que `https://console...`
mostra a tela de login.

## 4. margot

**Application → GitHub → `sapienza-margot`**, `master`, **Build Pack: Dockerfile** (com Nixpacks
o build quebra no `go mod download`), domínio `https://margot.seudominio.com`, porta **8081**.

> Nenhuma configuração para o `sapienza-kit`: ele já está no `vendor/` deste repo e é compilado
> junto (`go build -mod=vendor`, sem rede). O Coolify não precisa de acesso ao repo do kit.

| Var | Valor |
|---|---|
| `DATABASE_URL` | a mesma do core |
| `PRODUCT_JWT_SECRET` | **o mesmo do core** |
| `PORT` | `8081` |
| `MARGOT_ENC_KEY` | do passo 1 |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | da sua Evolution — a `_KEY` é a apikey **global** (envia E cria/gere instâncias) |
| `MARGOT_PUBLIC_URL` | `https://margot.<domínio>` — destino de webhook que a Margot registra no Evolution ao criar a instância |
| `EVOLUTION_WEBHOOK_SECRET` | do passo 1 (segredo global de fallback) |
| `ANTHROPIC_API_KEY` | sua chave (sem ela o bot só responde o fallback do tenant) |

**Onboarding do cliente é self-serve, por QR** — não precisa mexer no Manager do Evolution nem
configurar webhook à mão. No console, em **Margot → Configurar agente**, o owner/admin do tenant
clica **"Conectar WhatsApp"**: a Margot cria a instância no Evolution (nome derivado do tenant),
registra o webhook (`MARGOT_PUBLIC_URL` + `/webhook/evolution`) com um segredo próprio gerado na
hora, e mostra o **QR** no console. O cliente escaneia com o número **dedicado** e pronto.

`EVOLUTION_WEBHOOK_SECRET` é o segredo **global**, fallback para instâncias que ainda não têm o
seu. Vazio (e sem segredo de tenant) o webhook recusa tudo — fail-closed de propósito.

> **Dê a cada tenant um segredo próprio.** Com o global, quem o tiver consegue forjar um payload
> em nome de qualquer instância — injetando mensagem no schema daquele cliente e gastando seu
> orçamento de IA. Depois de conectar a instância do cliente (passo 6):
> ```bash
> curl -X POST https://margot.seudominio.com/api/v1/channel/rotate-webhook-secret \
>   -H "authorization: Bearer <JWT do tenant>"
> ```
> Devolve o segredo **uma única vez** — cole no header `apikey` do webhook daquela instância na
> Evolution. A partir daí só ele abre aquela instância; nem o global.

Verifique: `curl https://margot.seudominio.com/health`.

## 5. motor

**Application → GitHub → `sapienza-motor`**, `master`, **Build Pack: Dockerfile** (sem ele o
`provision` não roda no boot), domínio `https://motor.seudominio.com`, porta **3000**.

> **Health Check: aponte para `/health`.** O Motor é só API (sem página), então `GET /` responde
> **404** — o health check padrão do Coolify, que bate na raiz, marca o serviço como não-saudável
> e o domínio **não sobe**. Em **Configuration → Health Check**: path `/health`, porta `3000`.
> A rota devolve `ok` sem tocar no banco (é liveness). É o mesmo `/health` que a Margot já expõe.

| Var | Valor |
|---|---|
| `DATABASE_URL` | a mesma do core |
| `PRODUCT_JWT_SECRET` | **o mesmo do core** |
| `MOTOR_ENC_KEY` | do passo 1 |
| `WEBHOOK_SECRET` | **o mesmo do core** |
| `ANTHROPIC_API_KEY` | sua chave |
| `S3_*` | só se for usar Instagram/Threads (o conjunto completo: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`) |

O boot roda `provision && start`: aplica as migrations de tenant dos assinantes ativos e drena
o outbox.

> As credenciais de Instagram/LinkedIn/etc. **não são env** — o cliente as fornece no setup e
> elas ficam cifradas em `motor_channels`.

### Cota de geração (teto do seu custo de IA)

Gerar peça consome cota igual à de publicação do plano: **start 12 / pro 30 / scale 60 por mês**.
Ao acabar, criar peça responde **409** — é esperado, não é falha. Regenerar não consome esta
cota (segue com o limite de 2 por peça).

A cota é contada em `usage_counters` com `metric='geracao'` e **não entra na fatura** (o
fechamento só olha `metric='peca'`). Para ver o consumo do mês:

```sql
SELECT metric, count FROM usage_counters
 WHERE tenant_id = '<uuid>' AND produto = 'motor' AND period = to_char(now(), 'YYYY-MM');
```

> **O cron `generate-draft` come da mesma cota.** Ele roda seg/qua/sex (~13/mês), então num
> tenant **start** (cota 12) consome praticamente tudo e o cliente fica sem cota para gerar à
> mão. Nada quebra — o cron pula quem está sem cota, e isso aparece como `skipped` na resposta
> dele. Se incomodar, reduza a frequência em `sapienza-motor/.github/workflows/cron-generate-draft.yml`
> (ex.: `0 11 * * 1` = só segunda, ~4/mês). É mudança de cron, não de código.

## 6. Primeiro cliente

Criar tenant e ativar assinatura ainda **não têm UI** — são scripts, rodados no terminal do
container do core (Coolify → core → Terminal):

```bash
# 1. superadmin da Sapienza (só na primeira vez). O `--` é do pnpm: sem ele os
#    argumentos não chegam ao script.
pnpm db:seed -- --email voce@sapienza.com --password '<senha forte>' --superadmin

# 2. tenant do cliente + usuário owner (--tenant é o NOME; o slug é derivado dele)
pnpm db:seed -- --email cliente@empresa.com --password '<senha forte>' \
                --tenant "Empresa Cliente" --role owner

# 3. pegue o uuid do tenant
psql "$DATABASE_URL" -c "SELECT id, slug FROM tenants"

# 4. ative as assinaturas (cria o schema do tenant e dispara os eventos)
pnpm tsx scripts/e2e-activate.ts <tenant-uuid> --produto motor --tier pro
pnpm tsx scripts/e2e-activate.ts <tenant-uuid> --produto margot --tier pro
```

Tiers válidos: `start`, `pro`, `scale`.

O que acontece: o core grava a `subscription`, cria o schema `tenant_<id>` vazio e escreve
`TenantProvisioned` + `SubscriptionActivated` no outbox. Margot e Motor leem o outbox e aplicam
suas migrations — o Margot em segundos (poll de 5s), o Motor no cron `provision` ou no próximo
boot. Para não esperar:

```bash
curl -X POST https://motor.seudominio.com/api/cron/provision \
  -H "x-webhook-secret: $WEBHOOK_SECRET"
```

Confirme: `psql "$DATABASE_URL" -c "\dt tenant_*.*"` deve listar as tabelas dos dois produtos.
Logue no console com o usuário do cliente — devem aparecer só os produtos assinados.

## 7. Crons

Os workflows já existem nos repos. Configure os secrets no GitHub:

| Repo | Secrets | Jobs |
|---|---|---|
| `sapienza-core` | `CORE_URL`, `WEBHOOK_SECRET` | `billing-close` (dia 1, 06:00 UTC) |
| `sapienza-motor` | `MOTOR_URL`, `WEBHOOK_SECRET` | `publish-scheduled` (10min), `close-approval-window` (15min), `provision` (1h), `generate-draft` (seg/qua/sex) |

`CORE_URL` = `https://console.seudominio.com`, `MOTOR_URL` = `https://motor.seudominio.com`,
sem barra no fim.

**Teste o de billing agora, não no dia 1.** É o que gera receita e o que mais silenciosamente
falha:

```bash
curl -i -X POST https://console.seudominio.com/api/cron/billing-close \
  -H "x-webhook-secret: <WEBHOOK_SECRET>" \
  -H "content-type: application/json" -d '{"period":"2026-07"}'
```

Precisa responder **200** com `{"period":..., "closed":[...], "errors":[]}`. Se vier **401**, o
`WEBHOOK_SECRET` do curl não bate com o do serviço. Se vier **3xx**, a rota está sendo capturada
pelo middleware e o faturamento não roda — não deixe passar.

> Alternativa sem expor o endpoint: **Coolify → Scheduled Tasks**, rodando
> `pnpm billing:close -- --period YYYY-MM` dentro do container.

## 8. Verificação pós-deploy

Roteiro mínimo, na ordem:

1. `https://console...` carrega e o login funciona.
2. `curl https://margot.../health` e `curl https://motor.../health` respondem `ok`.
3. `\dt tenant_*.*` lista as tabelas dos dois produtos (provisioning funcionou).
4. Console → o cliente vê **só** os produtos assinados.
5. **Motor:** conecte o canal blog, crie uma peça, publique. `usage_counters` deve ir a 1.
   Publique a mesma peça de novo: continua **1** (idempotente).
6. **Margot:** mande uma mensagem para o número conectado. Deve responder, e cada resposta da
   IA soma 1 em `usage_counters` (a entrada do cliente é grátis).
7. `POST /api/cron/billing-close` com o período corrente → confira a fatura em `invoices`.

```sql
SELECT produto, metric, period, count FROM usage_counters WHERE tenant_id = '<uuid>';
SELECT period, total_brl, lines FROM invoices WHERE tenant_id = '<uuid>';
```

`sapienza-motor/scripts/e2e.sh` faz esse caminho de forma automatizada contra um Postgres —
vale rodar localmente antes de repetir em produção.

## 9. Rollback

Coolify → Deployments → redeploy da versão anterior. **As migrations são forward-only**: voltar
a imagem não desfaz mudança de schema. Se um deploy migrou o banco, o rollback da imagem pode
encontrar um schema à frente do código — por isso backup antes de deploy que mexe em migration.

---

## Referência rápida — envs por serviço

| Var | core | margot | motor | Observação |
|---|:-:|:-:|:-:|---|
| `DATABASE_URL` | ✅ | ✅ | ✅ | o MESMO Postgres |
| `PRODUCT_JWT_SECRET` | ✅ | ✅ | ✅ | **idêntico nos três** |
| `WEBHOOK_SECRET` | ✅ | — | ✅ | segredo dos crons |
| `AUTH_SECRET` + `AUTH_TRUST_HOST` + `AUTH_URL` | ✅ | — | — | NextAuth (`AUTH_URL` = URL pública do console) |
| `MARGOT_API_URL` / `MOTOR_API_URL` | ✅ | — | — | BFF do console — URL **pública** `https://…`, não nome de container |
| `MARGOT_ENC_KEY` | — | ✅ | — | AES-256-GCM |
| `MOTOR_ENC_KEY` | — | — | ✅ | AES-256-GCM |
| `EVOLUTION_API_URL` / `_API_KEY` / `_WEBHOOK_SECRET` | — | ✅ | — | WhatsApp |
| `MARGOT_PUBLIC_URL` | — | ✅ | — | destino do webhook no onboarding por QR |
| `ANTHROPIC_API_KEY` | — | ✅ | ✅ | IA |
| `S3_*` | — | — | opcional | só p/ Instagram/Threads |

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Build da margot falha em `go mod download` com `open /sapienza-kit/go.mod: no such file or directory` | Build Pack está em **Nixpacks**: ele ignora o Dockerfile e tenta baixar o kit em vez de usar o `vendor/`. Troque para **Dockerfile** |
| Build usa `ghcr.io/railwayapp/nixpacks` no log | idem — o Dockerfile do repo não está sendo usado |
| Serviço sobe mas o `public`/as tabelas não existem | Nixpacks de novo: sem o `CMD` do Dockerfile, `db:migrate`/`provision` não rodam no boot |
| Domínio do motor não sobe / 404 na raiz | Health Check não está em `/health`: o Motor é só API, `GET /` dá 404 e o Coolify o marca não-saudável |
| Console dá **500** "Não foi possível falar com o serviço do Motor/Margot" | `MOTOR_API_URL`/`MARGOT_API_URL` ausente ou usando nome de container (`motor:3000`), que não resolve no Coolify — use a URL pública `https://…` e redeploy o core |
| Console dá 401 ao abrir Margot/Motor | `PRODUCT_JWT_SECRET` diferente entre os serviços |
| Login volta para `localhost` depois de autenticar | falta `AUTH_URL=https://console.<domínio>` no core |
| Mudei o kit, subi a Margot e nada mudou | faltou `go mod vendor` na Margot: o build usa o `vendor/`, não o `replace` local |
| Cron responde 401 | `WEBHOOK_SECRET` do GitHub ≠ do serviço |
| Cron responde 3xx | rota capturada pelo middleware — o faturamento não está rodando |
| Tabelas do tenant não existem | outbox não drenado: `POST /api/cron/provision` no motor; no margot, reinicie (catch-up no boot) |
| Bot não responde | assinatura margot inativa (gating), `mode='human'` após handoff, ou webhook da Evolution não configurado |
| Peça não sai no Instagram | falta o conjunto `S3_*` — IG exige imagem pública |
| Credencial de canal ilegível | `MOTOR_ENC_KEY`/`MARGOT_ENC_KEY` trocada depois de gravada |
| Build do core estoura memória | VPS pequena demais para o `next build` |
