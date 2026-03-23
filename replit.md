# Initiative Tracker & StrategyPMO — Workspace

## Overview

Full-stack pnpm monorepo hosting two production-grade government applications:

1. **Initiative Tracker** — milestone-based progress tracking with approval workflow
2. **StrategyPMO** — 5-level programme management dashboard (Programme → Pillars → Initiatives → Projects → Milestones) with AI assessment via Claude, dynamic alerts, KPI/Risk/Budget tracking, and full audit trail

## StrategyPMO Key Features (Latest)

- **Change Control** — change request lifecycle (draft → submitted → approved/rejected) per project
- **RACI Matrix** — interactive R/A/C/I assignment per milestone via click-to-cycle cells; missing Accountable validation
- **Action Items** — per-project action log with priority, assignee, due date, and status cycling
- **Documents** — document library per project with category, tags, versioning; global `/documents` page with search/filter and export
- **Export** — XLSX export buttons on Projects, KPIs, Op KPIs, Budget, Risks, and Documents pages
- **Project Detail Tabs** — 8 tabs: Overview, Milestones, Weekly Report, Risks, Change Control, RACI, Actions, Documents

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Replit Auth (OIDC/PKCE) via `openid-client` v6 on server; `@workspace/replit-auth-web` on frontend
- **Object storage**: Replit Object Storage (GCS-backed) — presigned URL upload flow
- **Frontend**: React 18 + Vite, Tailwind CSS v4, TanStack Query, Wouter, Radix UI, Framer Motion, Sonner, Recharts
- **Validation**: Zod (v3 catalog), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for api-server)
- **AI**: Anthropic Claude (via `@workspace/integrations-anthropic-ai`)

## Roles (shared across both apps)

- `admin` — full access, role management
- `project-manager` — create/manage initiatives and milestones, submit for approval
- `approver` — approve or reject submitted milestones

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/            # Express 5 API server (port 8080)
│   │   └── src/routes/spmo.ts # All SPMO endpoints (40+ routes)
│   │   └── src/lib/spmo-calc.ts  # calcProgress cascade engine
│   │   └── src/lib/spmo-activity.ts  # Activity logger
│   ├── initiative-tracker/    # React + Vite frontend (initiative tracker)
│   └── strategy-pmo/          # React + Vite frontend (StrategyPMO, port 22880)
├── lib/
│   ├── api-spec/              # OpenAPI 3.1 spec + Orval codegen config
│   ├── api-client-react/      # Generated React Query hooks
│   ├── api-zod/               # Generated Zod schemas
│   ├── db/                    # Drizzle ORM schema + DB connection
│   │   └── src/schema/spmo.ts # 10 SPMO tables (spmo_* prefix)
│   ├── integrations-anthropic-ai/  # Anthropic Claude client
│   ├── replit-auth-web/       # useAuth() hook for React frontend
│   └── object-storage-web/    # File upload utilities
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json              # Root TS project references
└── package.json
```

## SPMO DB Schema (all tables prefixed `spmo_`)

- `spmo_pillars` — id, name, description, weight, color, iconName, sortOrder
- `spmo_initiatives` — id, pillarId, name, description, ownerId, ownerName, startDate, targetDate, weight, status, sortOrder
- `spmo_projects` — id, initiativeId, name, description, ownerId, ownerName, budget, startDate, targetDate, weight, status
- `spmo_milestones` — id, projectId, name, description, weight, progress, status, dueDate, submittedAt, approvedAt, approvedById, rejectedAt, rejectedById, rejectionReason
- `spmo_evidence` — id, milestoneId, fileName, contentType, objectPath, uploadedById, uploadedByName, description, aiValidated, aiScore, aiReasoning
- `spmo_kpis` — id, projectId, name, type, unit, baseline, target, actual, status, description
- `spmo_risks` — id, pillarId, projectId, title, description, category, probability, impact, riskScore, status, owner
- `spmo_mitigations` — id, riskId, description, status, dueDate
- `spmo_budget` — id, projectId, pillarId, period, allocated, spent, currency, category, label
- `spmo_activity_log` — id, actorId, actorName, action, entityType, entityId, entityName, details, createdAt

## calcProgress Engine (99% Gate)

- `milestoneEffectiveProgress()`: if status === 'approved' → actual progress; if progress ≥ 100 AND status !== 'approved' → 99; else → progress
- `projectProgress()`: weighted average of milestone effective progress
- `initiativeProgress()`: weighted average of project progress  
- `pillarProgress()`: weighted average of initiative progress
- `calcProgrammeProgress()`: weighted average of pillar progress
- Falls back to simple average if all weights = 0

## SPMO API Routes (all under `/api/spmo/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /programme | Programme overview with all pillar summaries |
| GET/POST | /pillars | List/create pillars |
| GET/PUT/DELETE | /pillars/:id | Get/update/delete pillar |
| GET/POST | /initiatives | List/create initiatives |
| GET/PUT/DELETE | /initiatives/:id | Get/update/delete initiative |
| GET/POST | /projects | List/create projects |
| GET/PUT/DELETE | /projects/:id | Get/update/delete project |
| GET/POST | /projects/:id/milestones | List/create milestones |
| PUT/DELETE | /milestones/:id | Update/delete milestone |
| POST | /milestones/:id/submit | Submit milestone for approval |
| POST | /milestones/:id/approve | Approve milestone |
| POST | /milestones/:id/reject | Reject milestone with reason |
| POST | /milestones/:id/evidence | Add evidence file |
| DELETE | /evidence/:id | Delete evidence |
| GET | /pending-approvals | All pending approval items with context |
| GET/POST/PUT/DELETE | /kpis | KPI management |
| GET/POST/PUT/DELETE | /risks | Risk register |
| POST | /risks/:id/mitigations | Add mitigation |
| PUT | /mitigations/:id | Update mitigation |
| GET/POST/PUT/DELETE | /budget | Budget management |
| GET | /alerts | Computed dynamic alerts engine |
| GET | /activity-log | Full audit trail |
| POST | /ai/assessment | AI programme health assessment (Claude, 5min cache) |
| POST | /ai/validate-evidence | AI evidence quality validation |

