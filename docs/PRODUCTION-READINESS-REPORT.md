# StrategyPMO — Production Readiness Report

**Date:** 2026-03-25
**Reviewed by:** Automated deep-code analysis (5 parallel agents)
**Target deployment:** Docker container on GCC government infrastructure, PostgreSQL, Azure AD SSO
**Scope:** Full codebase — backend, frontend, database, security, configuration, dependencies

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 12 | Must fix before production — security holes, data loss risk |
| HIGH | 18 | Should fix before production — reliability and compliance gaps |
| MEDIUM | 25 | Fix soon after launch — quality and maintainability |
| LOW | 15 | Technical debt — address over time |
| **TOTAL** | **70** | |

**Positive note:** The codebase uses parameterized queries (Drizzle ORM) throughout — no SQL injection risk. OIDC auth uses PKCE+nonce+state correctly. Session IDs use 32-byte crypto random. Pino logger redacts auth headers. Zod validation is applied on most endpoints.

---

## CRITICAL Issues (Must Fix Before Production)

### CRIT-01: CORS allows ALL origins with credentials
- **File:** `artifacts/api-server/src/app.ts`, line 31
- **Code:** `cors({ credentials: true, origin: true })`
- **Impact:** Any website on the internet can make authenticated API requests on behalf of a logged-in user. This is a full CSRF bypass for a government system handling budgets and programme data.
- **Fix:** Replace `origin: true` with an explicit allowlist of trusted domains (the frontend URL).

### CRIT-02: No security headers (Helmet missing)
- **File:** `artifacts/api-server/src/app.ts`
- **Impact:** Missing `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`. GCC government compliance requires these.
- **Fix:** Install `helmet` and add `app.use(helmet())` before other middleware.

### CRIT-03: No rate limiting on any endpoint
- **File:** `artifacts/api-server/src/app.ts`
- **Impact:** AI endpoints (`/spmo/ai/assessment`, `/spmo/ai/validate-evidence`, `/spmo/import/analyse`) call the paid Anthropic API with zero throttling. Auth endpoints are unprotected from brute force. A single attacker can exhaust API budgets or DoS the system.
- **Fix:** Add `express-rate-limit` globally, with stricter limits on auth and AI endpoints.

### CRIT-04: Dependency routes have ZERO authentication
- **File:** `artifacts/api-server/src/routes/dependencies.ts`, ALL endpoints
- **Impact:** Any unauthenticated user can create, delete, or query all dependency relationships. An attacker can disrupt programme workflows by injecting false blockers or removing real ones.
- **Fix:** Add `requireAuth()` to every handler. Add role checks for POST/DELETE.

### CRIT-05: Multiple SPMO routes missing authentication
- **File:** `artifacts/api-server/src/routes/spmo.ts`
- **Affected endpoints (no auth check):**
  - `GET /spmo/projects/:id/weekly-report` (line 2688)
  - `GET /spmo/projects/:id/weekly-report/history` (line 2774)
  - `GET /spmo/change-requests` (line 2792)
  - `GET /spmo/change-requests/:id` (line 2802)
  - `GET /spmo/raci` (line 2888)
  - `GET /spmo/documents` (line 2954)
  - `GET /spmo/documents/:id` (line 2964)
  - `GET /spmo/actions` (line 3038)
- **Impact:** Sensitive government programme data exposed to anyone who can reach the API.
- **Fix:** Add `requireAuth()` to every endpoint.

### CRIT-06: Import "replace" mode can wipe ALL data without admin check
- **File:** `artifacts/api-server/src/routes/import.ts`, lines 397-515
- **Impact:** Any authenticated user (including a viewer) can call `/spmo/import/save` with `mode: "replace"`, which deletes ALL pillars (cascading to initiatives, projects, milestones, evidence) and ALL KPIs. No role check, no confirmation.
- **Fix:** Require `admin` role. Add a confirmation mechanism. Wrap in a database transaction.

