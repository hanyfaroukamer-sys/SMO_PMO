# StrategyPMO — Deployment Guide

## Overview

StrategyPMO is a government programme management dashboard for tracking strategic pillars, initiatives, projects, milestones, KPIs, risks, and budgets.

**Version:** 1.0.0
**Architecture:** Node.js 20 + PostgreSQL 16 + Nginx reverse proxy

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB |
| Docker | 24.0+ | Latest |
| Docker Compose | v2.20+ | Latest |
| OS | Any Linux (Ubuntu 22.04+, RHEL 8+, Amazon Linux 2023) | Ubuntu 22.04 LTS |

**Network:** Outbound HTTPS (port 443) required only if using Anthropic AI features.

---

## Quick Start (5 minutes)

```bash
# 1. Extract the deployment package
tar -xzf strategypmo-deploy.tar.gz
cd strategypmo-deploy

# 2. Configure environment
cp .env.example .env
nano .env   # Edit required values (see Configuration section below)

# 3. Start everything
docker compose up -d

# 4. Verify
docker compose ps                              # All services "healthy"
curl -s http://localhost:3000/api/health        # {"status":"ok"}
# Open http://localhost:3000/strategy-pmo/ in browser
```

---

## Configuration

Edit `.env` before first start. Required values are marked with *.

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` * | `changeme_in_production` | PostgreSQL password. **Change this.** |

### Authentication (OIDC)

| Variable | Default | Description |
|----------|---------|-------------|
| `ISSUER_URL` | (none) | OIDC provider URL. For Azure AD: `https://login.microsoftonline.com/{tenant-id}/v2.0` |
| `OIDC_CLIENT_ID` | (none) | Client ID from your OIDC provider |
| `OIDC_CLIENT_SECRET` | (none) | Client secret from your OIDC provider |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` * | (none) | Comma-separated CORS origins. e.g. `https://pmo.example.gov.sa` |
| `APP_URL` | (none) | Public URL of the application. Used for OIDC redirect. |
| `COOKIE_SAMESITE` | `lax` | Cookie policy: `strict`, `lax`, or `none` |

### AI Features (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (none) | Anthropic API key for AI-powered analysis |

