# StrategyPMO — Product UX Assessment & Improvement Roadmap

**Prepared by:** Product Principal (Claude)
**Date:** 2026-03-27
**Scope:** Complete frontend audit across 22 pages, 19 nav items, 8 project detail tabs, 25+ modals
**Benchmark:** Industry-leading PMO tools (MS Project, Smartsheet, Monday.com, Planview, ServiceNow SPM)

---

## Executive Summary

StrategyPMO is a **feature-rich, government-grade PMO dashboard** with strong data modeling and computation engines. However, the UX has evolved organically, resulting in **navigation fragmentation, role confusion, and cognitive overload** for both PMs and admins. This assessment identifies **47 improvements** across 6 categories, prioritized by impact.

---

## 1. INFORMATION ARCHITECTURE — Critical Restructure Needed

### Problem: Too many top-level nav items (19 items)

Industry leaders use **5-7 top-level items** with contextual sub-navigation. StrategyPMO's sidebar has 19 items, many of which are context-dependent views of the same data.

### Recommended Navigation Restructure

**For Project Managers (7 items):**
```
📊 Dashboard           → Programme overview (unchanged)
📋 My Tasks            → Personal task center (with badge)
📁 My Projects         → PM portfolio view (new page, done)
🗂️ All Projects        → Full project list (existing /projects)
📈 KPIs                → Both strategic + operational (merged)
⚠️ Risks               → Risk register (unchanged)
📄 Documents           → Document repository (unchanged)
```

**For Admins/PMO Directors (add these below a divider):**
```
── PMO Administration ──
🏗️ Strategy Map         → Strategy house visualization
🏛️ Pillars & Initiatives → Merged into single page with tabs
💰 Budget & Procurement  → Merged into single financial view
🔔 Alerts & Activity     → Merged into single monitoring view
📥 Import Data           → Strategy + bulk import
🏢 Departments           → Department management
⚙️ Admin                 → Users, settings, access control
```

### What to merge:

| Current (separate pages) | Proposed (merged) | Rationale |
|--------------------------|-------------------|-----------|
| Strategic KPIs + Op. KPIs | **KPIs** (tab toggle) | Same data model, just filtered by type. One page with a tab/toggle saves a nav slot. |
| Pillars + Initiatives | **Pillars & Initiatives** (tabs) | Always edited together. Admin-only. |
| Budget + Procurement | **Financials** (tabs: Budget / Procurement) | Both are financial views, admin-only. |
| Alerts + Activity Log | **Monitoring** (tabs: Alerts / Activity) | Both are admin dashboards about system health. |
| Progress Proof + Approvals in My Tasks | **Remove Progress Proof page** — approvals already in My Tasks + project detail milestone tab. Duplicated view. |
| Dependencies (standalone page) | **Move into project detail as a tab** — dependencies are per-project context. A standalone page is a dead end. |

**Result:** 19 nav items → ~12, with clear PM vs Admin sections.

---

## 2. ROLE-BASED EXPERIENCE — Two Distinct Journeys

### Problem: PMs and Admins see the same sidebar

A PM logging in sees 11 items (after admin-only filtering), including KPIs, Departments, Dependencies — pages where they have limited actions. This creates decision fatigue.

### Recommended Persona Flows

**Project Manager Daily Flow:**
```
Login → My Tasks (what needs attention NOW)
      → My Projects (portfolio of owned projects)
      → Click project → Project Detail (8 tabs: all editing here)
      → Back to My Tasks when done
```
The PM rarely needs to visit other pages. Their world is: tasks, projects, update progress, submit evidence.

**Admin/PMO Director Daily Flow:**
```
Login → Dashboard (programme-wide health at a glance)
      → Alerts (what's going wrong?)
      → Click alert → drill into project/KPI/risk
      → Strategy Map (big picture review)
      → Budget/Procurement (financial health)
      → Activity Log (audit trail)
```

### Implementation: Role-aware sidebar ordering

Instead of two completely different menus (confusing), **reorder and emphasize** based on role:

- **PM:** My Tasks and My Projects at top, larger icons, bold text. Admin items hidden.
- **Admin:** Dashboard and Alerts at top. My Tasks/Projects still visible but de-emphasized (admin may also own projects).