### CRIT-07: Zero database transactions for multi-step mutations
- **Files:** Multiple routes throughout `spmo.ts`, `import.ts`, `dependencies.ts`, `milestones.ts`
- **Impact:** Critical multi-step operations are not atomic:
  - Import/save creates dozens of records across 5+ tables — partial failure leaves inconsistent state
  - Approve milestone + log activity + recalculate deps — if recalc fails, milestone is approved but deps are stale
  - Create project + insert 4 phase-gate milestones — partial failure leaves project without milestones
  - Bulk milestone weight update — failure mid-loop leaves weights inconsistent
- **Fix:** Wrap all multi-step mutations in `db.transaction(async (tx) => { ... })`.

### CRIT-08: No database indexes on any foreign key column
- **File:** `lib/db/src/schema/spmo.ts`
- **Impact:** The only index in the entire schema is `IDX_session_expire`. All FK columns used in WHERE/JOIN lack indexes. With 50+ projects and 500+ milestones, every list endpoint does full table scans. This will cause severe performance degradation in production.
- **Key columns needing indexes:** `spmo_milestones.project_id`, `spmo_projects.initiative_id`, `spmo_initiatives.pillar_id`, `spmo_evidence.milestone_id`, `spmo_kpis.pillar_id`, `spmo_kpis.project_id`, `spmo_risks.pillar_id`, `spmo_dependencies.source_id`, `spmo_dependencies.target_id`, `spmo_activity_log.created_at`
- **Fix:** Add B-tree indexes on all FK columns and frequently filtered columns.

### CRIT-09: `.gitignore` missing `.env` files
- **File:** `.gitignore`
- **Impact:** If anyone creates a `.env` file with `DATABASE_URL`, `ANTHROPIC_API_KEY`, or Azure AD secrets, it will be committed to the repository. For GCC government deployment, this is a compliance violation.
- **Fix:** Add `.env`, `.env.*`, `!.env.example` to `.gitignore`.

### CRIT-10: 69MB of archive files tracked in git
- **Files:** `strategy-pmo-workspace.tar.gz` (39MB), `strategyPMO-deploy.tar.gz` (25MB), `strategy-pmo.zip` (5MB)
- **Impact:** Every clone downloads 69MB of stale archives. Bloats the Docker image and CI pipeline.
- **Fix:** `git rm --cached` these files. Add `*.tar.gz` and `*.zip` to `.gitignore`.

### CRIT-11: `xlsx` package has known CVEs
- **Files:** `artifacts/api-server/package.json`, `artifacts/strategy-pmo/package.json`
- **Impact:** `xlsx@^0.18.5` (SheetJS community edition) has known prototype pollution vulnerabilities (CVE-2023-30533). Used in both server and client for import/export.
- **Fix:** Replace with `exceljs` or a maintained alternative.

### CRIT-12: Session cookie `sameSite: "none"` enables CSRF
- **File:** `artifacts/api-server/src/routes/auth.ts`, lines 50-56
- **Impact:** Combined with the wildcard CORS (CRIT-01), any website can forge authenticated requests using the user's session cookie.
- **Fix:** Change `sameSite: "none"` to `sameSite: "lax"` after fixing CORS origin.

---

## HIGH Issues (Should Fix Before Production)

### HIGH-01: Missing role checks on all write operations
- **File:** `artifacts/api-server/src/routes/spmo.ts`
- **Impact:** Any authenticated user can create/update/delete KPIs, risks, budget entries, procurement records, milestones, evidence, documents, RACI assignments, and action items. No role or ownership verification.
- **Fix:** Add role-based authorization (admin/project-manager) for all write/delete endpoints.

### HIGH-02: Auth hardcoded to Replit — not configurable for Azure AD
- **Files:** `artifacts/api-server/src/lib/auth.ts` (line 8, 25), `artifacts/api-server/src/routes/auth.ts` (line 232)
- **Impact:** `ISSUER_URL` defaults to `replit.com/oidc`. `REPL_ID` used as OIDC client ID with non-null assertion (`!`). For GCC government deployment with Azure AD SSO, these must be fully configurable.
- **Fix:** Make `ISSUER_URL`, `CLIENT_ID`, and `CLIENT_SECRET` required env vars with startup validation. Remove Replit-specific defaults for production.

