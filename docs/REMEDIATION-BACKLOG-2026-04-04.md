# Remediation Backlog — Technical Hardening

**Date:** 2026-04-04  
**Last re-audit update:** 2026-04-04 (R3)  
**Purpose:** Ticket-ready list derived from the bulletproof audit pack, with current status tracking.

| ID | Priority | Area | Issue | Owner | Status (R3) | Acceptance Criteria |
|---|---|---|---|---|---|---|
| P0-01 | P0 | Build | Root `pnpm run typecheck` fails (web/mobile) | Web + Mobile | OPEN | Root typecheck passes in CI and locally; no TS errors. |
| P0-02 | P0 | Test Tooling | `test:integration` script broken (`--include` unsupported) | API Platform | OPEN | Command executes intended integration subset successfully. |
| P0-03 | P0 | Test Tooling | `test:e2e` script finds no files due include/exclude conflict | API Platform | OPEN | e2e command runs e2e suite and returns non-empty test run. |
| P0-04 | P0 | Test Integrity | `test:unit` appears to run full suite | API Platform + QA | OPEN | Unit command scope documented and validated by file counts. |
| P0-05 | P0 | Frontend | Invalid payload fields in config flows (e.g., unknown request keys) | Web | OPEN | All API writes compile against generated request types without casts. |
| P0-06 | P0 | Frontend | Critical compile errors in admin/departments/project-detail/strategy-map | Web | OPEN | Pages compile clean and smoke test passes for all listed routes. |
| P0-07 | P0 | Mobile | Reanimated/Auth typing mismatches | Mobile | OPEN | Mobile package typecheck passes; auth flow smoke-tested. |
| P1-01 | P1 | API | Route auth/role consistency proof not automated end-to-end | API Platform | OPEN | Add route matrix test asserting auth + role requirement per protected route. |
| P1-02 | P1 | API | Large monolithic `spmo.ts` raises regression risk | API Platform | OPEN | Decomposition plan approved and first extraction PR merged. |
| P1-03 | P1 | Frontend | Unsafe model-to-record casting patterns in several pages | Web | OPEN | Replace unsafe casts with typed guards/mappers; compile + runtime checks pass. |
| P1-04 | P1 | QA/UAT | Historical UAT issue status not re-baselined against latest SHA | QA | IN PROGRESS | Publish UAT re-baseline with fixed/open/deferred and evidence per case. |
| P1-05 | P1 | UX | Error/loading/empty-state consistency on demo-critical pages | Web + QA | OPEN | UX checklist passes on Dashboard, Projects, Project Detail, Monitoring, Analytics. |
| P1-06 | P1 | Release | No explicit bulletproof gate checklist in CI | DevOps | OPEN | CI includes required gates + failure policy before deploy/demo tag. |
| P2-01 | P2 | Observability | Improve structured diagnostics around failing user workflows | API + DevOps | OPEN | Add request correlation + actionable error taxonomy in logs. |
| P2-02 | P2 | Documentation | Route ownership and bounded context docs incomplete | API Platform | OPEN | Publish route ownership map and ADR for module boundaries. |
| P2-03 | P2 | Performance | Add repeatable perf baseline for dashboards/search/import | QA + Web + API | OPEN | Baseline benchmark doc with thresholds and regression alerts. |

## Suggested Sprint Assignment
- **Sprint 1 (Immediate):** P0-01 through P0-07.
- **Sprint 2:** P1-01 through P1-06.
- **Sprint 3:** P2 items and architectural debt.

