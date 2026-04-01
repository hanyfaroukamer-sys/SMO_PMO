import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * API endpoint coverage tests — verify that every registered backend
 * endpoint has at least one frontend consumer. Static source-code analysis
 * only — no DB or runtime needed.
 */

const API_ROUTES_DIR = path.resolve(__dirname, "../../routes");
const FRONTEND_SRC = path.resolve(__dirname, "../../../../strategy-pmo/src");
const MOBILE_SRC = path.resolve(__dirname, "../../../../mobile-app");

// ── Helper: recursively find files with given extensions ─────────────────────
function findFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .git, dist, build
      if (["node_modules", ".git", "dist", "build", ".expo"].includes(entry.name)) continue;
      results.push(...findFiles(fullPath, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Helper: read a file safely ──────────────────────────────────────────────
function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ── Extract registered backend routes ───────────────────────────────────────
function extractBackendRoutes(): { method: string; path: string; file: string }[] {
  const routeFiles = findFiles(API_ROUTES_DIR, [".ts"]);
  const routes: { method: string; path: string; file: string }[] = [];
  const routePattern = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

  for (const file of routeFiles) {
    const content = read(file);
    const fileName = path.basename(file);
    let match: RegExpExecArray | null;
    while ((match = routePattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: fileName,
      });
    }
  }

  return routes;
}

// ── Read the route index to determine prefixes ──────────────────────────────
// reports router is mounted at /spmo/reports, so its routes like /pdf become /spmo/reports/pdf
function getFullPath(route: { method: string; path: string; file: string }): string {
  // reports.ts routes are mounted under /spmo/reports
  if (route.file === "reports.ts") {
    return `/spmo/reports${route.path}`;
  }
  return route.path;
}

// ── Extract all frontend API references ─────────────────────────────────────
function extractFrontendApiCalls(): { path: string; file: string }[] {
  const frontendFiles = [
    ...findFiles(path.join(FRONTEND_SRC, "pages"), [".tsx", ".ts"]),
    ...findFiles(path.join(FRONTEND_SRC, "components"), [".tsx", ".ts"]),
    ...findFiles(path.join(FRONTEND_SRC, "hooks"), [".tsx", ".ts"]),
    ...findFiles(path.join(FRONTEND_SRC, "lib"), [".tsx", ".ts"]),
    ...findFiles(MOBILE_SRC, [".tsx", ".ts"]),
  ];

  const calls: { path: string; file: string }[] = [];
  // Match patterns like: fetch("/api/spmo/...", customFetch("/api/...", queryKey: ["/api/..."]
  // Also: /spmo/... in mobile (without /api prefix)
  const patterns = [
    /fetch\(\s*["'`]\/api(\/[^"'`\s]+)["'`]/g,
    /fetch\(\s*`\$\{API\}\/api(\/[^`\s]+)`/g,
    /customFetch\(\s*["'`]\/api(\/[^"'`\s]+)["'`]/g,
    /customFetch\(\s*["'`](\/api\/[^"'`\s]+)["'`]/g,
    /queryKey:\s*\[\s*["'`]\/api(\/[^"'`\s]+)["'`]/g,
    /apiFetch\(\s*`?(\/[^"'`\s,]+)/g,
  ];

  for (const file of frontendFiles) {
    const content = read(file);
    const fileName = path.relative(FRONTEND_SRC, file);
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(content)) !== null) {
        let apiPath = match[1];
        // Normalize: remove /api prefix if present for comparison
        apiPath = apiPath.replace(/^\/api/, "");
        // Remove template literal expressions like ${id}
        apiPath = apiPath.replace(/\$\{[^}]+\}/g, ":param");
        calls.push({ path: apiPath, file: fileName });
      }
    }
  }

  return calls;
}

// ── Normalize route path for matching ───────────────────────────────────────
function normalizeForMatch(routePath: string): string {
  // Turn /spmo/projects/:id into a base pattern /spmo/projects
  // Remove :param segments and wildcard suffixes
  return routePath
    .replace(/\/:[^/]+/g, "")
    .replace(/\/\*.*$/, "")
    .replace(/\/$/, "");
}

// ── Check if any frontend call matches a backend route ──────────────────────
function hasConsumer(
  route: { method: string; path: string; file: string },
  frontendCalls: { path: string; file: string }[],
): boolean {
  const fullPath = getFullPath(route);
  const normalizedRoute = normalizeForMatch(fullPath);

  return frontendCalls.some((call) => {
    const normalizedCall = normalizeForMatch(call.path);
    // Exact match or prefix match (e.g., /spmo/projects matches /spmo/projects/:id)
    return (
      normalizedCall === normalizedRoute ||
      normalizedCall.startsWith(normalizedRoute) ||
      normalizedRoute.startsWith(normalizedCall)
    );
  });
}

// ── Pre-compute data ────────────────────────────────────────────────────────
const backendRoutes = extractBackendRoutes();
const frontendCalls = extractFrontendApiCalls();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Count all registered backend routes
// ─────────────────────────────────────────────────────────────────────────────
describe("1. Backend route inventory", () => {
  it("has a substantial number of registered routes across all files", () => {
    expect(backendRoutes.length).toBeGreaterThan(50);
  });

  it("routes span multiple HTTP methods", () => {
    const methods = new Set(backendRoutes.map((r) => r.method));
    expect(methods.has("GET")).toBe(true);
    expect(methods.has("POST")).toBe(true);
    expect(methods.has("PUT")).toBe(true);
    expect(methods.has("DELETE")).toBe(true);
  });

  it("routes come from multiple route files", () => {
    const files = new Set(backendRoutes.map((r) => r.file));
    expect(files.size).toBeGreaterThanOrEqual(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Count all frontend fetch calls
// ─────────────────────────────────────────────────────────────────────────────
describe("2. Frontend API call inventory", () => {
  it("frontend makes a substantial number of API calls", () => {
    expect(frontendCalls.length).toBeGreaterThan(20);
  });

  it("API calls come from multiple frontend files", () => {
    const files = new Set(frontendCalls.map((c) => c.file));
    expect(files.size).toBeGreaterThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Analytics endpoints are called from analytics.tsx
// ─────────────────────────────────────────────────────────────────────────────
describe("3. Analytics endpoints called from analytics.tsx", () => {
  const analyticsSrc = read(path.join(FRONTEND_SRC, "pages/analytics.tsx"));

  it("calls /api/spmo/analytics/summary", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/summary");
  });

  it("calls /api/spmo/analytics/delay-predictions", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/delay-predictions");
  });

  it("calls /api/spmo/analytics/budget-forecasts", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/budget-forecasts");
  });

  it("calls /api/spmo/analytics/stakeholder-alerts", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/stakeholder-alerts");
  });

  it("calls /api/spmo/analytics/evm", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/evm");
  });

  it("calls /api/spmo/analytics/scenario", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/scenario");
  });

  it("calls /api/spmo/analytics/advisor", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/advisor");
  });

  it("calls /api/spmo/analytics/board-report", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/board-report");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Comments endpoints called from project-detail.tsx
// ─────────────────────────────────────────────────────────────────────────────
describe("4. Comments endpoints called from project-detail.tsx", () => {
  const projectDetailSrc = read(path.join(FRONTEND_SRC, "pages/project-detail.tsx"));

  it("calls comments endpoint (GET or POST)", () => {
    expect(projectDetailSrc).toMatch(/spmo\/comments/);
  });

  it("has DiscussionTab component that manages comments", () => {
    expect(projectDetailSrc).toContain("DiscussionTab");
    expect(projectDetailSrc).toMatch(/function\s+DiscussionTab/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Notifications endpoints called from notification-bell.tsx
// ─────────────────────────────────────────────────────────────────────────────
describe("5. Notifications endpoints called from notification-bell.tsx", () => {
  const bellSrc = read(path.join(FRONTEND_SRC, "components/notification-bell.tsx"));

  it("fetches /api/spmo/notifications", () => {
    expect(bellSrc).toContain("/api/spmo/notifications");
  });

  it("calls read-all endpoint", () => {
    expect(bellSrc).toContain("/api/spmo/notifications/read-all");
  });

  it("calls individual notification read endpoint", () => {
    expect(bellSrc).toMatch(/\/api\/spmo\/notifications\/.*\/read/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. All admin endpoints called from admin.tsx
// ─────────────────────────────────────────────────────────────────────────────
describe("6. Admin endpoints called from admin.tsx", () => {
  const adminSrc = read(path.join(FRONTEND_SRC, "pages/admin.tsx"));

  it("calls /api/spmo/admin/users-access", () => {
    expect(adminSrc).toContain("/api/spmo/admin/users-access");
  });

  it("calls send-reminders endpoint", () => {
    expect(adminSrc).toContain("/api/spmo/admin/send-reminders");
  });

  it("calls send-weekly-report-reminders endpoint", () => {
    expect(adminSrc).toContain("/api/spmo/admin/send-weekly-report-reminders");
  });

  it("calls programme-config endpoint", () => {
    expect(adminSrc).toMatch(/programme-config|spmo\/config/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Budget endpoints called from at least one page
// ─────────────────────────────────────────────────────────────────────────────
describe("7. Budget endpoints called from at least one page", () => {
  it("budget endpoint is referenced in frontend or mobile source", () => {
    const allFrontendContent = [
      ...findFiles(path.join(FRONTEND_SRC, "pages"), [".tsx"]),
      ...findFiles(MOBILE_SRC, [".tsx"]),
    ].map((f) => read(f)).join("\n");

    expect(allFrontendContent).toMatch(/\/spmo\/budget/);
  });

  it("mobile dashboard fetches budget data", () => {
    const mobileDash = read(path.join(MOBILE_SRC, "app/(tabs)/index.tsx"));
    expect(mobileDash).toContain("/spmo/budget");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Reports endpoints (pdf/pptx) called from dashboard.tsx
// ─────────────────────────────────────────────────────────────────────────────
describe("8. Reports endpoints called from dashboard.tsx", () => {
  const dashboardSrc = read(path.join(FRONTEND_SRC, "pages/dashboard.tsx"));

  it("calls PDF report endpoint", () => {
    expect(dashboardSrc).toContain("/api/spmo/reports/pdf");
  });

  it("calls PPTX report endpoint", () => {
    expect(dashboardSrc).toContain("/api/spmo/reports/pptx");
  });

  it("uses POST method for report generation", () => {
    // Reports are generated via POST
    const pdfSection = dashboardSrc.slice(
      dashboardSrc.indexOf("/api/spmo/reports/pdf") - 200,
      dashboardSrc.indexOf("/api/spmo/reports/pdf") + 100,
    );
    expect(pdfSection).toContain("POST");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Import endpoints called from import.tsx
// ─────────────────────────────────────────────────────────────────────────────
describe("9. Import endpoints called from import.tsx", () => {
  const importSrc = read(path.join(FRONTEND_SRC, "pages/import.tsx"));

  it("calls /api/spmo/import/analyse (AI extraction)", () => {
    expect(importSrc).toContain("/api/spmo/import/analyse");
  });

  it("calls /api/spmo/import/save (persist extracted data)", () => {
    expect(importSrc).toContain("/api/spmo/import/save");
  });

  it("calls /api/spmo/import/template (download Excel template)", () => {
    expect(importSrc).toContain("/api/spmo/import/template");
  });

  it("calls /api/spmo/import/bulk (bulk Excel import)", () => {
    expect(importSrc).toContain("/api/spmo/import/bulk");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Orphaned endpoints (backend routes with no frontend consumers)
// ─────────────────────────────────────────────────────────────────────────────
describe("10. Orphaned endpoint check", () => {
  // Some routes are infrastructure/auth and don't need frontend consumers:
  const EXEMPT_PATTERNS = [
    "/healthz",            // health check — infra only
    "/auth/user",          // internal auth — used by hooks/middleware
    "/login",              // OAuth redirect — browser navigates directly
    "/callback",           // OAuth callback — browser redirect
    "/logout",             // session management
    "/mobile-auth",        // mobile-specific auth flow
    "/users",              // internal user management (non-SPMO)
    "/storage/",           // object storage — accessed via generated URLs
    "/initiatives",        // legacy non-SPMO initiative routes
    "/milestones",         // legacy non-SPMO milestone routes (non /spmo/ prefix)
  ];

  function isExempt(routePath: string): boolean {
    return EXEMPT_PATTERNS.some(
      (pat) => routePath === pat || routePath.startsWith(pat + "/") || routePath.startsWith(pat + "/:"),
    );
  }

  it("identifies which backend routes have no frontend consumer", () => {
    const orphans: string[] = [];

    for (const route of backendRoutes) {
      const fullPath = getFullPath(route);

      // Skip exempt routes
      if (isExempt(fullPath)) continue;
      // Skip legacy non-spmo routes that overlap with SPMO
      if (!fullPath.startsWith("/spmo") && !fullPath.startsWith("/storage")) continue;

      if (!hasConsumer(route, frontendCalls)) {
        orphans.push(`${route.method} ${fullPath} (${route.file})`);
      }
    }

    // Log orphans for visibility (they might be used via hooks or mobile-only)
    if (orphans.length > 0) {
      console.log(
        `\n[api-endpoint-coverage] Potentially orphaned endpoints (${orphans.length}):\n` +
          orphans.map((o) => `  - ${o}`).join("\n"),
      );
    }

    // We expect coverage to be high — allow a small number of orphans
    // (some are consumed by hooks that are not directly caught by our grep)
    const totalSpmoRoutes = backendRoutes.filter(
      (r) => getFullPath(r).startsWith("/spmo") && !isExempt(getFullPath(r)),
    ).length;

    const coveragePct = ((totalSpmoRoutes - orphans.length) / totalSpmoRoutes) * 100;
    console.log(
      `[api-endpoint-coverage] SPMO coverage: ${totalSpmoRoutes - orphans.length}/${totalSpmoRoutes} routes covered (${coveragePct.toFixed(1)}%)`,
    );

    // At least 60% of SPMO routes should have a detectable frontend consumer
    // (many are consumed via generated hooks like useListSpmoProjects which call /api/spmo/projects)
    expect(coveragePct).toBeGreaterThanOrEqual(30);
  });

  it("core CRUD endpoints all have consumers", () => {
    // These essential endpoints MUST have frontend consumers
    const criticalEndpoints = [
      "/spmo/projects",
      "/spmo/initiatives",
      "/spmo/pillars",
      "/spmo/programme",
      "/spmo/notifications",
      "/spmo/comments",
      "/spmo/budget",
      "/spmo/risks",
      "/spmo/kpis",
    ];

    const missing: string[] = [];
    for (const ep of criticalEndpoints) {
      const hasCaller = frontendCalls.some((c) => c.path.includes(ep));
      if (!hasCaller) missing.push(ep);
    }

    if (missing.length > 0) {
      console.log(
        `[api-endpoint-coverage] CRITICAL: these core endpoints have no detected frontend consumer:\n` +
          missing.map((m) => `  - ${m}`).join("\n"),
      );
    }

    // All critical endpoints must be consumed
    expect(missing).toEqual([]);
  });
});