### HIGH-03: N+1 query patterns on nearly every list endpoint
- **Files:** `spmo.ts`, `initiatives.ts`, `milestones.ts`, `dependencies.ts`, `spmo-calc.ts`
- **Impact:** Key examples:
  - `GET /spmo/milestones/all`: 4 queries per milestone (evidence + project + initiative + pillar). 200 milestones = 800+ queries.
  - `GET /spmo/programme` (dashboard): cascading N+1 through pillars -> initiatives -> projects -> milestones. 500+ queries.
  - `GET /spmo/dependencies`: up to 4 queries per dependency for name resolution.
- **Fix:** Use JOINs, batch `inArray()` queries, or eager-load related entities.

### HIGH-04: No Error Boundary wrapping the app
- **File:** `artifacts/strategy-pmo/src/App.tsx`
- **Impact:** Only the Dashboard page has an `ErrorBoundary`. Any runtime error on other pages (projects, KPIs, budget, admin, etc.) crashes the entire app with a white screen and no recovery.
- **Fix:** Wrap `<Switch>` in `App.tsx` with `<ErrorBoundary>`.

### HIGH-05: No code splitting — all 21 pages loaded eagerly
- **File:** `artifacts/strategy-pmo/src/App.tsx`, lines 9-31
- **Impact:** Every page (including heavy ones with recharts, framer-motion, xlsx) is statically imported. Initial JS bundle is likely 2MB+.
- **Fix:** Use `React.lazy()` + `<Suspense>` for route-level code splitting.

### HIGH-06: Custom Modal lacks accessibility (a11y)
- **File:** `artifacts/strategy-pmo/src/components/modal.tsx`
- **Impact:** No focus trap, no `aria-modal`, no `role="dialog"`, no Escape key handling. Users can Tab to elements behind the modal. Screen readers cannot identify it as a dialog. GCC government apps typically require WCAG 2.1 AA.
- **Fix:** Add focus trap, ARIA attributes, and Escape key handler. Or replace with the existing Radix `Dialog` component.

### HIGH-07: No source maps for production builds
- **Files:** `artifacts/strategy-pmo/vite.config.ts`, `artifacts/api-server/build.ts`
- **Impact:** Production stack traces reference minified/bundled code. Debugging incidents on GCC infrastructure will be extremely difficult.
- **Fix:** Add `build: { sourcemap: 'hidden' }` to Vite config. Add `sourcemap: true` to esbuild config.

### HIGH-08: `strictFunctionTypes: false` in TypeScript config
- **File:** `tsconfig.base.json`, line 15
- **Impact:** Disables contravariant checking of function parameter types. Can mask runtime bugs in callback-heavy Express/React code.
- **Fix:** Set `strictFunctionTypes: true`. Address resulting type errors.

### HIGH-09: No `.env.example` documenting required environment variables
- **Impact:** The project requires: `DATABASE_URL`, `PORT`, `REPL_ID` (-> `CLIENT_ID`), `ISSUER_URL`, `ANTHROPIC_API_KEY`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, `BASE_PATH`, `LOG_LEVEL`, `FORCE_RESEED`. None documented.
- **Fix:** Create `.env.example` with all required/optional vars and descriptions.

### HIGH-10: No env var validation at startup
- **File:** `artifacts/api-server/src/index.ts`
- **Impact:** Only `PORT` and `DATABASE_URL` validated. `REPL_ID` uses `!` non-null assertion — crashes on first login if unset. `PRIVATE_OBJECT_DIR` crashes on first upload. `ANTHROPIC_API_KEY` crashes on first AI call.
- **Fix:** Create a single `env.ts` module validating all env vars at startup using Zod.