### Application

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Application port (internal) |
| `LOG_LEVEL` | `info` | Logging: `debug`, `info`, `warn`, `error` |
| `FORCE_RESEED` | (none) | Set to `true` to reload seed data on next restart |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Client Browser                                         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (443)
┌────────────────────────▼────────────────────────────────┐
│  Nginx (reverse proxy + TLS termination)                │
│  Port 80/443 → app:3000                                 │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (3000)
┌────────────────────────▼────────────────────────────────┐
│  App Container (Node.js 20)                             │
│  /strategy-pmo/*  → React SPA (static files)            │
│  /api/*           → Express REST API                    │
│  /api/health      → Health check (with DB ping)         │
└────────────────────────┬────────────────────────────────┘
                         │ TCP (5432)
┌────────────────────────▼────────────────────────────────┐
│  PostgreSQL 16                                          │
│  Database: strategypmo                                  │
│  29 tables, auto-seeded on first startup                │
│  Volume: pgdata (persistent)                            │
└─────────────────────────────────────────────────────────┘
```

---

## Deployment Options

### Option A: Docker Compose (Recommended for single-server)

Use the provided `docker-compose.yml`. Includes app + PostgreSQL + Nginx.

```bash
docker compose up -d
```

### Option B: External Database

If you have an existing PostgreSQL 16 instance:

1. Edit `.env`:
   ```
   DATABASE_URL=postgresql://user:pass@your-db-host:5432/strategypmo
   ```
2. Use `docker-compose.external-db.yml`:
   ```bash
   docker compose -f docker-compose.external-db.yml up -d
   ```

### Option C: Kubernetes

Use the provided `docker-compose.yml` as reference. Key specs:
- App container: 1 replica minimum, 2+ for HA
- PostgreSQL: Use a managed service (RDS, Cloud SQL, Azure DB)
- Health check: `GET /api/health` (liveness + readiness)
- Resource requests: 512Mi RAM, 250m CPU
- Resource limits: 2Gi RAM, 1000m CPU

---

## SSL/TLS Setup

### With Nginx (included in docker-compose.yml)

1. Place your certificate files:
   ```
   deploy/nginx/ssl/cert.pem      # SSL certificate
   deploy/nginx/ssl/key.pem       # Private key
   ```

2. Edit `.env`:
   ```
   APP_DOMAIN=pmo.example.gov.sa
   ENABLE_SSL=true
   ```

3. Restart:
   ```bash
   docker compose down && docker compose up -d
   ```

### With external load balancer (AWS ALB, Azure App Gateway, etc.)

Set Nginx to HTTP-only mode (default) and terminate TLS at the load balancer. Forward traffic to port 80.

---

## Database

### Initial Data

On first startup, the application automatically:
1. Creates all 29 database tables (via Drizzle ORM schema push)
2. Seeds 1,299 rows of programme data across 16 tables (9 pillars, 26 initiatives, 100 projects, 910 milestones, 42 KPIs, etc.)

### Backup

```bash
# Create backup
./scripts/backup.sh

# Backup is saved to ./backups/strategypmo_YYYYMMDD_HHMMSS.sql.gz
```

### Restore

```bash
# Restore from backup
./scripts/restore.sh backups/strategypmo_20260325_120000.sql.gz
```

### Manual backup (without script)

```bash
docker compose exec db pg_dump -U strategypmo strategypmo | gzip > backup.sql.gz
```

---

## Operations

### View logs

```bash
docker compose logs -f app          # Application logs
docker compose logs -f db           # Database logs
docker compose logs -f nginx        # Nginx access/error logs
docker compose logs -f              # All services
```

### Restart services

```bash
docker compose restart app           # Restart app only
docker compose restart               # Restart all
```

### Stop and start

```bash
docker compose down                  # Stop (data preserved in volume)
docker compose up -d                 # Start again
```

### Update to new version

```bash
docker compose down
docker compose build --no-cache app  # Rebuild with new code
docker compose up -d
```

### Force reseed data

```bash
# Set FORCE_RESEED=true in .env, then restart
docker compose restart app
# Remove FORCE_RESEED after restart
```

### Check health

```bash
curl -s http://localhost:3000/api/health | jq .
# Returns: {"status":"ok"} or {"status":"unhealthy"}
```

---

## Monitoring

### Health check endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Full health check (includes DB connectivity) |

### Key metrics to monitor

- Container CPU/memory via `docker stats`
- PostgreSQL connections: max 20 in pool
- Disk usage on `pgdata` volume
- Application logs for `ERROR` level entries

---

## Security Checklist

Before going live, ensure:

- [ ] `DB_PASSWORD` changed from default
- [ ] `ALLOWED_ORIGINS` set to your domain(s) only
- [ ] `COOKIE_SAMESITE` set to `strict` or `lax`
- [ ] SSL/TLS certificate installed
- [ ] Firewall rules: only ports 80/443 open externally
- [ ] PostgreSQL port 5432 NOT exposed externally (remove `ports` from db service in docker-compose)
- [ ] OIDC authentication configured with your identity provider
- [ ] `APP_URL` set to your public URL
- [ ] `LOG_LEVEL` set to `info` (not `debug`) in production

---

## Troubleshooting

### App container keeps restarting

```bash
docker compose logs app --tail 50
```
Common causes:
- Database not ready (check `docker compose logs db`)
- Invalid `DATABASE_URL`
- Missing required environment variables

### "unhealthy" status

```bash
docker compose exec app curl -s http://localhost:3000/api/health
```
- If connection refused: app crashed, check logs
- If `{"status":"unhealthy"}`: database connectivity issue

### Database connection errors

```bash
# Test database connectivity
docker compose exec db psql -U strategypmo -c "SELECT 1;"
```

### Reset everything (destructive)

```bash
docker compose down -v    # Removes volumes (ALL DATA LOST)
docker compose up -d      # Fresh start with seed data
```

---

## Support

For technical support, contact the development team with:
1. Output of `docker compose ps`
2. Output of `docker compose logs --tail 100`
3. Contents of your `.env` file (redact passwords/keys)
