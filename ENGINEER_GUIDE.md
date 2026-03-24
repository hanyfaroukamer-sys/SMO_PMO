# StrategyPMO — Full-Stack Engineer Guide
## KFCA Programme Management Dashboard

**Version:** 1.0 | **Date:** March 2026 | **Audience:** Full-Stack Engineers, QA Testers, DevOps

---

## 1. Product Overview

StrategyPMO is a **government-grade programme management dashboard** built for the King Fahad Causeway Authority (KFCA). It gives the PMO office real-time visibility across 9 strategic pillars, 26 initiatives, 100+ projects and 900+ milestones.

### Core Capabilities

| Module | Description |
|---|---|
| **Executive Dashboard** | Portfolio health heatmap, KPI scorecard, pillar-by-pillar progress |
| **Portfolio Views** | Pillar portfolio, department portfolio — drill-down from strategy to project |
| **Project Management** | Full project lifecycle: milestones, phase gates, budget, RACI, risks, actions |
| **Progress Proof Centre** | Evidence upload, AI validation, milestone approval workflow |
| **KPI Management** | 42 KPIs (10 strategic, 32 operational) with measurement history and multi-year targets |
| **Risk Register** | Project and pillar-level risks with mitigations |
| **My Tasks** | Assignee-specific task view with status filters |
| **Admin** | Programme config, pillar/initiative CRUD, KPI management, change requests |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│  React 18 + Vite + TanStack Router + TanStack Query               │
│  Tailwind CSS + shadcn/ui                                          │
└────────────────────────┬─────────────────────────────────────────┘
                         │  HTTPS (proxied via Replit)
┌────────────────────────▼─────────────────────────────────────────┐
│  Express API Server (Node.js + TypeScript)                        │
│  Port 8080  |  All routes prefixed /api/spmo/                     │
│  Auth: Replit OpenID Connect (session-based)                      │
│  AI: Anthropic Claude 3.5 (evidence validation)                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │  Drizzle ORM
┌────────────────────────▼─────────────────────────────────────────┐
│  PostgreSQL (Replit-managed)                                      │
│  20 SPMO tables  +  Replit Auth user tables                       │
└──────────────────────────────────────────────────────────────────┘
                         │  Presigned URL upload
┌────────────────────────▼─────────────────────────────────────────┐
│  Replit Object Storage (evidence files)                           │
└──────────────────────────────────────────────────────────────────┘
```

### Monorepo Layout

```
workspace/
├── artifacts/
│   ├── strategy-pmo/          # React+Vite frontend (port 22880 dev)
│   │   └── src/
│   │       ├── pages/         # One file per page/route
│   │       ├── components/    # Shared UI components
│   │       ├── hooks/         # Custom React hooks
│   │       └── lib/           # utils, export, api helpers
│   └── api-server/            # Express API (port 8080)
│       └── src/
│           ├── routes/
│           │   ├── spmo.ts    # All SPMO API routes (~3300 lines)
│           │   ├── storage.ts # File upload + object serving
│           │   └── milestones.ts
│           └── lib/
│               ├── spmo-calc.ts   # Health status engine
│               ├── spmo-activity.ts
│               └── objectStorage.ts
├── lib/
│   ├── db/                    # Drizzle schema (spmo-schema.ts)
│   └── api-client-react/      # Auto-generated typed API hooks
└── scripts/
    └── seed-test-data.sql     # Test data seed script
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | React 18 | Strict mode |
| Build tool | Vite 7 | HMR, TypeScript |
| Routing | TanStack Router | File-based, type-safe |
| Data fetching | TanStack Query + Orval | Auto-generated hooks from OpenAPI |
| UI components | shadcn/ui + Radix UI | Custom KFCA theme |
| Styling | Tailwind CSS 4 | |
| Charts | Recharts | Budget, KPI, progress charts |
| API framework | Express 5 | Node.js 20+ |
| ORM | Drizzle ORM | Type-safe queries |
| Database | PostgreSQL 16 | Replit-managed |
| Auth | Replit OpenID Connect | PKCE flow |
| AI | Anthropic Claude 3.5 Sonnet | Evidence validation only |
| File storage | Replit Object Storage | Presigned PUT URLs |
| Package manager | pnpm 9 (workspace) | |

---

## 4. Authentication & Authorisation

### Auth Flow
1. Unauthenticated user hits any `/api/spmo/*` route → `401 Authentication required`
2. Frontend detects 401 → redirects to `/api/login` (Replit OIDC)
3. After OIDC callback, session cookie is set
4. All subsequent requests carry the session cookie

