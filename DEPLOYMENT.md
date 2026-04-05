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

## Google Cloud Platform (GCP) Deployment

### Option A: Cloud Run (Recommended — serverless, auto-scaling)

```bash
# 1. Install gcloud CLI and authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Create Cloud SQL PostgreSQL instance
gcloud sql instances create strategypmo-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=me-central1 \
  --root-password=YOUR_DB_PASSWORD

gcloud sql databases create strategypmo --instance=strategypmo-db

gcloud sql users create spmo \
  --instance=strategypmo-db \
  --password=YOUR_DB_PASSWORD

# 3. Build and push Docker image to Artifact Registry
gcloud artifacts repositories create strategypmo \
  --repository-format=docker \
  --location=me-central1

gcloud builds submit --tag me-central1-docker.pkg.dev/YOUR_PROJECT_ID/strategypmo/app:v2.0

# 4. Deploy to Cloud Run
gcloud run deploy strategypmo \
  --image me-central1-docker.pkg.dev/YOUR_PROJECT_ID/strategypmo/app:v2.0 \
  --platform managed \
  --region me-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 5 \
  --add-cloudsql-instances YOUR_PROJECT_ID:me-central1:strategypmo-db \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "DATABASE_URL=postgres://spmo:YOUR_DB_PASSWORD@/strategypmo?host=/cloudsql/YOUR_PROJECT_ID:me-central1:strategypmo-db" \
  --set-env-vars "SESSION_SECRET=YOUR_SECRET" \
  --set-env-vars "ISSUER_URL=https://login.microsoftonline.com/TENANT_ID/v2.0" \
  --set-env-vars "OIDC_CLIENT_ID=YOUR_CLIENT_ID" \
  --set-env-vars "OIDC_CLIENT_SECRET=YOUR_CLIENT_SECRET" \
  --set-env-vars "APP_URL=https://strategypmo-HASH-me.a.run.app/strategy-pmo" \
  --set-env-vars "INITIAL_ADMIN_EMAIL=admin@your-domain.com"
```

**GCP-specific requirements for Cloud Run:**
- Cloud SQL Proxy is handled automatically via `--add-cloudsql-instances`
- DATABASE_URL uses Unix socket: `?host=/cloudsql/PROJECT:REGION:INSTANCE`
- Set `--min-instances 1` to avoid cold starts (email scheduler needs to run)
- Map a custom domain via Cloud Run domain mapping or a load balancer

### Option B: GKE (Kubernetes — full control)

```bash
# 1. Create GKE cluster
gcloud container clusters create strategypmo \
  --region me-central1 \
  --num-nodes 2 \
  --machine-type e2-standard-2

# 2. Push image (same as Cloud Run step 3)

# 3. Create Kubernetes secrets
kubectl create secret generic strategypmo-env \
  --from-env-file=.env

# 4. Apply deployment
kubectl apply -f k8s/deployment.yaml
```

For GKE, create `k8s/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: strategypmo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: strategypmo
  template:
    metadata:
      labels:
        app: strategypmo
    spec:
      containers:
        - name: app
          image: me-central1-docker.pkg.dev/PROJECT/strategypmo/app:v2.0
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: strategypmo-env
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: strategypmo
spec:
  type: LoadBalancer
  selector:
    app: strategypmo
  ports:
    - port: 443
      targetPort: 3000
```

### Option C: Compute Engine (VM — simplest)

```bash
# 1. Create VM
gcloud compute instances create strategypmo \
  --zone=me-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB

# 2. SSH in and install Docker
gcloud compute ssh strategypmo
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER

# 3. Clone and run
git clone https://github.com/hanyfaroukamer-sys/SMO_PMO.git
cd SMO_PMO && git checkout release/v2.0
cp .env.example .env  # edit with real values
docker compose up -d --build
```

### GCP Services Used

| Service | Purpose | Required? |
|---|---|---|
| **Cloud SQL** (PostgreSQL 16) | Database | Yes (or self-managed PostgreSQL) |
| **Cloud Run** or **GKE** or **Compute Engine** | Application hosting | Yes (pick one) |
| **Artifact Registry** | Docker image storage | Yes (for Cloud Run / GKE) |
| **Cloud Storage** | File uploads (evidence, documents) | Optional — replaces Replit Object Storage |
| **Secret Manager** | Store env vars securely | Recommended for production |
| **Cloud Load Balancing** | HTTPS termination + custom domain | Recommended |
| **Cloud Armor** | WAF / DDoS protection | Recommended for government deployments |
| **Cloud Logging** | Centralized logs (app outputs JSON) | Recommended |

### File Storage on GCP (Cloud Storage)

To use GCS instead of Replit Object Storage, the `ObjectStorageService` in `artifacts/api-server/src/lib/objectStorage.ts` already uses `@google-cloud/storage`. For GCP:

1. Create a GCS bucket: `gsutil mb gs://strategypmo-uploads`
2. Create a service account with Storage Object Admin role
3. Download the JSON key file
4. Set env vars:
```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
PRIVATE_OBJECT_DIR=gs://strategypmo-uploads/private
PUBLIC_OBJECT_SEARCH_PATHS=gs://strategypmo-uploads/public
```

The app already uses `@google-cloud/storage` natively — no adapter changes needed for GCP.

### Cost Estimate (GCP)

| Component | Spec | Monthly Est. |
|---|---|---|
| Cloud SQL (PostgreSQL) | db-f1-micro, 10GB | ~$10-15 |
| Cloud Run | 1 vCPU, 1GB RAM, min 1 instance | ~$20-40 |
| Cloud Storage | 10GB | ~$0.50 |
| Load Balancer + SSL | Managed cert | ~$18 |
| **Total** | | **~$50-75/month** |

For production with higher traffic, scale to db-custom-2-4096 (~$50/mo) and Cloud Run max 5 instances (~$100/mo).

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
