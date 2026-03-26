# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib/db/package.json lib/db/tsconfig.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/integrations-anthropic-ai/package.json lib/integrations-anthropic-ai/
COPY lib/object-storage-web/package.json lib/object-storage-web/
COPY lib/replit-auth-web/package.json lib/replit-auth-web/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/strategy-pmo/package.json artifacts/strategy-pmo/
COPY scripts/package.json scripts/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM deps AS build

WORKDIR /app

# Copy all source code
COPY . .

# Build libraries, API server, and frontend
RUN bash scripts/build-production.sh

# ─── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9 --activate

# Install curl for health checks and postgresql-client for schema push
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests and install production deps only
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib/db/package.json lib/db/tsconfig.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/integrations-anthropic-ai/package.json lib/integrations-anthropic-ai/
COPY lib/object-storage-web/package.json lib/object-storage-web/
COPY lib/replit-auth-web/package.json lib/replit-auth-web/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/strategy-pmo/package.json artifacts/strategy-pmo/
COPY scripts/package.json scripts/

RUN pnpm install --frozen-lockfile --prod || pnpm install --frozen-lockfile

# Copy built artifacts
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/strategy-pmo/dist ./artifacts/strategy-pmo/dist

# Copy Drizzle config and schema source (needed for drizzle-kit push)
COPY --from=build /app/lib/db ./lib/db

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser
RUN chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