---

## 3. PROJECT DETAIL — The Core Work Surface (8 tabs → streamline)

### Problem: 8 tabs is too many

Project detail has: Overview, Milestones, Weekly Report, Risks, Changes, RACI, Actions, Documents. This is **cognitive overload**. Users don't know which tab to click.

### Recommended Tab Restructure (8 → 5 tabs)

| New Tab | Contains | Rationale |
|---------|----------|-----------|
| **Overview** | Project summary, health status, key dates, budget, owner, department. **Add:** mini milestone progress bar, top 3 risks summary, this week's report status | The "command center" — everything at a glance |
| **Milestones** | Milestone table, evidence upload, approval workflow, Gantt chart toggle, **Add:** dependency indicators inline | Core PM workflow — keep focused |
| **Risks & Actions** | Risks + mitigations + action items (merged) | Risks generate actions. Showing them together creates natural workflow: "risk → mitigation → action item → assignee" |
| **Reports & Changes** | Weekly reports + change requests (merged) | Both are status communication artifacts |
| **Team & Docs** | RACI matrix + Documents (merged) | Both are reference material, not daily workflow |

### Additional project detail improvements:

- **Add breadcrumb:** `Dashboard > Customer Experience > Border Crossing Experience > Trusted Traveler Program`
- **Add "Previous/Next project" arrows** at top (like email clients) for admins reviewing multiple projects
- **Add quick-action floating bar** at bottom: "Update Progress" | "Upload Evidence" | "Submit Report" — always visible regardless of tab

---

## 4. DASHBOARD — Good But Needs Hierarchy

### Current state:
The dashboard shows programme progress, project status pie, initiative grid, department overview, KPI highlights, budget summary, and activity feed. This is comprehensive but flat.

### Recommended improvements:

**a) Add "Attention Required" section at top:**
- Show count of: overdue milestones, high-score risks, delayed projects, pending approvals
- Each is clickable → navigates to filtered view
- This replaces the need to visit the Alerts page separately

**b) Add role-conditional content:**
- **PM sees:** "My Projects Summary" widget (mini version of My Projects page) + "My Tasks" widget
- **Admin sees:** Programme-wide health + all the current widgets

**c) Add sparklines/trends:**
- Programme progress: show 4-week trend line (not just current %)
- Budget burn: show monthly burn rate trend
- KPI health: show how many improved/declined vs last period

**d) Add "Quick Actions" card:**
- "Submit Weekly Report" (if due)
- "Review Pending Approvals" (if any)
- "Update Milestone Progress" (link to My Projects)

---

## 5. MICRO-UX IMPROVEMENTS — Polish That Matters

### a) Missing breadcrumbs everywhere
- Currently: user clicks project → no context of where they are
- Add: `Pillar > Initiative > Project` breadcrumb on project detail, department portfolio, pillar portfolio

### b) Empty states need action guidance
- Current empty states say "No items" — should say "No items. Click + to add your first [item]" with a CTA button

### c) Inline editing affordance
- Budget fields use click-to-edit but there's no visual indicator (pencil icon, dashed border)
- Add: hover shows pencil icon, dashed border on editable cells

### d) Confirmation dialogs for destructive actions
- Deleting projects, milestones, risks should show impact: "This will also delete 5 milestones and 12 evidence files. Continue?"

### e) Toast notifications for success
- After saving, show brief toast: "Project updated" / "Milestone submitted for approval"
- Currently some actions silently succeed

### f) Loading skeletons instead of spinners
- Replace `<Loader2 spinning>` with skeleton loaders (gray pulsing rectangles matching content layout)
- Feels faster and maintains layout stability

### g) Keyboard shortcuts
- `Cmd+K` / `Ctrl+K`: Global search (search across projects, milestones, KPIs, risks by name)
- `N`: New item (context-sensitive: new project on projects page, new milestone on detail page)
- `?`: Show keyboard shortcut help

### h) Global search
- Currently NO global search exists. Must navigate to each page and use page-specific filters.
- Add command palette (Cmd+K) that searches across all entities: projects, milestones, KPIs, risks, documents

---

## 6. VISUAL DESIGN IMPROVEMENTS

