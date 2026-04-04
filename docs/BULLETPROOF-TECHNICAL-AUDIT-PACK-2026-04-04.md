# StrategyPMO Bulletproof Technical Audit Pack (v2)

**Date:** 2026-04-04  
**Audience:** Engineering leads, backend/frontend squads, QA, DevOps, release manager  
**Goal:** Convert the prior executive audit into an implementation-grade hardening package that can be executed by the technical team.

---

## A. Audit Method & Evidence

This pack combines:
1. **Static architecture/code audit** across API routes, engines, frontend app shell, and release docs.
2. **Runtime command verification** for tests and compile gates.
3. **Risk triage** focused on demo-critical reliability and production hardening.
4. **Action backlog** with acceptance criteria.

### Commands run in this v2 pass
- `pnpm --filter @workspace/api-server run test` → PASS (737/737).
- `pnpm --filter @workspace/api-server run test:unit` → PASS but appears to execute full suite (script semantics need review).
- `pnpm --filter @workspace/api-server run test:integration` → FAIL (Vitest CLI option mismatch: `--include` not recognized).
- `pnpm --filter @workspace/api-server run test:e2e` → FAIL (`No test files found`; script conflicts with Vitest exclude/include config).
- `pnpm run typecheck` → FAIL (mobile app compile errors).
- `pnpm --filter @workspace/strategy-pmo run typecheck` → FAIL (web frontend compile errors).

---

## B. System Inventory (Current Codebase)

### B1) Delivery footprint
- **API route declarations (all route modules):** 174
- **SPMO route declarations in main domain file:** 124
- **StrategyPMO web pages (`src/pages/*.tsx`):** 30
- **Mobile screens (`artifacts/mobile-app/app/**/*.tsx`):** 14
- **Analytics/engine modules (`engine-*.ts`):** 11

### B2) Engine inventory
- `engine-predictive-delay`
- `engine-budget-forecast`
- `engine-stakeholder`
- `engine-critical-path`
- `engine-evm`
- `engine-scenario`
- `engine-ai-advisor`
- `engine-board-report`
- `engine-weekly-digest`
- `engine-anomaly`
- `engine-dependency-finder`

### B3) Core platform strengths (validated)
- Security middleware baseline exists (Helmet/CORS/rate-limiting/auth middleware).
- Large backend regression surface (737 tests passing in default suite).
- Mature PMO feature breadth: strategy hierarchy, approvals, risk/budget/procurement, import/export, analytics, and mobile support.
- Weighted progress and 99% gate logic implemented in core calculation engine.

---

## C. Critical Findings (Must Fix for “Bulletproof” Standard)

## C1) Build/Type safety gate is red (P0)
**Status:** FAIL  
**Impact:** release and demo reliability risk, hidden runtime defects, contract drift.

### Frontend/web compile failures observed
- Hook options typing mismatch in layout (`useGetSpmoMyTaskCount` options).
- Invalid or missing arguments in multiple components (`Expected 1 arguments, but got 0`).
- Unknown request fields sent by pages (e.g., `riskAlertThreshold` not in request type).
- Unsafe casts from typed API models to generic records across admin/departments/strategy-map.
- Unresolved symbols in project detail (e.g., `currency`).
- React type incompatibility symptoms in shared UI components (`calendar`, `spinner`).

### Mobile compile failures observed
- `react-native-reanimated` typing mismatch (`SharedValue` export issue).
- Auth request typing mismatch (`nonce` not present on expected type).

**Hard requirement before client UAT handoff:** green `pnpm run typecheck` from repo root.

---

## C2) Test scripts are partially non-functional/misaligned (P0)

### `test:integration` script is broken
- Uses Vitest CLI args (`--include`) that are rejected by current Vitest version.
- Result: command exits with error before executing intended suite.

### `test:e2e` script is broken
- Invokes path filter but config excludes `src/__tests__/e2e/**`, resulting in “No test files found”.

### `test:unit` likely not scoping correctly
- Command passes and reports the full 32-file/737-test set, suggesting exclude strategy no longer reflects intended segmentation.

**Risk:** false confidence in CI labels (unit/integration/e2e) and weak release discipline.

---

## C3) Route/feature complexity concentration risk (P1)

- Main SPMO route module is very large (124 route declarations) and handles broad concerns.
- This raises regression probability, onboarding friction, and difficulty proving comprehensive authorization/validation consistency.

**Mitigation:** phase decomposition by bounded contexts (projects/milestones/risk/kpi/monitoring/admin/access/comments) with dedicated tests per module.

---

## D. Backend Hardening Review

## D1) Security baseline
Current bootstrap indicates key controls are present:
- Security headers middleware.
- CORS origin policy with allowlist behavior.
- Global request throttling.
- Auth middleware in request pipeline.

