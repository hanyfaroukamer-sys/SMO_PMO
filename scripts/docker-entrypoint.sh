#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL..."
RETRIES=30
until pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-strategypmo}" -q 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: PostgreSQL not ready after 30 attempts. Exiting."
    exit 1
  fi
  echo "  Waiting for PostgreSQL... ($RETRIES attempts left)"
  sleep 1
done
echo "==> PostgreSQL is ready."

echo "==> Applying database schema (drizzle-kit push)..."
npx drizzle-kit push --force --config=lib/db/drizzle.config.ts 2>&1 || {
  echo "WARNING: drizzle-kit push failed. Server will start but schema may be incomplete."
}

echo "==> Starting StrategyPMO server on port ${PORT:-3000}..."
exec node artifacts/api-server/dist/index.cjs
