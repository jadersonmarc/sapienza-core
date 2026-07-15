# sapienza-core — imagem para Coolify. Um serviço Next.js; o Postgres é externo
# (compose ou serviço Coolify). No boot: migra o control plane, sincroniza o
# pricing.yaml em `plans` e sobe o console.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- deps + build ---
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false
COPY . .
# db.ts é lazy → build não precisa de DATABASE_URL.
RUN pnpm build

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000

# migrate + pricing:sync são idempotentes; rodam a cada boot antes do start.
CMD ["sh", "-lc", "pnpm db:migrate && pnpm pricing:sync && pnpm start"]