### HIGH-11: OIDC state stored in-memory Map
- **File:** `artifacts/api-server/src/routes/auth.ts`, line 32
- **Impact:** Multi-instance deployment (required for HA in government) will fail OIDC flows. No size limit on the Map — DoS risk.
- **Fix:** Move OIDC state to the database or Redis.

### HIGH-12: Host header injection in OIDC redirect URI
- **File:** `artifacts/api-server/src/routes/auth.ts`, lines 42-47
- **Impact:** `getOrigin()` trusts `x-forwarded-proto` and `x-forwarded-host` headers. An attacker can redirect OIDC callbacks to a controlled domain.
- **Fix:** Validate forwarded host against an allowlist, or set origin from a trusted env var.

### HIGH-13: First user auto-promoted to admin
- **File:** `artifacts/api-server/src/routes/auth.ts`, lines 96-111
- **Impact:** On fresh deployment or DB reset, the first person to authenticate becomes admin. On GCC infrastructure, this could be an unauthorized user.
- **Fix:** Use an env var or seed script to designate the initial admin.

### HIGH-14: No file type validation on import upload
- **File:** `artifacts/api-server/src/routes/import.ts`, lines 19-22
- **Impact:** Multer accepts any file type with a 50MB limit. Malicious files disguised as PDFs could exploit parsing library vulnerabilities.
- **Fix:** Add `fileFilter` restricting to `.pdf`, `.xlsx`, `.csv`, `.docx`, `.pptx` MIME types.

### HIGH-15: Missing foreign key references on KPI, Risk, Budget tables
- **File:** `lib/db/src/schema/spmo.ts`
- **Impact:** `spmoKpisTable.projectId/pillarId`, `spmoRisksTable.projectId/pillarId`, `spmoBudgetTable.projectId/pillarId` are bare `integer()` with no `.references()`. Orphaned records accumulate when projects/pillars are deleted.
- **Fix:** Add `.references()` with `onDelete: "set null"`.

### HIGH-16: `real` (float32) used for financial data
- **File:** `lib/db/src/schema/spmo.ts`, lines 131-135, 417-418, 455
- **Impact:** Budget, budgetCapex, budgetOpex, budgetSpent, contractValue, allocated, spent are all `real()`. Government budgets in hundreds of millions SAR will have rounding errors.
- **Fix:** Use `numeric("budget", { precision: 15, scale: 2 })`.

### HIGH-17: `drizzle-kit push` instead of proper migrations
- **File:** `lib/db/package.json`, lines 11-12
- **Impact:** No migration files exist. `push` directly applies schema changes without review. `push-force` can drop columns/tables. No rollback capability. Not suitable for production.
- **Fix:** Switch to `drizzle-kit generate` + `drizzle-kit migrate`. Store migration files in version control.

### HIGH-18: Runtime error overlay ships to production
- **File:** `artifacts/strategy-pmo/vite.config.ts`, line 29
- **Impact:** `@replit/vite-plugin-runtime-error-modal` is not gated behind `NODE_ENV !== "production"`. Exposes internal error details to end users.
- **Fix:** Move inside the development-only conditional block.

---

## MEDIUM Issues (Fix Soon After Launch)

### MED-01: No pagination on most list endpoints
- `GET /spmo/projects`, `/initiatives`, `/pillars`, `/risks`, `/kpis`, `/alerts`, `/budget`, `/procurement`, `/milestones/all`, `/documents`, `/actions`, `/change-requests` all return ALL records.

### MED-02: Approve milestone endpoint doesn't verify status is "submitted"
- **File:** `spmo.ts`, lines 1189-1193. Can approve pending or rejected milestones directly.

### MED-03: Programme progress uses simple average instead of weighted
- **File:** `spmo-calc.ts`, line 237. All pillars equally weighted despite having a `weight` field.
- **Note:** Per project context, computation engines are verified. Flag for discussion only if weighted rollup was intended.

