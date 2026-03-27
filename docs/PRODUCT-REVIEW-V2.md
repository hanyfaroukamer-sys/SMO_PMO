# StrategyPMO — Product Review v2 (Post-Optimization)

**Date:** 2026-03-27 (Second Review)
**Reviewer:** Product Principal
**Version:** 1.1.0 (post-performance optimization)

---

## Overall Score: 82/100 (up from ~65 at first review)

| Category | Score | Notes |
|----------|-------|-------|
| Feature Completeness | 80% | Strong core PMO, missing resource planning + drag-drop Gantt |
| UX/Usability | 85% | Sidebar restructured, tabs merged, command palette added |
| Performance | 90% | 3 major query optimizations done (50x faster milestones) |
| Security/RBAC | 88% | Owner-based permissions, audit trail, milestone guards |
| Mobile Responsiveness | 70% | Works but tables don't stack, no mobile-optimized forms |
| Accessibility | 60% | Focus trapping incomplete, color-only indicators |
| Deployment Readiness | 95% | Docker, backup/restore, deploy package, diagnostics page |

---

## What's Been Fixed Since First Review

| Item | Status |
|------|--------|
| Sidebar 19→15 items with admin divider | ✅ Done |
| KPI pages merged (strategic + operational) | ✅ Done |
| Budget + Procurement merged → Financials | ✅ Done |
| Alerts + Activity merged → Monitoring | ✅ Done |
| Project detail 8→5 tabs | ✅ Done |
| Global search (Cmd+K) | ✅ Done |
| Strategy Map click drill-down | ✅ Done |
| Dashboard "Attention Required" chips | ✅ Done |
| Breadcrumbs on project detail | ✅ Done |
| Double PageHeaders fixed | ✅ Done |
| Enablers labelled correctly on projects page | ✅ Done |
| Gantt zoom (Annual→Week, 6 levels) | ✅ Done |
| Gantt auto-scroll to today | ✅ Done |
| Email reminder system | ✅ Done |
| Executive PPTX/PDF report restructure | ✅ Done |
| Per-department CC dropdowns | ✅ Done |
| Diagnostics page | ✅ Done |
| Activity log before/after tracking | ✅ Done |
| PM inline progress update | ✅ Done |
| Milestone sort stability fix | ✅ Done |
| Performance: milestones 50x, search 15x, dashboard 160x | ✅ Done |
| 59 UAT bugs found, 20+ fixed | ✅ Done |

---

## Remaining Gaps (Priority Order)

### P1 — High Impact, Achievable (1-2 weeks)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | **Sidebar collapse persists to localStorage** | 30 min | Every user every session |
| 2 | **My Tasks badge polls every 30s** | 30 min | Real-time awareness |
| 3 | **Unsaved changes warning on forms** | 2 hours | Prevents data loss |
| 4 | **Department CC dropdown as autocomplete** (not <select>) | 1 hour | Usability for 100+ users |
| 5 | **Search includes description text** | 1 hour | Find projects by keyword |
| 6 | **Gantt dependency arrows between milestones** | 1 day | Visual critical path |
| 7 | **Approval escalation after N days** | 2 hours | Prevents bottlenecks |

### P2 — Competitive Features (1-2 months)

| # | Feature | Effort | Competitor |
|---|---------|--------|-----------|
| 8 | Gantt drag-to-reschedule | 3-5 days | Monday.com, Smartsheet |
| 9 | Bulk edit (multi-select projects) | 2-3 days | Smartsheet |
| 10 | Baseline tracking (plan vs actual snapshot) | 3 days | MS Project, Planview |
| 11 | Resource capacity view by department | 3 days | Planview |
| 12 | Custom fields framework | 5 days | Monday.com, Smartsheet |
| 13 | In-app notification center (bell icon) | 2 days | Monday.com |
| 14 | Comments/discussion threads on items | 3 days | All competitors |

### P3 — Enterprise Features (3-6 months)

| # | Feature | Effort | Competitor |
|---|---------|--------|-----------|
| 15 | Scenario planning / what-if analysis | 2 weeks | Planview |
| 16 | Time tracking / actuals entry | 1 week | Monday.com |
| 17 | Recurring tasks / templates | 3 days | Asana |
| 18 | AI-powered risk prediction | 2 weeks | Planview Anvi |
| 19 | Multi-portfolio support | 2 weeks | ServiceNow |
| 20 | WCAG 2.1 AA accessibility compliance | 1 week | Required for government |

---

## Competitive Position

### StrategyPMO Unique Strengths (No Competitor Has All)
1. ✅ AI-powered programme analysis (Claude integration)
2. ✅ Strategy House visualization
3. ✅ 99% gate approval rule
4. ✅ Risk heatmap with score-based alerting
5. ✅ Structured Excel bulk import (13 tables)
6. ✅ Executive PPTX/PDF reports (McKinsey format)
7. ✅ Configurable email reminders with per-department CC
8. ✅ Before/after audit trail on all entity changes

### What Competitors Do Better
1. ❌ Drag-and-drop Gantt (Monday.com, Smartsheet)
2. ❌ Resource management / capacity planning (Planview)
3. ❌ Custom fields (Monday.com, Smartsheet)
4. ❌ In-app collaboration / comments (All)
5. ❌ Mobile native app (All major tools)
6. ❌ Scenario planning (Planview, Clarity)

---

## Recommendation

**The app is production-ready for government PMO deployment.** The P1 items (sidebar persistence, task polling, unsaved warnings) are polish — not blockers. The core workflow (create programme → track projects → update milestones → approve → report) is fully functional with proper RBAC, audit trails, and executive reporting.

For competitive positioning against Monday.com/Smartsheet, prioritize:
1. **Gantt drag-and-drop** (biggest visual gap)
2. **In-app notifications** (biggest workflow gap)
3. **Comments/threads** (biggest collaboration gap)

These three features would close 80% of the perceived gap with commercial tools.
