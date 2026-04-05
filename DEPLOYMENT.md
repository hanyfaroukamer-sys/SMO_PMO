# StrategyPMO — Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- PostgreSQL 16 (included in docker-compose, or use an external instance)
- An OIDC identity provider (Replit, Azure AD, or Keycloak)
- (Optional) Anthropic API key for AI features
- (Optional) Email provider (Resend, SendGrid, or SMTP)

## Quick Start (Docker Compose)

```bash
# 1. Clone the repo
git clone https://github.com/hanyfaroukamer-sys/SMO_PMO.git
cd SMO_PMO
git checkout release/v2.0

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set:
#   DB_PASSWORD, SESSION_SECRET, OIDC credentials, INITIAL_ADMIN_EMAIL

# 3. Build and start
docker compose up -d --build

# 4. Verify
curl http://localhost:3000/api/health
# Should return: {"status":"ok"}

# 5. Access the app
# Open http://localhost:3000/strategy-pmo/
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Browser (React SPA)                    │
│  http://your-domain/strategy-pmo/       │
└────────────────┬────────────────────────┘
                 │ HTTPS
┌────────────────▼────────────────────────┐
│  Node.js API Server (Express 5)         │
│  Port 3000                              │
│  ├── /api/*          REST API           │
│  ├── /strategy-pmo/* Frontend (static)  │
│  └── /api/health     Health check       │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  PostgreSQL 16                          │
│  Auto-migrates on startup (Drizzle)     │
└─────────────────────────────────────────┘
```

## Configuration Reference

### Required

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `SESSION_SECRET` | Random string for cookie signing (64+ chars) | `openssl rand -hex 32` |
| `ISSUER_URL` | OIDC provider URL | `https://login.microsoftonline.com/{tenant}/v2.0` |
| `OIDC_CLIENT_ID` | OAuth client ID | From your identity provider |
| `OIDC_CLIENT_SECRET` | OAuth client secret | From your identity provider |

### Recommended

| Variable | Description | Default |
|---|---|---|
| `APP_URL` | Full URL to the app (used in emails) | `http://localhost:3000/strategy-pmo` |
| `ALLOWED_ORIGINS` | CORS whitelist (comma-separated) | Replit domains |
| `INITIAL_ADMIN_EMAIL` | First user gets admin role | None |
| `EMAIL_FROM` | Sender email for notifications | `noreply@strategypmo.app` |

### Optional

| Variable | Description | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Enables AI advisor, board reports, assessments | Disabled |
| `RESEND_API_KEY` | Email via Resend | None |
| `SENDGRID_API_KEY` | Email via SendGrid | None |
| `SMTP_HOST/PORT/USER/PASS` | Email via SMTP | None |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |

## Database

- **Auto-migration**: Drizzle ORM creates/updates tables on first startup. No manual SQL needed.
- **Seed data**: On empty database, demo data is seeded automatically. Set `FORCE_RESEED=true` to re-seed.
- **Backup**: Standard `pg_dump` / `pg_restore` workflow.

```bash
# Backup
docker compose exec db pg_dump -U spmo strategypmo > backup.sql

# Restore
docker compose exec -T db psql -U spmo strategypmo < backup.sql
```

## Reverse Proxy (Production)

For production, put Nginx or a cloud load balancer in front:

```nginx
server {
    listen 443 ssl;
    server_name pmo.your-domain.com;

    ssl_certificate     /etc/ssl/your-cert.pem;
    ssl_certificate_key /etc/ssl/your-key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `ALLOWED_ORIGINS=https://pmo.your-domain.com` in your `.env`.

## Identity Provider Setup

### Azure AD
1. Register an app in Azure Portal → App Registrations
2. Set redirect URI: `https://your-domain.com/api/auth/callback`
3. Copy Client ID and Client Secret to `.env`
4. Set `ISSUER_URL=https://login.microsoftonline.com/{tenant-id}/v2.0`

### Keycloak
1. Create a realm and client in Keycloak admin
2. Set redirect URI: `https://your-domain.com/api/auth/callback`
3. Copy Client ID and Client Secret to `.env`
4. Set `ISSUER_URL=https://keycloak.your-domain.com/realms/your-realm`

## File Storage

Evidence uploads currently use Replit Object Storage. For production deployment:

- **S3-compatible**: Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`
- **Azure Blob**: Requires adapter changes in `lib/objectStorage.ts`
- **Local filesystem**: Mount a volume and update the storage service

The `ObjectStorageService` class (`artifacts/api-server/src/lib/objectStorage.ts`) is the single abstraction layer — only this file needs changes for different providers.

## Monitoring

- **Health check**: `GET /api/health` — returns `{"status":"ok"}` when DB is connected
- **Logs**: JSON-formatted via Pino logger. Pipe to your log aggregator.
- **Diagnostics**: Admin panel → Diagnostics tab shows memory, uptime, DB stats.

## Updating

```bash
# Pull latest code
git pull origin release/v2.0

# Rebuild and restart
docker compose up -d --build

# Database migrations run automatically on startup
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `{"status":"unhealthy"}` | Database not reachable | Check `DATABASE_URL`, ensure PostgreSQL is running |
| Blank page at `/strategy-pmo/` | Frontend not built | Rebuild: `docker compose up -d --build` |
| Login redirects to error | OIDC misconfigured | Verify `ISSUER_URL`, client ID/secret, redirect URI |
| Emails not sending | No email transport configured | Set `RESEND_API_KEY` or SMTP credentials |
| AI features return errors | Missing API key | Set `ANTHROPIC_API_KEY` |