### Roles

| Role | Capabilities |
|---|---|
| `admin` | Full CRUD on everything; can approve/reject milestones; access Progress Proof Centre; access Admin pages |
| `project-manager` | Read all data; update milestones on assigned projects; upload evidence; submit milestones for approval |

**Default role** for new Replit users: `project-manager`  
**Admin assignment**: manually set `role = 'admin'` in the `users` table, or via the Replit Auth admin panel.

### Key Auth Patterns (API)

```typescript
// Require auth (returns userId or sends 401)
const userId = requireAuth(req, res);
if (!userId) return;

// Require admin role
const user = getAuthUser(req);
if (user?.role !== 'admin') { res.status(403)...; return; }
```

---

## 5. Data Model

### Core Hierarchy
```
spmo_pillars (9)
  └── spmo_initiatives (26)
        └── spmo_projects (100)
              └── spmo_milestones (897)
                    └── spmo_evidence (files)
```

### Key Tables

| Table | Purpose | Notable Columns |
|---|---|---|
| `spmo_pillars` | 9 strategic pillars (3 pillar + 6 enabler) | `pillar_type: 'pillar'/'enabler'`, `weight`, `color` |
| `spmo_initiatives` | 26 initiatives under pillars | `pillar_id`, `weight` |
| `spmo_projects` | 100 projects | `initiative_id`, `department_id`, `status`, `start_date`, `target_date`, `budget`, `budget_spent`, `budget_capex`, `budget_opex`, `project_code` |
| `spmo_milestones` | Deliverables per project | `project_id`, `name`, `weight`, `progress`, `status`, `phase_gate` (null or 'planning'/'tendering'/'execution'/'closure'), `assignee_id`, `assignee_name` |
| `spmo_evidence` | Uploaded files for milestone proof | `milestone_id`, `file_name`, `object_path`, `content_type`, `uploaded_by_id` |
| `spmo_kpis` | 42 KPIs | `type` ('strategic'/'operational'), `direction` ('higher_is_better'/'lower_is_better'), `target_2026`–`target_2030`, `measurement_frequency` |
| `spmo_kpi_measurements` | Historical KPI readings | `kpi_id`, `measured_at`, `value`, `notes` |
| `spmo_risks` | Risk register | `pillar_id`, `project_id`, `probability`, `impact`, `risk_score`, `category` |
| `spmo_mitigations` | Risk mitigations | `risk_id`, `description`, `due_date`, `status` |
| `spmo_budget_entries` | Budget line items | `project_id`, `pillar_id`, `category` ('capex'/'opex'), `allocated`, `spent`, `fiscal_year` |
| `spmo_procurement` | Procurement packages | `project_id`, `stage`, `vendor`, `contract_value`, `award_date` |
| `spmo_actions` | Action items / tasks | `project_id`, `milestone_id`, `assignee_id`, `priority`, `status`, `due_date` |
| `spmo_change_requests` | Formal change control | `project_id`, `change_type`, `budget_impact`, `timeline_impact`, `status` |
| `spmo_raci` | Responsibility matrix | `project_id`, `milestone_id`, `user_id`, `role` ('responsible'/'accountable'/'consulted'/'informed') |
| `spmo_documents` | Document registry | `project_id`, `milestone_id`, `object_path`, `category`, `version` |
| `spmo_departments` | 10 KFCA departments | `name`, `color`, `sort_order` |
| `spmo_activity_log` | Audit trail | `actor_id`, `action`, `entity_type`, `entity_id`, `metadata` |
| `spmo_programme_config` | Single config row | `programme_name`, `target_year`, `default_phase_gate_weights` |

### Phase Gate Milestones
Every project automatically gets 4 locked phase gate milestones at creation:
- **Planning** (default 5% weight)
- **Tendering** (default 5%)
- **Execution** — created with `null` phase_gate marker, but tracked via the `phase_gate` column
- **Closure** (default 5%)

Phase gate milestones are identified by `phase_gate IS NOT NULL`. They **cannot be deleted** (API returns 400).

### Health Status Engine (`spmo-calc.ts`)

The status engine computes health for projects and initiatives based on:
- **SPI** (Schedule Performance Index) = progress% ÷ elapsed%
- **Burn gap** = budget_spent ÷ budget (vs progress)

Status values:
| Status | Colour | Rule |
|---|---|---|
| `not_started` | Grey | `elapsedPct ≤ 0` (future start date) |
| `on_track` | Green | SPI ≥ 0.85 and burn gap OK |
| `at_risk` | Amber | SPI 0.7–0.85 |
| `delayed` | Red | SPI < 0.7 |
| `completed` | Blue | All milestones 100% |