## Initiative Tracker API Routes (all under `/api`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /auth/user | Get current user |
| GET | /login | Start OIDC login |
| GET | /callback | OIDC callback |
| GET | /logout | Logout |
| GET/POST | /initiatives | List/create initiatives |
| GET/PUT/DELETE | /initiatives/:id | Initiative CRUD |
| POST | /initiatives/:id/milestones | Create milestone |
| PUT/DELETE | /milestones/:id | Update/delete milestone |
| POST | /milestones/:id/submit | Submit for approval |
| POST | /milestones/:id/approve | Approve (admin/approver) |
| POST | /milestones/:id/reject | Reject with reason |
| POST | /milestones/:id/attachments | Add attachment |
| GET/PUT | /users | User management (admin) |
| POST | /storage/uploads/request-url | Presigned upload URL |
| GET | /storage/objects/* | Serve private attachment |

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — no JS emit during typecheck; bundling via esbuild/tsx/vite

## Root Scripts

- `pnpm run build` — typecheck then recursive build
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## Development

- API server: `pnpm --filter @workspace/api-server run dev` (port 8080)
- Initiative Tracker frontend: `pnpm --filter @workspace/initiative-tracker run dev`
- StrategyPMO frontend: `pnpm --filter @workspace/strategy-pmo run dev` (port 22880)
- DB push: `pnpm --filter @workspace/db run push`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
- SPMO seed: `pnpm --filter @workspace/api-server exec tsx ./scripts/seed-spmo.ts`

## Testing

Unit + integration tests live in `artifacts/api-server/src/__tests__/`. Run with:

```
pnpm --filter @workspace/api-server run test
```

**Test Coverage (103 tests across 11 files):**

| Suite | Location | Tests |
|-------|----------|-------|
| Milestone progress (milestoneEffectiveProgress) | `engines/calc-progress.test.ts` | 6 |
| Project/initiative/pillar progress (DB) | `engines/calc-progress.test.ts` | 12 |
| Project status (computeStatus) | `engines/project-status.test.ts` | 14 |
| Initiative status + child escalation | `engines/initiative-status.test.ts` | 7 |
| KPI engine — all 4 types + edge cases | `engines/kpi-status.test.ts` | 19 |
| Dependency cycle detection (DB) | `engines/dependency-cycle.test.ts` | 6 |
| Dependency resolution (DB) | `engines/dependency-resolve.test.ts` | 9 |
| Approval workflow (DB lifecycle) | `workflows/approval-flow.test.ts` | 7 |
| Progress cascade hierarchy (DB) | `workflows/progress-cascade.test.ts` | 8 |
| Dependency blocking/unblocking (DB) | `workflows/dependency-flow.test.ts` | 5 |
| CRUD + cascade delete (DB) | `api/crud.test.ts` | 10 |
| SQL injection / XSS security (DB) | `security/injection.test.ts` | 5 |

**Engine rule fix:** `computeStatus` now checks near-completion (≥95%) before the overdue check, so projects at 95%+ are always on-track even if past their end date.
