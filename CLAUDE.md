# CLAUDE.md — sapienza-core

## O que é

Control plane + **console operacional único** da plataforma Sapienza SaaS. Único dono
do schema `public`. Evoluído a partir do `../spa-sapienza` (mesma stack e design
system). Ver `SPEC.md` (arquitetura/regras de ouro) e `../INVENTORY.md` (reuso).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind v4 (tokens OKLCH em `app/globals.css`; dark/light via next-themes)
- shadcn/ui (New York) + Radix + lucide-react
- Drizzle ORM + postgres-js; NextAuth v5 (Credentials/JWT)
- pnpm; vitest
- Deploy **Coolify** (não Vercel) → `images.unoptimized` no `next.config.mjs`

## Comandos

```bash
pnpm dev            # http://localhost:3000
pnpm build          # lê o Postgres — exige DATABASE_URL
pnpm test           # vitest
pnpm db:generate    # migration a partir do schema (drizzle-kit)
pnpm db:migrate     # aplica migrations control em public
pnpm db:seed        # cria admin/superadmin
pnpm pricing:sync   # valida pricing.yaml e materializa em `plans`
pnpm billing:close  # fechamento mensal → invoices (Degrau 13)
```

## Estrutura (alvo)

- `config/pricing.yaml` — fonte única de preço/tier/regra.
- `lib/pricing/*` — loader zod + sync p/ `plans`.
- `lib/db/*` — Drizzle (schema `public`), migrations em `drizzle/`.
- `lib/billing/*` — agregação de uso + fechamento (Degrau 13, soft/hard cap).
- `lib/provisioning/*` — ativar assinatura, CREATE SCHEMA, gravar outbox.
- `lib/events/*` — escrever `event_outbox` (contrato com o kit Go).
- `lib/auth/*`, `auth.ts`, `auth.config.ts`, `middleware.ts` — auth + JWT p/ produtos.
- `lib/agent/*` — crypto AES, tenant ativo, client BFF (de `spa-sapienza`).
- `app/(console)/*` — console por tenant; `app/(console)/super/` — visão Sapienza.
- `app/globals.css` (tokens OKLCH), `app/layout.tsx`, `components/ui/*`,
  `components/eyebrow.tsx` — design system (de `spa-sapienza`).

## Convenções

- **Só o core escreve em `public`.** Produtos leem via kit.
- **Tokens semânticos** sempre (`bg-background`, `text-foreground`, `border-border`,
  `bg-primary`…). Nunca cor fixa (`white/x`, `bg-black`). AA em ambos os temas.
- **Preço nunca chumbado** — vem de `pricing.yaml` → `plans`.
- Conteúdo pt-BR; acentuação correta.
- **Sem Redis** (sessão JWT stateless; eventos em Postgres).

## Restrições

- Não editar `../spa-sapienza` nem `../rag-agente-go` (referência somente-leitura).
- Não criar tabelas de produto no `public` nem nos schemas de tenant (isso é dos produtos).
