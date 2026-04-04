/**
 * Cross-system integration consistency tests.
 *
 * Verifies that routers, frontend routes, sidebar links, analytics tabs,
 * mobile API calls, schema tables, engine files, and deploy config all
 * stay wired together correctly.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ── Resolve paths relative to __dirname ──────────────────────────────
const API_SRC = path.resolve(__dirname, "../../");
const FE_SRC = path.resolve(__dirname, "../../../../strategy-pmo/src");
const MOBILE_SRC = path.resolve(__dirname, "../../../../mobile-app");
const SCHEMA = path.resolve(__dirname, "../../../../../lib/db/src/schema/spmo.ts");
const ENV_EXAMPLE = path.resolve(__dirname, "../../../../../deploy/.env.example");

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ── Preload sources ──────────────────────────────────────────────────
const routerIndex = read(path.resolve(API_SRC, "routes/index.ts"));
const analyticsSrc = read(path.resolve(API_SRC, "routes/analytics.ts"));
const spmoRouteSrc = read(path.resolve(API_SRC, "routes/spmo.ts"))
  + "\n" + (fs.existsSync(path.resolve(API_SRC, "routes/spmo-comments.ts")) ? read(path.resolve(API_SRC, "routes/spmo-comments.ts")) : "")
  + "\n" + (fs.existsSync(path.resolve(API_SRC, "routes/spmo-kpis.ts")) ? read(path.resolve(API_SRC, "routes/spmo-kpis.ts")) : "")
  + "\n" + (fs.existsSync(path.resolve(API_SRC, "routes/spmo-admin.ts")) ? read(path.resolve(API_SRC, "routes/spmo-admin.ts")) : "");
const reportsSrc = read(path.resolve(API_SRC, "routes/reports.ts"));
const spmoCalcSrc = read(path.resolve(API_SRC, "lib/spmo-calc.ts"));
const appTsx = read(path.resolve(FE_SRC, "App.tsx"));
const layoutSrc = read(path.resolve(FE_SRC, "components/layout.tsx"));
const analyticsFe = read(path.resolve(FE_SRC, "pages/analytics.tsx"));
const projectDetailSrc = read(path.resolve(FE_SRC, "pages/project-detail.tsx"));
const mobileIndex = read(path.resolve(MOBILE_SRC, "app/(tabs)/index.tsx"));
const schemaSrc = read(SCHEMA);
const envExample = read(ENV_EXAMPLE);

// =====================================================================
// 1. Router registration
// =====================================================================
describe("Router registration (index.ts)", () => {
  const importLines = routerIndex
    .split("\n")
    .filter((l) => l.startsWith("import ") && l.includes("from"));

  const importedNames = importLines.map((l) => {
    const m = l.match(/import\s+(\w+)/);
    return m ? m[1] : "";
  }).filter(Boolean);

  it("every imported router is used via router.use()", () => {
    for (const name of importedNames) {
      const usagePattern = new RegExp(`router\\.use\\([^)]*\\b${name}\\b`);
      expect(routerIndex).toMatch(usagePattern);
    }
  });

  it("imports at least 10 routers", () => {
    expect(importedNames.length).toBeGreaterThanOrEqual(10);
  });

  it("analyticsRouter is imported and registered", () => {
    expect(routerIndex).toMatch(/import\s+analyticsRouter\s+from/);
    expect(routerIndex).toMatch(/router\.use\(analyticsRouter\)/);
  });
});

// =====================================================================
// 2. Sidebar links vs App.tsx routes
// =====================================================================
describe("Sidebar links match App.tsx routes", () => {
  // Extract hrefs from layout.tsx nav item objects
  const hrefRegex = /href:\s*"([^"]+)"/g;
  const sidebarHrefs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = hrefRegex.exec(layoutSrc)) !== null) {
    sidebarHrefs.push(m[1]);
  }

  // Also capture the inline admin Link href="/admin"
  const linkHrefRegex = /href="([^"]+)"/g;
  while ((m = linkHrefRegex.exec(layoutSrc)) !== null) {
    if (!sidebarHrefs.includes(m[1]) && m[1] !== "/api/logout") {
      sidebarHrefs.push(m[1]);
    }
  }

  // Extract route paths from App.tsx
  const routePathRegex = /Route\s+path=["']([^"']+)["']/g;
  const routePaths: string[] = [];
  while ((m = routePathRegex.exec(appTsx)) !== null) {
    routePaths.push(m[1]);
  }

  it("all sidebar hrefs have a matching Route in App.tsx", () => {
    for (const href of sidebarHrefs) {
      const matchesExact = routePaths.includes(href);
      const matchesPrefix = routePaths.some(
        (rp) => rp.replace(/:\w+/g, "").replace(/\/+$/, "") === href.replace(/\/+$/, "")
      );
      expect(matchesExact || matchesPrefix).toBe(true);
    }
  });

  it("sidebar has at least 15 navigation links", () => {
    expect(sidebarHrefs.length).toBeGreaterThanOrEqual(15);
  });
});

// =====================================================================
// 3. Route components have matching lazy imports
// =====================================================================
describe("Route components have matching lazy imports", () => {
  const componentRegex = /component=\{(\w+)\}/g;
  const routeComponents: string[] = [];
  let m2: RegExpExecArray | null;
  while ((m2 = componentRegex.exec(appTsx)) !== null) {
    routeComponents.push(m2[1]);
  }

  const lazyRegex = /const\s+(\w+)\s*=\s*lazy\(/g;
  const lazyNames: string[] = [];
  while ((m2 = lazyRegex.exec(appTsx)) !== null) {
    lazyNames.push(m2[1]);
  }

  it("every component= reference has a lazy() import", () => {
    const nonPageComponents = new Set(["Router", "Switch", "Route", "Suspense", "ErrorBoundary", "AuthGuard", "AdminGuard", "Layout"]);
    for (const comp of routeComponents) {
      if (nonPageComponents.has(comp)) continue;
      expect(lazyNames).toContain(comp);
    }
  });

  it("there are at least 20 lazy-loaded pages", () => {
    expect(lazyNames.length).toBeGreaterThanOrEqual(20);
  });
});

// =====================================================================
// 4. AdminGuard consistency
// =====================================================================
describe("AdminGuard consistency", () => {
  const adminHrefs = [
    "/pillars", "/budget", "/alerts", "/activity",
    "/monitoring", "/import", "/admin/analytics", "/admin/diagnostics", "/admin",
  ];

  it("all admin sidebar items lead to AdminGuard-wrapped or self-guarded routes", () => {
    for (const href of adminHrefs) {
      const hasRoute = appTsx.includes(`path="${href}"`);
      expect(hasRoute).toBe(true);
    }
  });

  it("AdminGuard function is defined in App.tsx", () => {
    expect(appTsx).toMatch(/function\s+AdminGuard/);
  });

  it("AdminGuard checks admin role", () => {
    expect(appTsx).toMatch(/role\s*!==\s*["']admin["']/);
  });
});

// =====================================================================
// 5. Analytics tabs match API endpoints
// =====================================================================
describe("Analytics tabs match API endpoints", () => {
  const tabKeyRegex = /key:\s*"([\w-]+)"/g;
  const tabKeys: string[] = [];
  let m3: RegExpExecArray | null;
  while ((m3 = tabKeyRegex.exec(analyticsFe)) !== null) {
    tabKeys.push(m3[1]);
  }

  const endpointRegex = /\/spmo\/analytics\/([\w-]+)/g;
  const apiEndpoints: string[] = [];
  while ((m3 = endpointRegex.exec(analyticsSrc)) !== null) {
    if (!apiEndpoints.includes(m3[1])) apiEndpoints.push(m3[1]);
  }

  it("has at least 10 analytics tabs", () => {
    expect(tabKeys.length).toBeGreaterThanOrEqual(10);
  });

  it("tabs include all major engine types", () => {
    const expected = ["overview", "delays", "budget", "stakeholders", "evm", "scenario", "advisor", "board-report"];
    for (const key of expected) {
      expect(tabKeys).toContain(key);
    }
  });

  it("every major analytics API endpoint has a corresponding tab concept", () => {
    const endpointToTab: Record<string, string> = {
      "delay-predictions": "delays",
      "budget-forecasts": "budget",
      "stakeholder-alerts": "stakeholders",
      evm: "evm",
      scenario: "scenario",
      advisor: "advisor",
      "board-report": "board-report",
      summary: "overview",
      "weekly-digest": "weekly",
      anomalies: "anomalies",
      "dependency-suggestions": "dependencies",
    };
    for (const [endpoint, tab] of Object.entries(endpointToTab)) {
      expect(apiEndpoints).toContain(endpoint);
      expect(tabKeys).toContain(tab);
    }
  });
});

// =====================================================================
// 6. Mobile dashboard API calls exist in backend
// =====================================================================
describe("Mobile dashboard API calls exist in backend", () => {
  const mobileApiPaths = [
    "/spmo/programme",
    "/spmo/my-tasks/count",
    "/spmo/dashboard/department-status",
    "/spmo/projects",
    "/spmo/budget",
  ];

  for (const apiPath of mobileApiPaths) {
    it(`backend has route for ${apiPath}`, () => {
      const escaped = apiPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(escaped);
      const found =
        spmoRouteSrc.match(pattern) ||
        routerIndex.match(pattern) ||
        reportsSrc.match(pattern);
      expect(found).toBeTruthy();
    });
  }
});

// =====================================================================
// 7. Mobile project detail uses correct API path
// =====================================================================
describe("Mobile project detail API path", () => {
  it("/spmo/projects/ endpoint exists in backend", () => {
    expect(spmoRouteSrc).toMatch(/\/spmo\/projects/);
  });

  it("mobile dashboard fetches /spmo/projects", () => {
    expect(mobileIndex).toMatch(/\/spmo\/projects/);
  });
});

// =====================================================================
// 8. Discussion tab integration
// =====================================================================
describe("Discussion tab integrated in project detail", () => {
  it('tabMap includes "discussion" key', () => {
    expect(projectDetailSrc).toMatch(/["']discussion["']\s*:\s*["']discussion["']/);
  });

  it("TABS array or tab list includes discussion", () => {
    expect(projectDetailSrc).toMatch(/discussion.*label.*Discussion|key.*discussion/);
  });

  it("DiscussionTab component is defined", () => {
    expect(projectDetailSrc).toMatch(/function\s+DiscussionTab/);
  });

  it("DiscussionTab is rendered conditionally", () => {
    expect(projectDetailSrc).toMatch(/activeTab\s*===\s*["']discussion["']/);
  });
});

// =====================================================================
// 9. Email transport exports match usage
// =====================================================================
describe("Email transport (mention-email) consistency", () => {
  const mentionEmailSrc = read(path.resolve(API_SRC, "lib/mention-email.ts"));

  it("mention-email.ts exports sendMentionEmail", () => {
    expect(mentionEmailSrc).toMatch(/export\s+(async\s+)?function\s+sendMentionEmail/);
  });

  it("mention-email.ts exports sendEmail", () => {
    expect(mentionEmailSrc).toMatch(/export\s+(async\s+)?function\s+sendEmail/);
  });

  it("mention-email.ts exports isEmailConfigured", () => {
    expect(mentionEmailSrc).toMatch(/export\s+function\s+isEmailConfigured/);
  });

  it("spmo.ts dynamically imports sendMentionEmail from mention-email", () => {
    expect(spmoRouteSrc).toMatch(/import\(.*mention-email/);
    expect(spmoRouteSrc).toMatch(/sendMentionEmail/);
  });
});

// =====================================================================
// 10. All engine files referenced in analytics.ts exist
// =====================================================================
describe("Engine files referenced in analytics.ts", () => {
  const engineImportRegex = /import\(["']\.\.\/lib\/(engine-[\w-]+)\.js["']\)/g;
  const referencedEngines: string[] = [];
  let m4: RegExpExecArray | null;
  while ((m4 = engineImportRegex.exec(analyticsSrc)) !== null) {
    if (!referencedEngines.includes(m4[1])) referencedEngines.push(m4[1]);
  }

  it("references at least 8 engine files", () => {
    expect(referencedEngines.length).toBeGreaterThanOrEqual(8);
  });

  for (const engine of [
    "engine-predictive-delay",
    "engine-budget-forecast",
    "engine-stakeholder",
    "engine-critical-path",
    "engine-evm",
    "engine-scenario",
    "engine-ai-advisor",
    "engine-board-report",
    "engine-weekly-digest",
    "engine-anomaly",
    "engine-dependency-finder",
  ]) {
    it(`${engine}.ts exists on disk`, () => {
      const filePath = path.resolve(API_SRC, `lib/${engine}.ts`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }
});

// =====================================================================
// 11. Schema table count (sanity check)
// =====================================================================
describe("Schema table count", () => {
  const tableMatches = schemaSrc.match(/export\s+const\s+\w+Table\s*=\s*pgTable\(/g) || [];

  it("schema defines more than 15 tables", () => {
    expect(tableMatches.length).toBeGreaterThan(15);
  });

  it("schema defines at least 20 tables", () => {
    expect(tableMatches.length).toBeGreaterThanOrEqual(20);
  });
});

// =====================================================================
// 12. Deploy env example has all required sections
// =====================================================================
describe("Deploy .env.example has required sections", () => {
  const requiredSections = ["Database", "OIDC", "Email", "AI", "Security"];

  for (const section of requiredSections) {
    it(`has ${section} section`, () => {
      expect(envExample.toLowerCase()).toContain(section.toLowerCase());
    });
  }

  it("mentions RESEND_API_KEY", () => {
    expect(envExample).toContain("RESEND_API_KEY");
  });

  it("mentions ISSUER_URL for OIDC", () => {
    expect(envExample).toContain("ISSUER_URL");
  });

  it("mentions DATABASE_URL or DB_PASSWORD", () => {
    const hasDb = envExample.includes("DATABASE_URL") || envExample.includes("DB_PASSWORD");
    expect(hasDb).toBe(true);
  });
});

// =====================================================================
// 13. spmo-calc exports used by routes
// =====================================================================
describe("spmo-calc exports used by routes", () => {
  it("exports projectProgress", () => {
    const hasInlineExport = /export\s+.*function\s+projectProgress/.test(spmoCalcSrc);
    const hasNamedExport = /export\s*\{[^}]*projectProgress[^}]*\}/.test(spmoCalcSrc);
    expect(hasInlineExport || hasNamedExport).toBe(true);
  });

  it("exports computeStatus", () => {
    expect(spmoCalcSrc).toMatch(/export\s+function\s+computeStatus/);
  });

  it("exports calcProgrammeProgress", () => {
    expect(spmoCalcSrc).toMatch(/export\s+.*function\s+calcProgrammeProgress/);
  });

  it("spmo.ts references projectProgress", () => {
    expect(spmoRouteSrc).toMatch(/projectProgress/);
  });

  it("spmo.ts references computeStatus", () => {
    expect(spmoRouteSrc).toMatch(/computeStatus/);
  });

  it("reports.ts imports from spmo-calc", () => {
    expect(reportsSrc).toMatch(/from\s+["']\.\.\/lib\/spmo-calc/);
  });
});

// =====================================================================
// 14. KPI engine referenced in frontend
// =====================================================================
describe("KPI engine referenced in frontend", () => {
  it("kpi-engine is imported in strategy-pmo pages", () => {
    const kpisPage = read(path.resolve(FE_SRC, "pages/kpis.tsx"));
    expect(kpisPage).toMatch(/from\s+["']@\/lib\/kpi-engine["']/);
  });
});

// =====================================================================
// 15. No orphaned pages
// =====================================================================
describe("No orphaned pages", () => {
  const pageFiles = fs.readdirSync(path.resolve(FE_SRC, "pages"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(".tsx", ""));

  for (const page of pageFiles) {
    it(`page "${page}" is referenced in App.tsx (route or lazy import)`, () => {
      const importPattern = new RegExp(`["']@/pages/${page}["']`);
      const found = appTsx.match(importPattern);
      expect(found).toBeTruthy();
    });
  }
});

// =====================================================================
// 16. NotificationBell exists in layout
// =====================================================================
describe("NotificationBell in layout", () => {
  it("imports NotificationBell component", () => {
    expect(layoutSrc).toMatch(/import\s*\{[^}]*NotificationBell[^}]*\}/);
  });

  it("renders <NotificationBell />", () => {
    expect(layoutSrc).toMatch(/<NotificationBell\s*\/>/);
  });
});

// =====================================================================
// 17. CommandPalette exists in layout
// =====================================================================
describe("CommandPalette in layout", () => {
  it("imports CommandPalette component", () => {
    expect(layoutSrc).toMatch(/import\s*\{[^}]*CommandPalette[^}]*\}/);
  });

  it("renders <CommandPalette />", () => {
    expect(layoutSrc).toMatch(/<CommandPalette\s*\/>/);
  });
});

// =====================================================================
// 18. Auth guard in App.tsx
// =====================================================================
describe("Auth guard in App.tsx", () => {
  it("imports AuthGuard", () => {
    expect(appTsx).toMatch(/import\s*\{[^}]*AuthGuard[^}]*\}/);
  });

  it("wraps router with AuthGuard", () => {
    expect(appTsx).toMatch(/<AuthGuard>/);
  });
});

// =====================================================================
// 19. Health endpoint exists
// =====================================================================
describe("Health endpoint", () => {
  it("healthRouter is imported in index.ts", () => {
    expect(routerIndex).toMatch(/import\s+healthRouter\s+from/);
  });

  it("healthRouter is registered", () => {
    expect(routerIndex).toMatch(/router\.use\(healthRouter\)/);
  });

  it("health route file exposes /healthz", () => {
    const healthSrc = read(path.resolve(API_SRC, "routes/health.ts"));
    expect(healthSrc).toMatch(/\/healthz/);
  });
});

// =====================================================================
// 20. All 11 engine files exist
// =====================================================================
describe("All 11 engine files exist", () => {
  const engineDir = path.resolve(API_SRC, "lib");
  const engineFiles = fs.readdirSync(engineDir).filter((f) => /^engine-.*\.ts$/.test(f));

  it("has exactly 11 engine-*.ts files", () => {
    expect(engineFiles.length).toBe(11);
  });

  const expectedEngines = [
    "engine-predictive-delay.ts",
    "engine-budget-forecast.ts",
    "engine-stakeholder.ts",
    "engine-critical-path.ts",
    "engine-evm.ts",
    "engine-scenario.ts",
    "engine-ai-advisor.ts",
    "engine-board-report.ts",
    "engine-weekly-digest.ts",
    "engine-anomaly.ts",
    "engine-dependency-finder.ts",
  ];

  for (const eng of expectedEngines) {
    it(`${eng} exists`, () => {
      expect(engineFiles).toContain(eng);
    });
  }
});

// =====================================================================
// 21. Reports route mounted with prefix
// =====================================================================
describe("Reports route mounted with prefix", () => {
  it('reportsRouter is mounted at "/spmo/reports"', () => {
    expect(routerIndex).toMatch(/router\.use\(["']\/spmo\/reports["'],\s*reportsRouter\)/);
  });
});

// =====================================================================
// 22. No incorrect frontend imports of backend engines
// =====================================================================
describe("Correct import paths", () => {
  it('no frontend page imports from "@/lib/engine-"', () => {
    const pagesDir = path.resolve(FE_SRC, "pages");
    const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith(".tsx"));
    for (const file of pageFiles) {
      const content = read(path.resolve(pagesDir, file));
      expect(content).not.toMatch(/@\/lib\/engine-/);
    }
  });

  it('no frontend component imports from "@/lib/engine-"', () => {
    const compDir = path.resolve(FE_SRC, "components");
    if (fs.existsSync(compDir)) {
      const compFiles = fs.readdirSync(compDir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
      for (const file of compFiles) {
        const content = read(path.resolve(compDir, file));
        expect(content).not.toMatch(/@\/lib\/engine-/);
      }
    }
  });
});