---

## 6. API Reference

Base URL: `https://<host>/api`  
All SPMO routes: `/api/spmo/*`  
All routes require authentication (session cookie).

### Dashboard & Portfolio

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/spmo/programme` | all | Programme summary: totals, health breakdown, pillar summaries |
| GET | `/spmo/dashboard` | all | Dashboard data: KPI cards, pillar summaries, recent activity |
| GET | `/spmo/pillars` | all | List all pillars with computed health |
| GET | `/spmo/initiatives` | all | List all initiatives |
| GET | `/spmo/projects` | all | List all projects (with optional `?initiativeId=`, `?pillarId=`) |
| GET | `/spmo/projects/:id` | all | Project detail with milestones, budget, risks |

### Milestones

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/spmo/milestones/all` | all | All milestones with evidence (used by Progress Proof) |
| GET | `/spmo/milestones?projectId=` | all | Milestones for a project |
| POST | `/spmo/projects/:id/milestones` | all | Create milestone |
| PUT | `/spmo/milestones/:id` | all | Update milestone progress/status/weight |
| DELETE | `/spmo/milestones/:id` | all | Delete (blocked for phase gate milestones) |
| POST | `/spmo/milestones/:id/submit` | all | Submit for approval (requires evidence) |
| POST | `/spmo/milestones/:id/approve` | admin | Approve milestone |
| POST | `/spmo/milestones/:id/reject` | admin | Reject with reason |

### Evidence Upload Flow

```
1. POST /spmo/uploads/request-url  { milestoneId }
   → { uploadURL, objectPath }

2. PUT  <uploadURL>  (direct to object storage, file as body)

3. POST /spmo/milestones/:id/evidence  { fileName, contentType, objectPath }
   → evidence record

4. DELETE /spmo/evidence/:id  (remove evidence file record)
```

### KPIs

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/spmo/kpis` | all | All KPIs |
| POST | `/spmo/kpis` | admin | Create KPI |
| PUT | `/spmo/kpis/:id` | admin | Update KPI targets/actuals |
| DELETE | `/spmo/kpis/:id` | admin | Delete KPI |
| GET | `/spmo/kpis/:id/measurements` | all | KPI measurement history |
| POST | `/spmo/kpis/:id/measurements` | admin | Add measurement reading |
| DELETE | `/spmo/kpis/measurements/:id` | admin | Delete measurement |

### Risks & Mitigations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/spmo/risks` | all | All risks (optional `?projectId=`, `?pillarId=`) |
| POST | `/spmo/risks` | all | Create risk |
| PUT | `/spmo/risks/:id` | all | Update risk |
| DELETE | `/spmo/risks/:id` | admin | Delete risk |
| POST | `/spmo/risks/:id/mitigations` | all | Add mitigation |
| DELETE | `/spmo/mitigations/:id` | admin | Delete mitigation |

### Budget, Procurement, Actions, Change Requests, RACI

| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST | `/spmo/budget` | all/admin | Budget entries |
| GET/POST | `/spmo/procurement` | all/admin | Procurement packages |
| GET/POST | `/spmo/actions` | all | Actions / tasks |
| PUT/DELETE | `/spmo/actions/:id` | all | Update / delete action |
| GET/POST | `/spmo/change-requests` | all | Change requests |
| PUT | `/spmo/change-requests/:id` | admin | Review change request |
| GET/POST | `/spmo/raci` | all | RACI matrix entries |

### Admin & Configuration

| Method | Path | Auth | Description |
|---|---|---|---|
| GET/PUT | `/spmo/programme-config` | admin | Programme-level configuration |
| GET/POST/PUT/DELETE | `/spmo/pillars` | admin | Pillar CRUD |
| GET/POST/PUT/DELETE | `/spmo/initiatives` | admin | Initiative CRUD |
| GET/POST/PUT/DELETE | `/spmo/departments` | admin | Department CRUD |
| POST | `/spmo/ai/validate-evidence` | admin | Run AI evidence quality check |

### My Tasks

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/spmo/my-tasks` | all | Tasks assigned to current user |
| GET | `/spmo/my-tasks/count` | all | Unread task count (for sidebar badge) |

### Pending Approvals

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/spmo/pending-approvals` | admin | Milestones awaiting approval |

---

## 7. Frontend Pages & Routes

