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

# Health check via Node (imagem slim não tem curl/wget). GET /health → 200 "ok"
# (fora do matcher do middleware). start-period folgado: migrate + pricing:sync
# rodam antes do next start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# migrate + pricing:sync + coupons:seed + superadmin:link são idempotentes; rodam a
# cada boot antes do start (seed de cupons não zera contador/resgates; superadmin:link
# garante o tenant interno "Sapienza" e vincula o superadmin — evita "SEM ACESSO").
CMD ["sh", "-lc", "pnpm db:migrate && pnpm pricing:sync && pnpm coupons:seed && pnpm superadmin:link && pnpm start"]