### MED-04: IDOR — no ownership scoping on resource endpoints
- Any authenticated user can read/modify any resource by iterating sequential IDs.

### MED-05: `console.log` used instead of structured logger in 18+ locations
- **Files:** `import.ts`, `dependencies.ts`, `spmo.ts`. Bypasses pino log format and redaction rules.

### MED-06: Expired sessions never cleaned up proactively
- Sessions table grows unbounded. Only individually cleaned on access.

### MED-07: Connection pool has no configuration
- **File:** `lib/db/src/index.ts`. Default 10 connections, no idle/connection timeout, no statement_timeout.

### MED-08: AI error responses leak internal details
- **File:** `spmo.ts`, line 2165. `detail: errMsg` returns raw Anthropic error messages to client.

### MED-09: AI prompt injection via user-supplied "guidance" field
- **File:** `import.ts`, lines 271-306. User guidance concatenated directly into Claude prompt.

### MED-10: AI JSON responses parsed without Zod validation
- **Files:** `spmo.ts` lines 2147-2153, `import.ts` lines 341-368. Raw `JSON.parse()` trusted without schema validation.

### MED-11: Missing ARIA labels across all interactive elements
- Only 1 `role=` and 0 `aria-label` attributes found across all page components. WCAG non-compliant.

### MED-12: `confirm()` used for destructive actions
- Native `window.confirm()` in `projects.tsx`, `kpis.tsx`, `risks.tsx`, `budget.tsx`, etc. Not accessible, not stylable.

### MED-13: No mobile-responsive sidebar
- **File:** `artifacts/strategy-pmo/src/components/layout.tsx`. Fixed 210px sidebar with no hamburger toggle. `useIsMobile` hook exists but is unused.

### MED-14: Duplicate evidence panel code across 3 files
- `projects.tsx`, `project-detail.tsx`, `progress-proof.tsx` have near-identical evidence upload/approve logic.

### MED-15: Missing form validation (client-side)
- Forms rely only on HTML `required`. No Zod validation for numeric ranges, date logic (end > start), weight totals, or string lengths. Negative budgets and past due dates accepted.

### MED-16: `Number(req.params.id)` without NaN check on newer routes
- **File:** `spmo.ts`, lines 2803, 2843, 2878, 2933, etc. Returns 500 instead of 400 for invalid IDs.

### MED-17: Dependency uniqueness constraint ignores type
- **File:** `spmo.ts` schema, line 723. `unique(sourceId, targetId)` doesn't include `sourceType`/`targetType`. Milestone ID=5 -> Project ID=10 conflicts with Project ID=5 -> Milestone ID=10.

### MED-18: Race condition on project code generation during import
- `nextCodeNum` derived from count before insert loop. Concurrent imports generate duplicate codes.

### MED-19: `$onUpdate` only works in Drizzle ORM, not at DB level
- Direct SQL, migrations, or other clients won't trigger `updatedAt` updates.

### MED-20: Dates stored as `text` in legacy initiatives table
- **File:** `lib/db/src/schema/initiatives.ts`, lines 51-52. SPMO tables correctly use `date()`.

### MED-21: Timestamps missing `withTimezone: true` in legacy initiatives table
- Mixing `timestamptz` and `timestamp` in the same database causes timezone bugs.

### MED-22: Dead workspace glob in pnpm config
- `lib/integrations/*` matches nothing. Package picked up by `lib/*` instead.

### MED-23: Phantom dependencies in esbuild allowlist
- **File:** `artifacts/api-server/build.ts`. 19 packages listed that don't exist in `package.json`.

### MED-24: No health check endpoint for DB connectivity
- Load balancers and Kubernetes readiness probes need a `/health` endpoint.

### MED-25: Singleton `spmoProgrammeConfigTable` has no CHECK constraint
- `id: integer().primaryKey().default(1)` doesn't prevent inserting id=2.

---

## LOW Issues (Technical Debt)

