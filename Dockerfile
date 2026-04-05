# ──────────────────────────────────────────────
# StrategyPMO — Production Docker Image
# Multi-stage: deps → build → production
# ──────────────────────────────────────────────

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/strategy-pmo/package.json artifacts/strategy-pmo/

RUN pnpm install --frozen-lockfile

# Stage 2: Build everything
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/ ./
COPY . .

# Build libs → frontend → API
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/strategy-pmo run build
RUN pnpm --filter @workspace/api-server run build

# Stage 3: Production (minimal image)
FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/

RUN pnpm install --frozen-lockfile --prod

# Built artifacts
COPY --from=builder /app/lib/db/dist lib/db/dist
COPY --from=builder /app/lib/db/src lib/db/src
COPY --from=builder /app/lib/api-zod/dist lib/api-zod/dist
COPY --from=builder /app/lib/api-client-react/dist lib/api-client-react/dist
COPY --from=builder /app/artifacts/api-server/dist artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/src/lib artifacts/api-server/src/lib
COPY --from=builder /app/artifacts/strategy-pmo/dist artifacts/strategy-pmo/dist

# Drizzle schema (auto-migration on startup)
COPY --from=builder /app/lib/db/src/schema lib/db/src/schema

# Security: non-root user
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "artifacts/api-server/dist/index.cjs"]