| Route | File | Access | Description |
|---|---|---|---|
| `/strategy-pmo/` | `dashboard.tsx` | all | Executive dashboard |
| `/strategy-pmo/pillar-portfolio` | `pillar-portfolio.tsx` | all | Pillar-level portfolio view |
| `/strategy-pmo/department-portfolio` | `department-portfolio.tsx` | all | Department portfolio view |
| `/strategy-pmo/projects` | `projects.tsx` | all | Project list + milestone detail |
| `/strategy-pmo/project/:id` | `project-detail.tsx` | all | Full project detail page |
| `/strategy-pmo/kpis` | `kpis.tsx` | all | KPI scorecard + management |
| `/strategy-pmo/risks` | `risks.tsx` | all | Risk register |
| `/strategy-pmo/progress-proof` | `progress-proof.tsx` | admin | Evidence review + approvals |
| `/strategy-pmo/my-tasks` | `my-tasks.tsx` | all | My assigned tasks |
| `/strategy-pmo/alerts` | `alerts.tsx` | all | System alerts |
| `/strategy-pmo/admin` | `admin.tsx` | admin | System administration |

### Key Frontend Patterns

**Data fetching** — all data is fetched via auto-generated hooks:
```tsx
import { useListSpmoProjects } from "@workspace/api-client-react";
const { data, isLoading } = useListSpmoProjects();
```

**Health status badge** — consistent across all pages:
```tsx
const HEALTH_BADGE_MAP: Record<SpmoHealthStatus, { label: string; className: string }> = {
  on_track:    { label: "On Track",    className: "bg-emerald-100 text-emerald-700" },
  at_risk:     { label: "At Risk",     className: "bg-amber-100 text-amber-700" },
  delayed:     { label: "Delayed",     className: "bg-red-100 text-red-700" },
  completed:   { label: "Completed",   className: "bg-blue-100 text-blue-700" },
  not_started: { label: "Not Started", className: "bg-gray-100 text-gray-500" },
};
```

**Currency** — all monetary values stored in full SAR in the database; divided by 1,000,000 for display:
```tsx
formatCurrency(value / 1_000_000) // → "SAR 18.0M"
```

---

## 8. Environment Variables & Secrets

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Replit) |
| `SESSION_SECRET` | Yes | Express session signing key |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Yes | Replit Object Storage bucket |
| `PRIVATE_OBJECT_DIR` | Yes | Object storage private directory path |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Yes | Object storage public search paths |
| `ANTHROPIC_API_KEY` | Optional | Required only for AI evidence validation feature |
| `PORT` | Auto | Set per-workflow by Replit |
| `NODE_ENV` | Auto | `development` / `production` |

---

## 9. Local Development Setup

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 16 (or Replit environment)

### Steps

```bash
# 1. Install dependencies
pnpm install

# 2. Push schema to database
pnpm --filter @workspace/db run push

# 3. Seed base data (pillars, initiatives, projects, milestones, KPIs, departments)
# The API server runs the seed automatically on first start if tables are empty

# 4. Load test data (risks, budget, procurement, actions, change requests, etc.)
psql "$DATABASE_URL" -f scripts/seed-test-data.sql

# 5. Start API server (port 8080)
pnpm --filter @workspace/api-server run dev

# 6. Start frontend (port 22880 or $PORT)
pnpm --filter @workspace/strategy-pmo run dev

# 7. Regenerate API client (if routes changed)
pnpm --filter @workspace/api-client-react run generate
```

### Database Schema Changes

```bash
# Edit lib/db/src/spmo-schema.ts
# Then push changes:
pnpm --filter @workspace/db run push
```

---

## 10. Deployment

The application is deployed via Replit's deployment platform (`.replit.app` domain).

### Pre-Deployment Checklist

- [ ] All environment secrets set in Replit Secrets panel
- [ ] `DATABASE_URL` points to production database
- [ ] `ANTHROPIC_API_KEY` set (for AI evidence validation)
- [ ] `SESSION_SECRET` is a strong random 64+ character string
- [ ] Object storage bucket configured and accessible
- [ ] Schema pushed: `pnpm --filter @workspace/db run push`
- [ ] Test data loaded (optional): `psql "$DATABASE_URL" -f scripts/seed-test-data.sql`

### Production Notes

- The API server auto-seeds base data on first start if tables are empty
- All file uploads go to Replit Object Storage (not local disk)
- Session store is in-memory by default — consider adding `connect-pg-simple` for production persistence
- The app uses path-based routing: frontend at `/strategy-pmo/`, API at `/api/`

---

## 11. Test Cases for QA