### LOW-01: `TOAST_REMOVE_DELAY = 1000000` (16.7 minutes) — likely copy-paste from template
### LOW-02: Gantt chart `TODAY` constant computed at module load — stale after midnight
### LOW-03: `useIsMobile` returns `false` on first render (flash of desktop layout on mobile)
### LOW-04: NotFound page hardcodes `bg-gray-50` instead of theme tokens
### LOW-05: Duplicate `calcPlannedProgress` function in 4 files
### LOW-06: Duplicate `fileIcon` helper in 2 files
### LOW-07: `target="_blank"` links missing explicit `noopener` alongside `noreferrer`
### LOW-08: Admin route has no route-level guard (component-level only — admin API queries fire before check)
### LOW-09: Denormalized name columns (`ownerName`, `assigneeName`, etc.) — stale if user renames
### LOW-10: `conversations` and `messages` schemas not exported from `lib/db` index
### LOW-11: Missing UNIQUE constraints on `initiative_code` and `project_code`
### LOW-12: No graceful shutdown handler (SIGTERM/SIGINT)
### LOW-13: `@types/pdfkit` in production dependencies instead of devDependencies
### LOW-14: Radix UI version divergence between strategy-pmo and mockup-sandbox
### LOW-15: `runPhaseGateMigration()` runs on every server start instead of once

---

## Positive Practices Observed

1. **Parameterized queries** — Drizzle ORM used consistently; no raw SQL string concatenation in production routes
2. **OIDC with PKCE + nonce + state** — Auth flow follows best practices
3. **Cryptographically random session IDs** — 32-byte `crypto.randomBytes()`
4. **Zod validation** — Applied on most endpoint request bodies
5. **Log redaction** — Pino logger redacts `authorization` and `cookie` headers
6. **Safe return-to URL** — `getSafeReturnTo` function prevents open redirect attacks
7. **Session expiry** — 7-day TTL with proper expiry checking
8. **Upload intent system** — Legacy attachment flow uses intents with expiry
9. **Activity logging** — Most SPMO mutations log to `spmo_activity_log`

---

## Recommended Remediation Priority

### Phase 1 — Security (Block deployment until complete)
1. Fix CORS origin whitelist (CRIT-01)
2. Add `helmet` middleware (CRIT-02)
3. Add rate limiting (CRIT-03)
4. Add auth to all unprotected routes (CRIT-04, CRIT-05)
5. Add role checks to import save (CRIT-06) and all write endpoints (HIGH-01)
6. Fix session cookie `sameSite` (CRIT-12)
7. Add `.env` to `.gitignore` (CRIT-09)
8. Make auth configurable for Azure AD (HIGH-02)

### Phase 2 — Data Integrity (Complete before go-live)
9. Add database transactions to multi-step mutations (CRIT-07)
10. Add database indexes on all FK columns (CRIT-08)
11. Switch to migration-based schema management (HIGH-17)
12. Fix `real` -> `numeric` for financial columns (HIGH-16)
13. Add missing foreign key references (HIGH-15)
14. Validate all env vars at startup (HIGH-10)

### Phase 3 — Performance and Reliability (Complete within first sprint)
15. Fix N+1 query patterns on critical endpoints (HIGH-03)
16. Add Error Boundary at app root (HIGH-04)
17. Add route-level code splitting (HIGH-05)
18. Configure connection pool (MED-07)
19. Add pagination to list endpoints (MED-01)
20. Add health check endpoint (MED-24)

### Phase 4 — Quality and Compliance (Complete within first month)
21. Fix accessibility (modal focus trap, ARIA labels) (HIGH-06, MED-11)
22. Replace `confirm()` with accessible dialogs (MED-12)
23. Add client-side form validation (MED-15)
24. Replace `xlsx` with maintained alternative (CRIT-11)
25. Remove 69MB archive files from git (CRIT-10)
26. Add source maps (HIGH-07)

---

*Report generated from automated deep-code analysis of all 226 source files across the monorepo.*
