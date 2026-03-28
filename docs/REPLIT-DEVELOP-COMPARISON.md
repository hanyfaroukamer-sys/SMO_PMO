# Replit `develop` Branch vs `main` Branch — Comparison Report

**Date:** 2026-03-28
**Branches compared:** `origin/develop` (Replit's changes) vs `origin/main` (current production)
**Net change:** +1,606 lines added / -7,698 lines removed = **-6,092 net lines deleted**

---

## Executive Summary

Replit's `develop` branch **removes 18 API endpoints, 3 database tables, the entire mobile app, and strips out the permission system, notification system, email reminders, search, caching, and several admin features**. It also reverts the sidebar from a role-based 2-section layout back to a flat 18-item list, removes the command palette and notification bell, and strips Gantt chart features.

Two new seed files were added (`seed-kfca.ts`, `seed-kpis.ts`), and a frontend static-file serving block was added to `app.ts`. These are the only potentially useful additions.

**Recommendation:** Do NOT merge `develop` into `main`. Cherry-pick only the 2 additions if needed.

---

## 1. DELETED — Entire Mobile App (20 files)

| File | Purpose |
|------|---------|
| `artifacts/mobile-app/package.json` | Package config (Expo SDK 52) |
| `artifacts/mobile-app/app.json` | Expo app config |
| `artifacts/mobile-app/babel.config.js` | Babel config |
| `artifacts/mobile-app/metro.config.js` | Metro bundler config |
| `artifacts/mobile-app/README.md` | Setup documentation |
| `artifacts/mobile-app/assets/.gitkeep` | Asset directory |
| `artifacts/mobile-app/tsconfig.json` | TypeScript config |
| `src/app/(tabs)/_layout.tsx` | Tab bar with Ionicons |
| `src/app/(tabs)/index.tsx` | Dashboard with API data |
| `src/app/(tabs)/more.tsx` | Feature grid (KPIs, Risks, Docs) |
| `src/app/(tabs)/projects.tsx` | My Projects (owner-filtered) |
| `src/app/(tabs)/tasks.tsx` | Tasks screen |
| `src/app/(auth)/login.tsx` | OIDC login screen |
| `src/app/_layout.tsx` | Root layout with auth guard |
| `src/app/+not-found.tsx` | 404 screen |
| `src/app/notifications.tsx` | In-app notifications |
| `src/app/documents.tsx` | Document browser |
| `src/app/kpis.tsx` | KPI dashboard |
| `src/app/risks.tsx` | Risk register |
| `src/app/projects/[id].tsx` | Project detail (3 tabs) |
| `src/components/ProgressBar.tsx` | Reusable progress bar |
| `src/components/StatusBadge.tsx` | Status badge component |
| `src/providers/AuthProvider.tsx` | Auth context provider |
| `src/providers/QueryProvider.tsx` | TanStack Query provider |
| `src/utils/api.ts` | API utility with useApi hook |

**Impact:** Complete loss of the React Native executive mobile app.

---

## 2. DELETED — Database Schema Tables (82 lines from `lib/db/src/schema/spmo.ts`)

### 2a. `spmo_comments` table — DELETED
```
- entityType (project | milestone | risk | kpi | initiative)
- entityId, parentId, authorId, authorName, body
- Indexes: idx_comments_entity
```
**Impact:** No in-app discussion threads on projects, milestones, risks, KPIs.

### 2b. `spmo_notifications` table — DELETED
```
- userId, type (comment | approval | assignment | mention | alert)
- title, body, link, read, entityType, entityId
- Indexes: idx_notifications_user
```
**Impact:** No in-app notification system. Bell icon has no backing data.

### 2c. `spmo_project_access` table — DELETED
```
- projectId, userId, userName, userEmail
- grantedById, grantedByName, grantedAt
- 9 permission flags: canEditDetails, canManageMilestones, canSubmitReports,
  canManageRisks, canManageBudget, canManageDocuments, canManageActions,
  canManageRaci, canSubmitChangeRequests
- Unique constraint: (projectId, userId)
- Indexes: project_id, user_id
```
**Impact:** No per-project granular access control. Any PM can edit any project.

### 2d. Department columns — DELETED
```
- headName, headEmail
- taskReminderCcUserId, taskReminderCcName
- weeklyOverdueCcUserId, weeklyOverdueCcName
```
**Impact:** No department head tracking, no per-department CC for email reminders.

### 2e. Programme config fields — DELETED
```
- riskAlertThreshold (default 9)
- reminderDaysAhead (default 3)
- weeklyReportDeadlineHour (default 15)
- weeklyReportCcEmails
```
**Impact:** No configurable risk alerts, email reminder timing, or weekly report CC.

---

## 3. DELETED — 18 API Endpoints (from `artifacts/api-server/src/routes/spmo.ts`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/spmo/milestones/list` | GET | Lightweight milestone query for Gantt (single query vs N+1) |
| `/spmo/comments` | GET | List discussion comments |
| `/spmo/comments` | POST | Create comment |
| `/spmo/comments/:id` | DELETE | Delete comment |
| `/spmo/notifications` | GET | List user notifications |
| `/spmo/notifications/read-all` | POST | Mark all notifications read |
| `/spmo/notifications/:id/read` | POST | Mark single notification read |
| `/spmo/admin/send-reminders` | POST | Trigger email reminders |
| `/spmo/admin/send-weekly-report-reminders` | POST | Trigger weekly report emails |
| `/spmo/search` | GET | Global search (SQL UNION ALL + ILIKE) |
| `/spmo/users/search` | GET | User search for @mentions |
| `/spmo/admin/diagnostics` | GET | System diagnostics data |
| `/spmo/admin/users-access` | GET | User access overview |
| `/spmo/my-project-access` | GET | Current user's project permissions |
| `/spmo/projects/:id/access` | GET | List project access grants |
| `/spmo/projects/:id/access` | POST | Grant project access |
| `/spmo/projects/:id/access/:userId` | PATCH | Update access permissions |
| `/spmo/projects/:id/access/:userId` | DELETE | Revoke project access |

**Impact:** 18 endpoints removed. Comments, notifications, search, email reminders, access control, and diagnostics are all non-functional.

---

## 4. DELETED — Permission System (`checkProjectPerm`)

The `checkProjectPerm()` function (60 lines) was removed entirely. This function:
- Checked 9 granular permission flags per project
- Admin bypass (always allowed)
- Owner check (PM owns project = all permissions)
- Explicit grant lookup for non-owner PMs

**103 permission-related lines** were removed from `project-detail.tsx` frontend as well.

All write endpoints in `spmo.ts` that previously called `checkProjectPerm()` now have **no permission guards** beyond basic auth.

**Impact:** Any authenticated PM can edit/delete any project's milestones, risks, budget, documents, and actions.

---

## 5. DELETED — Performance Optimizations

### 5a. Dashboard overview 60-second cache — REMOVED
```diff
- let _overviewCache: { data: unknown; ts: number } | null = null;
- const OVERVIEW_CACHE_TTL = 60_000;
- if (_overviewCache && Date.now() - _overviewCache.ts < OVERVIEW_CACHE_TTL) {
-   res.json(_overviewCache.data);
-   return;
- }
```
**Impact:** Every dashboard load triggers full `calcProgrammeProgress()` computation. Previously ~1ms cached, now ~160ms+ per request.

### 5b. Milestones batch loading endpoint — REMOVED
The `/spmo/milestones/list` endpoint used a single SQL query. Gantt chart now falls back to `useListSpmoAllMilestones()` which triggers N+1 queries.

### 5c. Search optimization — REMOVED
The SQL UNION ALL search with ILIKE across 5 entity types was removed. No search functionality remains.

---

## 6. DELETED — Frontend Components & Pages

| Component/Page | Lines | Purpose |
|----------------|-------|---------|
| `command-palette.tsx` | 207 | Global Cmd+K search palette |
| `notification-bell.tsx` | 139 | In-app notification bell icon |
| `user-mention-input.tsx` | 172 | @mention autocomplete for comments |
| `use-project-access.ts` (hook) | 181 | Project permission hook |
| `use-unsaved-warning.ts` (hook) | 30 | Unsaved changes warning |
| `status-constants.tsx` | 52 | Status color/label constants |
| `my-projects.tsx` (page) | 251 | PM's own projects page |
| `diagnostics.tsx` (page) | 192 | Admin diagnostics page |
| `pillars-and-initiatives.tsx` (page) | 35 | Combined pillars+initiatives page |
| `financials.tsx` (page) | 34 | Combined budget+procurement page |
| `monitoring.tsx` (page) | 34 | Combined alerts+activity page |

**Impact:** 1,327 lines of UI removed. Key features lost: search, notifications, unsaved change protection, My Projects, admin diagnostics, permission UI.

---

## 7. DELETED — Email Reminder System (`email-reminders.ts`, 338 lines)

Entire file deleted. This contained:
- Milestone due-date email reminders
- Configurable reminder days ahead
- Per-department CC recipients
- Weekly overdue report emails
- Deadline hour configuration

**Impact:** No automated email notifications for overdue milestones or weekly reports.

---

## 8. REVERTED — Sidebar Navigation

### Before (main — role-based 2-section layout):
```
PM Section (7 items):
  Dashboard, My Tasks, My Projects, Projects, KPIs, Risks, Documents

Admin Section (9 items, with divider):
  Strategy Map, Pillars & Initiatives, Financials, Departments,
  Dependencies, Progress Proof, Monitoring, Import Data, Diagnostics
```
- Sidebar collapse state persisted to localStorage
- Task badge with 30s polling interval
- Notification bell in footer
- Command palette search trigger

### After (develop — flat 18-item list):
```
Dashboard, My Tasks, Strategy Map, Pillars & Enablers, Initiatives,
Projects, Progress Proof, Strategic KPIs, Op. KPIs, Budget,
Procurement, Departments, Risks, Documents, Dependencies,
Alerts, Activity Log, Import Strategy
```
- No sidebar collapse persistence
- No notification bell
- No command palette
- No role-based section divider
- Task badge polling interval removed (stale data)
- Pillars & Initiatives split back into separate pages
- Financials split back into Budget + Procurement
- Monitoring split back into Alerts + Activity Log

**Impact:** Sidebar reverted from optimized 15-item grouped layout to flat 18 items. Removed My Projects, Diagnostics. Added back pages that were merged for UX simplicity.

---

## 9. REVERTED — Gantt Chart Features

| Feature | Status |
|---------|--------|
| Annual zoom level | REMOVED |
| Half-Year zoom level | REMOVED |
| Expandable project rows with milestone sub-rows | REMOVED |
| Milestone start dates | REMOVED (only due date kept) |
| Milestone progress on Gantt | REMOVED |
| Lightweight milestones endpoint | REMOVED (N+1 queries restored) |
| Diamond size | Shrunk from 14px to 12px |
| Default zoom | Changed from "Quarter" to "Month" |

---

## 10. REVERTED — Executive Reports (PDF/PPTX)

### Removed from reports:
- Department overview page in PDF (department-level stats, project counts, on-track percentages)
- Department data gathering (department stats computation)
- Weekly reports per project
- 222 lines removed from `reports.ts`

**Impact:** Executive PDF/PPTX reports lose department breakdown section.

---

## 11. REVERTED — Project Detail Page

- 477 lines changed in `project-detail.tsx`
- All `checkProjectPerm` calls removed
- All `canEdit*`, `canManage*`, `canDelete*` permission checks removed
- `useProjectAccess` hook usage removed
- Tab structure potentially reverted from 5-tab to 8-tab layout

**Impact:** Project detail page loses all granular permission enforcement.

---

## 12. MODIFIED — Other Changes

### 12a. Zod schema (`lib/api-zod/src/generated/api.ts`)
```diff
- riskAlertThreshold, reminderDaysAhead, weeklyReportDeadlineHour, weeklyReportCcEmails
```
Removed from `UpdateSpmoConfigBody`. Config API can no longer accept these fields.

### 12b. Bulk import (`bulk-import.ts`)
60 lines changed — unclear if improvements or regressions.

### 12c. Auth route (`auth.ts`)
6 lines changed — minor modification.

### 12d. Seed files
- `seed.ts`: 19 lines changed
- `seed-augment-test-data.sql`: 4 lines changed
- `seed-test-data.sql`: 12 lines changed

### 12e. Documentation — DELETED
- `docs/PRODUCT-REVIEW-V2.md` (122 lines) — Product review document
- `docs/UAT-REPORT.md` (347 lines) — UAT test report
- `docs/UX-ASSESSMENT.md` (405 lines) — UX assessment with 47 recommendations

---

## 13. ADDED — Potentially Useful (2 items)

### 13a. Frontend static serving in `app.ts` (+11 lines)
```typescript
const frontendDir = path.resolve(__dirname, "../../strategy-pmo/dist/public");
app.use("/strategy-pmo", express.static(frontendDir, { maxAge: "1d", etag: true }));
app.get("/strategy-pmo/*", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});
app.get("/", (_req, res) => { res.redirect("/strategy-pmo/"); });
```
**Verdict:** Useful for Docker deployment. Can cherry-pick.

### 13b. New seed files (+1,084 lines)
- `seed-kfca.ts` (469 lines) — KFCA-specific seed data
- `seed-kpis.ts` (615 lines) — KPI seed data

**Verdict:** May be useful for demo environments. Can cherry-pick if needed.

---

## Summary Scorecard

| Category | Items Removed | Severity |
|----------|--------------|----------|
| Mobile app | 20+ files (entire app) | CRITICAL |
| Database tables | 3 tables + 10 columns | CRITICAL |
| API endpoints | 18 endpoints | CRITICAL |
| Permission system | checkProjectPerm + 9 flags | CRITICAL |
| Performance cache | Dashboard 60s cache | HIGH |
| Email reminders | Entire system (338 lines) | HIGH |
| Frontend components | 11 components/pages | HIGH |
| Gantt features | 6 features | MEDIUM |
| Executive reports | Department section | MEDIUM |
| Sidebar layout | Role-based grouping | MEDIUM |
| Documentation | 3 docs (874 lines) | LOW |
| **Total lines removed** | **~7,698** | |
| **Total lines added** | **~1,606** | |
| **Items worth cherry-picking** | **2** | |

---

## Recommendation

1. **Do NOT merge `develop` into `main` or the feature branch** — it removes 90% of the hardening work done across 65+ commits.
2. **Cherry-pick only:**
   - Static file serving block from `app.ts` (11 lines)
   - Seed files if needed for demo (`seed-kfca.ts`, `seed-kpis.ts`)
3. **Notify Replit** that the `develop` branch appears to be an older/stripped version that predates the production hardening work.