## D2) Reliability/operational observations
- Health check includes DB probe (good for orchestration readiness).
- Env validation via Zod parse (fast fail on bad config).
- Strong route/test coverage footprint.

## D3) Gaps requiring engineering follow-through
- Validate role enforcement consistency across all write/admin routes with automated matrix test generation (not only manual grep/spot checks).
- Add script-level smoke tests that validate *script behavior itself* (so `test:integration`/`test:e2e` cannot silently rot).

---

## E. Frontend/UI Hardening Review

## E1) Positive structure
- Lazy-loaded route model with suspense.
- Auth and admin route guard patterns.
- Error boundary wrapper at routing shell.
- Navigation model includes PM/admin segmentation, task badge polling, command palette.

## E2) Hardening priorities
1. **Compile cleanup sprint** (strict TS as release gate).
2. **API contract lockstep** (regenerate/reconcile types, remove unsafe casts).
3. **Page-level reliability checks** for admin, departments, project-detail, strategy-map.
4. **Accessibility/usability pass** on modal/forms/error states for demo-critical pages.

---

## F. Engines & Analytics Review

## F1) Maturity
Engine portfolio is broad and aligned to PMO analytics needs. Existing regression suites inspect logic, edge cases, and cross-engine consistency.

## F2) Demo risk interpretation
Primary risk is not lack of engine features; it is integration stability around frontend compile/contracts and test command health.

---

## G. UAT & QA Readiness

## G1) Current position
- Backend runtime tests: green in default run.
- Historical UAT found substantial issues; some fixed, others pending/deferred.

## G2) What’s missing for bulletproof sign-off
- Fresh UAT re-baseline tied to **current commit SHA**.
- Explicit status for each legacy issue: fixed/verified, fixed/not-verified, open/deferred.
- Demo checklist mapped to user roles and critical workflows.

---

## H. “Bulletproof” Release Criteria (Definition of Done)

A release candidate may be marked bulletproof only when all are true:
1. `pnpm run typecheck` passes at repo root.
2. `test`, `test:unit`, `test:integration`, `test:e2e` all execute correctly and match expected scope.
3. No P0/P1 defects open in demo-critical workflows.
4. Role/authorization matrix test coverage is green.
5. Smoke walkthroughs completed for Admin, PM, Approver roles with evidence.
6. Incident rollback and data backup/restore procedure dry-run completed.

---

## I. Prioritized Remediation Plan (7-Day Technical Sprint)

### Day 1–2: Gate Recovery (P0)
- Fix all TS compile failures (web + mobile).
- Repair broken Vitest scripts and validate each scope.
- Freeze dependency versions while gates are repaired.

### Day 3–4: Contract & Route Assurance (P1)
- Remove unsafe frontend casts and align payload types.
- Add route auth/role consistency tests (generated matrix approach).
- Add coverage assertions for admin/access-control endpoints.

### Day 5: Workflow hardening (P1)
- Execute scenario-based smoke scripts (create project, update milestones, submit/approve, generate reports, import template, notification/discussion flow).

### Day 6: UAT re-baseline (P1)
- Re-run and publish updated UAT report with issue-by-issue status.

### Day 7: Demo lock & sign-off (P0)
- Final dress rehearsal with seeded data.
- Capture known limitations and fallback demo path.

---

## J. Demo-Critical Workflow Checklist

- Login/logout and role landing (admin/project-manager/approver).
- Portfolio navigation (Dashboard → Projects → Project Detail).
- Milestone update + submit + approval path with status transitions.
- KPI and risk updates reflected in monitoring/analytics.
- Report export endpoints (PDF/PPTX) success and error behavior.
- Import template download + upload validation flow.
- Notifications/discussion flow including mention behavior.
- Access control update for project-level permissions and enforcement.

---

## K. Technical Owner Assignment Template

Use these default owners per item:
- **API platform squad:** route integrity, auth matrix, script fixes.
- **Web squad:** TS cleanup, contract alignment, UX hardening.
- **Mobile squad:** type fixes, auth-session typing, reanimated compatibility.
- **QA squad:** UAT re-baseline, regression matrix updates.
- **DevOps/release:** CI gates, artifact promotion, rollback rehearsal.

---

## L. Final Recommendation

Proceed with senior-client demo only under one of these tracks:

1. **Track A (Preferred):** 3–7 day hardening sprint to clear P0 gates and rerun UAT.  
2. **Track B (Fallback):** controlled scripted demo using pre-validated paths, while clearly labeling engineering hardening in progress.

For a truly “bulletproof” handoff to the technical team, adopt Track A immediately and use the backlog file in this PR as the implementation board.