### a) Status colors — standardize across all pages
Currently each page has slightly different color definitions for status. Standardize:
```
on_track:    #16a34a (green-600)     — consistent everywhere
at_risk:     #f59e0b (amber-500)
delayed:     #ef4444 (red-500)
completed:   #2563eb (blue-600)
not_started: #94a3b8 (slate-400)
on_hold:     #6b7280 (gray-500)
```

### b) Card density — too much whitespace on desktop
- Current cards have generous padding (p-5 md:p-6)
- For list views with 20+ items, offer a "compact view" toggle that reduces padding and font size

### c) Progress bar improvements
- Add planned progress marker (vertical line showing where progress should be)
- Current ProgressBar has this in ui-elements but not all pages use it

### d) Typography hierarchy
- Page titles: 24px bold
- Section titles: 16px semibold
- Card titles: 14px semibold
- Body text: 14px regular
- Metadata: 12px muted
- Currently inconsistent across pages

---

## 7. STRATEGY MAP — The Crown Jewel (Needs Interactivity)

### Current state:
Beautiful "Strategy House" visualization but **static** — no drill-down, no click-through, no filtering.

### Recommended improvements:

- **Click pillar** → navigate to pillar portfolio page
- **Click initiative** → expand to show projects inline (accordion)
- **Click project pill** → navigate to project detail
- **Hover initiative** → tooltip with: progress %, project count, budget, owner
- **Add RAG status dots** next to each initiative name (red/amber/green)
- **Add filter:** "Show only at-risk" toggle that fades out healthy items
- **Add "Print view"** button for board presentations

---

## 8. PRIORITY IMPLEMENTATION ROADMAP

### Phase 1 — Quick Wins (1-2 days, high impact)
1. Merge Strategic + Operational KPIs into one page with tab toggle
2. Add breadcrumbs to project detail page
3. Add global search command palette (Cmd+K)
4. Add "Attention Required" section to dashboard top
5. Standardize status colors across all pages
6. Add empty state CTAs with action buttons
7. Fix PM sidebar: reorder to put My Tasks + My Projects first

### Phase 2 — Navigation Restructure (3-5 days)
8. Merge Pillars + Initiatives into one page
9. Merge Budget + Procurement into Financials page
10. Merge Alerts + Activity into Monitoring page
11. Move Dependencies into project detail tab
12. Remove standalone Progress Proof page (redundant with My Tasks)
13. Add admin section divider in sidebar
14. Add role-conditional dashboard widgets

### Phase 3 — Project Detail Overhaul (3-5 days)
15. Restructure 8 tabs → 5 tabs
16. Add Overview tab with mini risk/milestone/report summaries
17. Merge Risks + Actions tab
18. Merge Reports + Changes tab
19. Merge RACI + Documents tab
20. Add floating quick-action bar at bottom
21. Add previous/next project navigation

### Phase 4 — Polish & Delight (2-3 days)
22. Loading skeletons instead of spinners
23. Keyboard shortcuts (Cmd+K, N, ?)
24. Inline edit affordance (hover pencil icons)
25. Confirmation dialogs with impact preview
26. Strategy Map interactivity (click drill-down)
27. Progress bar with planned progress marker on all pages
28. Compact/comfortable view toggle for list pages

---

## APPENDIX A: CURRENT PAGE INVENTORY

