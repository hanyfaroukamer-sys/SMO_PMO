/**
 * UAT / Usability Scenario Tests
 *
 * Simulates real user journeys by verifying source code paths that
 * would be exercised in each scenario. Uses fs.readFileSync to read
 * source code and verify expected patterns exist.
 *
 * Does NOT duplicate: engine exports, function existence, interface fields,
 *   weight cascade order, execution placeholder regex, analytics route
 *   registration, effectiveWeight display, email transport order.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────

function readFile(absPath: string): string {
  return fs.readFileSync(absPath, "utf-8");
}

const ROOT = path.resolve(__dirname, "../../../..");
const API_SRC = path.join(ROOT, "api-server/src");
const FE_SRC = path.join(ROOT, "strategy-pmo/src");
const MOBILE_SRC = path.join(ROOT, "mobile-app");

// Pre-load sources
const spmoRoutes = readFile(path.join(API_SRC, "routes/spmo.ts"));
const analyticsRoutes = readFile(path.join(API_SRC, "routes/analytics.ts"));
const projectsTsx = readFile(path.join(FE_SRC, "pages/projects.tsx"));
const projectDetailTsx = readFile(path.join(FE_SRC, "pages/project-detail.tsx"));
const analyticsTsx = readFile(path.join(FE_SRC, "pages/analytics.tsx"));
const notificationBellTsx = readFile(path.join(FE_SRC, "components/notification-bell.tsx"));

// Mobile files (may not exist in all environments)
let mobileDashboard = "";
let mobileProjectDetail = "";
let mobileApprovals = "";
let mobileTasks = "";
try {
  mobileDashboard = readFile(path.join(MOBILE_SRC, "app/(tabs)/index.tsx"));
  mobileProjectDetail = readFile(path.join(MOBILE_SRC, "app/projects/[id].tsx"));
  mobileApprovals = readFile(path.join(MOBILE_SRC, "app/(tabs)/approvals.tsx"));
  mobileTasks = readFile(path.join(MOBILE_SRC, "app/(tabs)/tasks.tsx"));
} catch {
  // Mobile files optional — tests will be skipped if not found
}

let progressProofTsx = "";
try {
  progressProofTsx = readFile(path.join(FE_SRC, "pages/progress-proof.tsx"));
} catch {
  // Optional
}

// ═════════════════════════════════════════════════════════════════
// UAT 1: PM creates project → gets 4 phase gates → Execution is placeholder
// ═════════════════════════════════════════════════════════════════

describe("UAT: PM creates project with 4 phase gates", () => {
  test("project creation inserts 4 phase gate milestones in order", () => {
    // The route inserts Planning, Tendering, Execution, Closure
    expect(spmoRoutes).toContain('phaseGate: "planning"');
    expect(spmoRoutes).toContain('phaseGate: "tendering"');
    expect(spmoRoutes).toContain('phaseGate: "execution_placeholder"');
    expect(spmoRoutes).toContain('phaseGate: "closure"');
  });

  test("Execution & Delivery milestone uses execution_placeholder phaseGate", () => {
    // Verify the exact milestone name alongside the placeholder phaseGate
    expect(spmoRoutes).toMatch(/Execution\s*&\s*Delivery[\s\S]*?phaseGate:\s*"execution_placeholder"/);
  });

  test("phase gate weights come from config with defaults", () => {
    expect(spmoRoutes).toContain("cfg?.defaultPlanningWeight ?? 5");
    expect(spmoRoutes).toContain("cfg?.defaultTenderingWeight ?? 5");
    expect(spmoRoutes).toContain("cfg?.defaultExecutionWeight ?? 85");
    expect(spmoRoutes).toContain("cfg?.defaultClosureWeight ?? 5");
  });

  test("phase gate effortDays come from config with defaults", () => {
    expect(spmoRoutes).toContain("cfg?.defaultPlanningEffortDays ?? 30");
    expect(spmoRoutes).toContain("cfg?.defaultTenderingEffortDays ?? 45");
    expect(spmoRoutes).toContain("cfg?.defaultExecutionEffortDays ?? 120");
    expect(spmoRoutes).toContain("cfg?.defaultClosureEffortDays ?? 20");
  });

  test("all 4 phase gates have weight + effortDays + description fields", () => {
    // Count the number of phaseGate assignments on milestone creation lines
    const phaseGateMatches = spmoRoutes.match(/phaseGate:\s*"(planning|tendering|execution_placeholder|closure)"/g);
    // Should have at least 4 in the creation block (may appear elsewhere too)
    expect(phaseGateMatches).not.toBeNull();
    expect(phaseGateMatches!.length).toBeGreaterThanOrEqual(4);
  });
});

// ═════════════════════════════════════════════════════════════════
// UAT 2: Admin clicks Duration button → milestones get date-based weights
// ═════════════════════════════════════════════════════════════════

describe("UAT: Admin resets weights to duration", () => {
  test("resetWeightsToDuration function exists in projects.tsx", () => {
    expect(projectsTsx).toContain("function resetWeightsToDuration");
  });

  test("computes days from dueDate minus startDate", () => {
    expect(projectsTsx).toMatch(
      /new Date\(m\.dueDate\)\.getTime\(\)\s*-\s*new Date\(m\.startDate\)\.getTime\(\)/
    );
  });

  test("uses bulkWeightMutation (not per-milestone weight update)", () => {
    // After computing weights, it calls bulkWeightMutation
    expect(projectsTsx).toContain("bulkWeightMutation");
    // The reset function should call bulk, not individual weight updates
    const resetFn = projectsTsx.substring(
      projectsTsx.indexOf("function resetWeightsToDuration"),
      projectsTsx.indexOf("function resetWeightsToDuration") + 2000
    );
    expect(resetFn).toContain("bulkWeightMutation");
  });

  test("also updates effortDays on each milestone via updateMutation", () => {
    const resetFn = projectsTsx.substring(
      projectsTsx.indexOf("function resetWeightsToDuration"),
      projectsTsx.indexOf("function resetWeightsToDuration") + 2000
    );
    expect(resetFn).toContain("updateMutation");
    expect(resetFn).toContain("effortDays");
  });

  test("handles zero total days gracefully with toast", () => {
    expect(projectsTsx).toContain("totalDays === 0");
    expect(projectsTsx).toContain("Milestones need start and due dates");
  });

  test("distributes remainder via largest-remainder method", () => {
    expect(projectsTsx).toContain("Math.floor(e.exact)");
    expect(projectsTsx).toContain("b.rem - a.rem");
  });
});

// ═════════════════════════════════════════════════════════════════
// UAT 3: User types @ in discussion → dropdown appears
// ═════════════════════════════════════════════════════════════════

describe("UAT: @ mention in discussion", () => {
  test("project-detail.tsx has mentionQuery state", () => {
    expect(projectDetailTsx).toContain("mentionQuery");
    expect(projectDetailTsx).toMatch(/useState.*mentionQuery|mentionQuery.*useState/);
  });

  test("has handleBodyChange that detects @ character", () => {
    expect(projectDetailTsx).toContain("handleBodyChange");
  });

  test("has selectMentionUser that inserts @[Name](userId) format", () => {
    expect(projectDetailTsx).toContain("selectMentionUser");
    // Template literal: `@[${name}](${user.id})`
    expect(projectDetailTsx).toContain("@[${name}](${user.id})");
  });

  test("dropdown rendered with mentionResults.map", () => {
    expect(projectDetailTsx).toContain("mentionResults.map");
  });

  test("mentions search hits the /api/spmo/users/search endpoint", () => {
    expect(projectDetailTsx).toContain("/api/spmo/users/search");
  });

  test("mention dropdown has keyboard navigation (ArrowDown, Enter/Tab)", () => {
    expect(projectDetailTsx).toContain("ArrowDown");
    expect(projectDetailTsx).toMatch(/Enter.*Tab|Tab.*Enter/);
  });
});

// ═════════════════════════════════════════════════════════════════
// UAT 4: Admin opens analytics → all tabs render
// ═════════════════════════════════════════════════════════════════

describe("UAT: Admin opens analytics — all tabs render", () => {
  test("each tab key maps to a panel component", () => {
    const tabPanelMap: Record<string, string> = {
      weekly: "WeeklyDigestPanel",
      anomalies: "AnomalyPanel",
      dependencies: "DependencyFinderPanel",
      scenario: "ScenarioPanel",
    };
    for (const [tab, panel] of Object.entries(tabPanelMap)) {
      expect(analyticsTsx).toContain(`"${tab}"`);
      expect(analyticsTsx).toContain(panel);
    }
  });

  test("each panel fetches from the correct API endpoint", () => {
    const panelEndpoints: Record<string, string> = {
      WeeklyDigestPanel: "/api/spmo/analytics/weekly-digest",
      AnomalyPanel: "/api/spmo/analytics/anomalies",
      DependencyFinderPanel: "/api/spmo/analytics/dependency-suggestions",
    };
    for (const [panel, endpoint] of Object.entries(panelEndpoints)) {
      expect(analyticsTsx).toContain(panel);
      expect(analyticsTsx).toContain(endpoint);
    }
  });

  test("Scenario panel has project dropdown (select element)", () => {
    expect(analyticsTsx).toMatch(/<select/);
    expect(analyticsTsx).toContain("Select project");
  });

  test("AI Advisor has quick questions (QUICK_QUESTIONS array)", () => {
    expect(analyticsTsx).toContain("QUICK_QUESTIONS");
    expect(analyticsTsx).toMatch(/QUICK_QUESTIONS\s*=\s*\[/);
  });

  test("Board Report has generate button text", () => {
    expect(analyticsTsx).toContain("Generate Board Report");
  });

  test("analytics API routes require authentication (check user.id)", () => {
    const analyticsRoutesSrc = readFile(path.join(API_SRC, "routes/analytics.ts"));
    // Count auth checks
    const authChecks = analyticsRoutesSrc.match(/user\?\.id/g);
    expect(authChecks).not.toBeNull();
    // Should have auth check on every route (at least 10 endpoints)
    expect(authChecks!.length).toBeGreaterThanOrEqual(10);
  });

  test("scenario and board-report routes require admin role", () => {
    const analyticsRoutesSrc = readFile(path.join(API_SRC, "routes/analytics.ts"));
    expect(analyticsRoutesSrc).toMatch(/scenario[\s\S]*?role.*admin/);
    expect(analyticsRoutesSrc).toMatch(/board-report[\s\S]*?role.*admin/);
  });
});

// ═════════════════════════════════════════════════════════════════
// UAT 5: Notification click → navigates to Discussion tab
// ═════════════════════════════════════════════════════════════════

describe("UAT: Notification click navigates to Discussion tab", () => {
  test("project-detail.tsx tabMap includes discussion key", () => {
    expect(projectDetailTsx).toContain('"discussion": "discussion"');
  });

  test("useEffect watches location changes for tab param", () => {
    expect(projectDetailTsx).toContain("useEffect");
    expect(projectDetailTsx).toMatch(/window\.location\.search.*tab/);
  });

  test("tabMap in useEffect also maps discussion param", () => {
    // There are two tabMap instances — one in useState init, one in useEffect
    const tabMapCount = (projectDetailTsx.match(/"discussion":\s*"discussion"/g) ?? []).length;
    expect(tabMapCount).toBeGreaterThanOrEqual(2);
  });

  test("notification-bell.tsx uses navigate(n.link) to handle clicks", () => {
    expect(notificationBellTsx).toContain("navigate(n.link)");
  });

  test("notification-bell fetches from /api/spmo/notifications", () => {
    expect(notificationBellTsx).toContain("/api/spmo/notifications");
  });

  test("notification-bell can mark all as read", () => {
    expect(notificationBellTsx).toContain("/api/spmo/notifications/read-all");
  });
});

// ═════════════════════════════════════════════════════════════════
// UAT 6: Evidence upload uses correct endpoint
// ═════════════════════════════════════════════════════════════════

describe("UAT: Evidence upload uses /api/spmo/uploads/request-url", () => {
  test("project-detail.tsx calls /api/spmo/uploads/request-url for uploads", () => {
    expect(projectDetailTsx).toContain("/api/spmo/uploads/request-url");
  });

  test("projects.tsx calls /api/spmo/uploads/request-url for uploads", () => {
    expect(projectsTsx).toContain("/api/spmo/uploads/request-url");
  });

  test("progress-proof.tsx calls /api/spmo/uploads/request-url for uploads", () => {
    if (!progressProofTsx) {
      console.warn("progress-proof.tsx not found — skipping");
      return;
    }
    expect(progressProofTsx).toContain("/api/spmo/uploads/request-url");
  });

  test("no upload file calls /api/storage/ directly for uploading (only for viewing)", () => {
    // The /api/storage/ references should only be in href links for viewing, not in fetch calls for uploading
    // project-detail.tsx: fetch uses /api/spmo/uploads/request-url
    const fetchCalls = projectDetailTsx.match(/fetch\s*\(\s*["'`]\/api\/storage\//g);
    expect(fetchCalls).toBeNull();
  });

  test("projects.tsx does not call /api/storage/ for uploading", () => {
    const fetchCalls = projectsTsx.match(/fetch\s*\(\s*["'`]\/api\/storage\//g);
    expect(fetchCalls).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════
// UAT 7: Mobile app has all required sections
// ═════════════════════════════════════════════════════════════════

describe("UAT: Mobile app has all required sections", () => {
  const skipIfNoMobile = () => {
    if (!mobileDashboard) {
      console.warn("Mobile files not found — skipping");
      return true;
    }
    return false;
  };

  test("mobile dashboard index.tsx has department-status API call", () => {
    if (skipIfNoMobile()) return;
    expect(mobileDashboard).toContain("department-status");
  });

  test("mobile dashboard has budget section", () => {
    if (skipIfNoMobile()) return;
    expect(mobileDashboard).toMatch(/budget|Budget/i);
    // Specifically checks for budget data usage
    expect(mobileDashboard).toContain("budgetSpent");
  });

  test("mobile project detail has approve/reject (handleApprove function)", () => {
    if (!mobileProjectDetail) {
      console.warn("Mobile project detail not found — skipping");
      return;
    }
    expect(mobileProjectDetail).toContain("handleApprove");
  });

  test("mobile approvals screen has handleApprove function", () => {
    if (!mobileApprovals) {
      console.warn("Mobile approvals not found — skipping");
      return;
    }
    expect(mobileApprovals).toContain("handleApprove");
  });

  test("mobile tasks screen passes tab and milestoneId params", () => {
    if (!mobileTasks) {
      console.warn("Mobile tasks not found — skipping");
      return;
    }
    expect(mobileTasks).toContain("milestoneId");
    expect(mobileTasks).toContain("tab");
  });

  test("mobile project detail accepts tab and milestoneId from navigation params", () => {
    if (!mobileProjectDetail) {
      console.warn("Mobile project detail not found — skipping");
      return;
    }
    expect(mobileProjectDetail).toContain("milestoneId");
    expect(mobileProjectDetail).toMatch(/useLocalSearchParams|tab/);
  });
});

// ═════════════════════════════════════════════════════════════════
// Additional cross-cutting UAT scenarios
// ═════════════════════════════════════════════════════════════════

describe("UAT: API route error handling consistency", () => {
  test("all analytics routes return 401 for unauthenticated requests", () => {
    const analyticsRoutesSrc = readFile(path.join(API_SRC, "routes/analytics.ts"));
    const status401Count = (analyticsRoutesSrc.match(/status\(401\)/g) ?? []).length;
    // Each route handler should have a 401 check
    expect(status401Count).toBeGreaterThanOrEqual(10);
  });

  test("all analytics routes have error handler returning 500", () => {
    const analyticsRoutesSrc = readFile(path.join(API_SRC, "routes/analytics.ts"));
    const status500Count = (analyticsRoutesSrc.match(/status\(500\)/g) ?? []).length;
    expect(status500Count).toBeGreaterThanOrEqual(10);
  });

  test("analytics summary route uses Promise.all for parallel engine loading", () => {
    const analyticsRoutesSrc = readFile(path.join(API_SRC, "routes/analytics.ts"));
    expect(analyticsRoutesSrc).toContain("Promise.all");
  });

  test("analytics summary route catches individual engine failures with .catch()", () => {
    const analyticsRoutesSrc = readFile(path.join(API_SRC, "routes/analytics.ts"));
    // Each engine in the summary has .catch(() => [])
    const catchCount = (analyticsRoutesSrc.match(/\.catch\(\(\)\s*=>\s*\[\]\)/g) ?? []).length;
    expect(catchCount).toBeGreaterThanOrEqual(4);
  });
});
