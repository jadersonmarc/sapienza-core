# sapienza-core

Control plane + console operacional único da plataforma Sapienza SaaS. Único dono do
schema `public` do Postgres; provisiona schemas de tenant; agrega uso e fatura; emite
identidade para os produtos. Evoluído a partir de `../spa-sapienza`.

## Stack

Next.js 16 (App Router) · Drizzle ORM · NextAuth v5 · Tailwind v4 · shadcn · pnpm ·
Postgres · Deploy Coolify.

## Desenvolvimento

```bash
pnpm install
cp .env.example .env         # DATABASE_URL, AGENT_TOKEN_ENC_KEY, AUTH_SECRET, PRODUCT_JWT_SECRET
pnpm db:migrate              # cria schema public
pnpm pricing:sync            # valida config/pricing.yaml e materializa `plans`
pnpm db:seed                 # cria admin/superadmin
pnpm dev                     # http://localhost:3000
```

## Docker (Coolify)

```bash
docker compose up            # Postgres + core (um só Postgres; sem Redis)
```

Ver `SPEC.md`, `CLAUDE.md`, `AGENTS.md` e `../INVENTORY.md`. Faz parte da fundação
PROMPT A junto com `../sapienza-kit`.