| # | Page | Route | Role | Nav Items | Issues |
|---|------|-------|------|-----------|--------|
| 1 | Dashboard | / | All | 1 | Flat layout, no role-conditional content |
| 2 | My Tasks | /my-tasks | All | 1 | Good — collapsible groups done |
| 3 | My Projects | /my-projects | All | 1 | Good — just added |
| 4 | Strategy Map | /strategy-map | All | 1 | Static, no drill-down |
| 5 | Pillars | /pillars | Admin | 1 | Should merge with Initiatives |
| 6 | Initiatives | /initiatives | Admin | 1 | Should merge with Pillars |
| 7 | Projects | /projects | All | 1 | Good — needs breadcrumbs |
| 8 | Project Detail | /projects/:id | All | 0 | 8 tabs → reduce to 5 |
| 9 | Progress Proof | /progress | Admin | 1 | Redundant — remove |
| 10 | Strategic KPIs | /kpis | All | 1 | Merge with Op KPIs |
| 11 | Op KPIs | /op-kpis | All | 1 | Merge with Strategic KPIs |
| 12 | Budget | /budget | Admin | 1 | Merge with Procurement |
| 13 | Procurement | /procurement | Admin | 1 | Merge with Budget |
| 14 | Departments | /departments | All | 1 | Good — simple CRUD |
| 15 | Dept Portfolio | /departments/:id/portfolio | All | 0 | Good — template for My Projects |
| 16 | Pillar Portfolio | /pillars/:id/portfolio | All | 0 | Good |
| 17 | Risks | /risks | All | 1 | Good — heatmap is strong |
| 18 | Documents | /documents | All | 1 | Good |
| 19 | Dependencies | /dependencies | All | 1 | Should be project detail tab |
| 20 | Alerts | /alerts | Admin | 1 | Merge with Activity Log |
| 21 | Activity Log | /activity | Admin | 1 | Merge with Alerts |
| 22 | Import | /import | Admin | 1 | Good — AI + bulk import |
| 23 | Admin | /admin | Admin | 1 | Good |
| 24 | Not Found | /* | All | 0 | Needs back button |

**Current:** 19 nav items
**Proposed:** ~12 nav items (7 PM + 5 admin)

---

## APPENDIX B: PERMISSION MATRIX (AS-IS)

| Action | Admin | PM (owner) | PM (non-owner) | Approver |
|--------|:-----:|:----------:|:--------------:|:--------:|
| View dashboard | ✓ | ✓ | ✓ | ✓ |
| View all projects | ✓ | ✓ | ✓ | ✓ |
| Edit project details | ✓ | ✓ | ✗ | ✗ |
| Update milestone progress | ✓ | ✓ | ✗ | ✗ |
| Upload evidence | ✓ | ✓ | ✓* | ✓ |
| Submit milestone | ✓ | ✓ | ✓ | ✗ |
| Approve/reject milestone | ✓ | ✗ | ✗ | ✓ |
| Create/edit risks | ✓ | ✓ | ✗ | ✗ |
| Create/edit actions | ✓ | ✓ | ✗ | ✗ |
| Submit weekly report | ✓ | ✓ | ✗ | ✗ |
| Manage documents | ✓ | ✓ | ✗ | ✗ |
| View budget | ✓ | ✗ | ✗ | ✗ |
| Import data | ✓ | ✗ | ✗ | ✗ |
| Manage users/roles | ✓ | ✗ | ✗ | ✗ |

*Evidence upload only checks auth, not project access — should be gated.

---

## APPENDIX C: COMPETITIVE GAPS

| Feature | Monday.com | Smartsheet | Planview | StrategyPMO |
|---------|:----------:|:----------:|:--------:|:-----------:|
| Global search | ✓ | ✓ | ✓ | ✗ |
| Keyboard shortcuts | ✓ | ✓ | ✗ | ✗ |
| Drag-and-drop Gantt | ✓ | ✓ | ✓ | View only |
| Email notifications | ✓ | ✓ | ✓ | ✗ |
| Comments/threads | ✓ | ✓ | ✓ | ✗ |
| Custom dashboards | ✓ | ✓ | ✓ | ✗ |
| Mobile app | ✓ | ✓ | ✓ | Responsive web |
| Bulk actions | ✓ | ✓ | ✓ | ✗ |
| Saved filters/views | ✓ | ✓ | ✓ | ✗ |
| File versioning | ✗ | ✓ | ✓ | ✗ |
| AI analysis | ✗ | ✗ | ✗ | ✓ |
| Strategy house | ✗ | ✗ | ✓ | ✓ |
| 99% gate rule | ✗ | ✗ | ✗ | ✓ |
| Risk heatmap | ✗ | ✗ | ✓ | ✓ |
| Bulk Excel import | ✗ | ✓ | ✗ | ✓ |

**StrategyPMO's unique strengths:** AI-powered analysis, strategy house visualization, 99% gate approval rule, risk heatmap, structured Excel import. These are differentiators to protect.

**Critical gaps vs competitors:** Global search, keyboard shortcuts, email notifications, comments/threads, bulk actions.