### Authentication
1. **TC-AUTH-01**: Unauthenticated request to `/api/spmo/programme` returns `401`
2. **TC-AUTH-02**: Non-admin user accessing `/strategy-pmo/progress-proof` sees "Admin access required" message
3. **TC-AUTH-03**: After login via Replit OIDC, session persists across page reloads

### Dashboard
4. **TC-DASH-01**: Dashboard loads with pillar health heatmap showing all 9 pillars
5. **TC-DASH-02**: Strategic pillars (3) and Cross-Cutting Enablers (6) are in separate sections
6. **TC-DASH-03**: KPI cards show correct count (10 strategic, 32 operational)
7. **TC-DASH-04**: Projects with future start dates show grey "Not Started" badge (not "On Track")

### Projects & Milestones
8. **TC-PROJ-01**: Project list loads all 100 projects
9. **TC-PROJ-02**: Phase gate milestones (Planning, Tendering, Execution, Closure) appear with blue background and lock icon
10. **TC-PROJ-03**: Deleting a phase gate milestone returns an error (400)
11. **TC-PROJ-04**: Updating milestone progress from 0 → 100 reflects immediately in project progress bar
12. **TC-PROJ-05**: Milestone weight validation: sum of sibling weights cannot exceed 100%
13. **TC-PROJ-06**: Inline milestone title editing saves on blur

### Evidence Upload & Approval
14. **TC-EVID-01**: Uploading a PDF file to a milestone creates an evidence record
15. **TC-EVID-02**: Submitting a milestone without evidence returns a 400 error
16. **TC-EVID-03**: Submitted milestone appears in Progress Proof Centre pending list
17. **TC-EVID-04**: Admin can approve a submitted milestone → status changes to "approved"
18. **TC-EVID-05**: Admin can reject a submitted milestone with a reason → status changes to "rejected"
19. **TC-EVID-06**: AI validation runs and returns quality score (requires ANTHROPIC_API_KEY)

### KPIs
20. **TC-KPI-01**: KPI list loads 42 KPIs (10 strategic, 32 operational)
21. **TC-KPI-02**: Adding a measurement reading appears in the KPI sparkline chart
22. **TC-KPI-03**: KPIs with `direction = 'lower_is_better'` show red when actual > target
23. **TC-KPI-04**: Multi-year target columns (2026–2030) display correctly in the KPI modal

### Risks
24. **TC-RISK-01**: Risk register shows all 15 seeded risks after running seed script
25. **TC-RISK-02**: Creating a new risk with probability "high" and impact "critical" computes risk score 20
26. **TC-RISK-03**: Mitigation can be added to a risk and shows in risk detail

### Budget & Procurement
27. **TC-BUD-01**: Budget page shows allocated vs spent for seeded projects
28. **TC-BUD-02**: Budget chart axes display "SAR" (not USD "$")
29. **TC-PROC-01**: Procurement list shows all 10 seeded packages

### Change Requests
30. **TC-CR-01**: Pending change requests appear in the admin panel
31. **TC-CR-02**: Admin can approve a change request; status updates to "approved"

### My Tasks
32. **TC-TASK-01**: My Tasks page loads actions assigned to the logged-in user
33. **TC-TASK-02**: Sidebar badge shows count of open tasks assigned to current user
34. **TC-TASK-03**: Completing an action updates the status and removes from open count

### Admin
35. **TC-ADM-01**: Admin can create a new pillar and it appears in the dashboard
36. **TC-ADM-02**: Admin can update phase gate default weights in programme config
37. **TC-ADM-03**: Non-admin user cannot access `/strategy-pmo/admin` route

---

## 12. Known Constraints & Notes

- **Replit Auth only**: The OIDC flow is tied to Replit accounts. To deploy externally, replace with a standard OIDC provider (Auth0, Azure AD, etc.).
- **Object Storage**: Replit Object Storage is used for file uploads. For external deployment, replace with AWS S3 or Azure Blob Storage using the same presigned URL pattern.
- **AI Evidence Validation**: Requires `ANTHROPIC_API_KEY`. Without it, the AI validate button will return a 500. The rest of the evidence workflow functions independently.
- **Session persistence**: The default in-memory session store resets on server restart. Add `connect-pg-simple` for production.
- **Budget display**: All monetary values are stored in full SAR (not millions). Display layer divides by 1,000,000. Be careful with any direct DB queries.
- **Phase gate milestones**: Auto-created at project creation time. Their weight defaults come from `spmo_programme_config`. Cannot be deleted via API.

---

*Generated for internal engineering handoff. Questions: contact the PMO digital team.*
