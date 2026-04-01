import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/* ── Source paths ─────────────────────────────────────────────── */
const ANALYTICS_PAGE = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/pages/analytics.tsx",
);
const ANALYTICS_ROUTER = path.resolve(
  __dirname,
  "../../routes/analytics.ts",
);
const ROUTES_INDEX = path.resolve(
  __dirname,
  "../../routes/index.ts",
);
const APP_TSX = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/App.tsx",
);
const LAYOUT_TSX = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/components/layout.tsx",
);

/* ── Tests ────────────────────────────────────────────────────── */

describe("Analytics page wiring", () => {
  it("analytics.tsx exists and exports a default component", () => {
    expect(fs.existsSync(ANALYTICS_PAGE)).toBe(true);
    const src = fs.readFileSync(ANALYTICS_PAGE, "utf-8");
    expect(src).toMatch(/export\s+default\b/);
  });

  it("analytics.ts router exists and exports a default router", () => {
    expect(fs.existsSync(ANALYTICS_ROUTER)).toBe(true);
    const src = fs.readFileSync(ANALYTICS_ROUTER, "utf-8");
    expect(src).toMatch(/export\s+default\s+router/);
  });
});

describe("Analytics router registers all 9 endpoints", () => {
  const src = fs.readFileSync(ANALYTICS_ROUTER, "utf-8");

  const endpoints = [
    "delay-predictions",
    "budget-forecasts",
    "stakeholder-alerts",
    "critical-path",
    "evm",
    "scenario",
    "advisor",
    "board-report",
    "summary",
  ] as const;

  for (const ep of endpoints) {
    it(`registers /spmo/analytics/${ep}`, () => {
      expect(src).toContain(`/spmo/analytics/${ep}`);
    });
  }

  it("has exactly 9 route registrations", () => {
    const routeMatches = src.match(/router\.(get|post|put|patch|delete)\s*\(/g);
    expect(routeMatches).not.toBeNull();
    expect(routeMatches!.length).toBe(9);
  });
});

describe("Analytics router is imported in routes/index.ts", () => {
  const src = fs.readFileSync(ROUTES_INDEX, "utf-8");

  it("imports analyticsRouter from ./analytics", () => {
    expect(src).toMatch(/import\s+\w*[Aa]nalytics\w*\s+from\s+["']\.\/analytics["']/);
  });

  it("uses the analytics router via router.use()", () => {
    expect(src).toMatch(/router\.use\(\s*\w*[Aa]nalytics\w*\s*\)/);
  });
});

describe("App.tsx analytics route", () => {
  const src = fs.readFileSync(APP_TSX, "utf-8");

  it("has a route for /admin/analytics", () => {
    expect(src).toContain("/admin/analytics");
  });

  it("lazy-loads the Analytics page component", () => {
    expect(src).toMatch(/const\s+Analytics\s*=\s*lazy\s*\(/);
  });

  it("wraps the analytics route in AdminGuard", () => {
    // The route line should include both AdminGuard and Analytics
    const lines = src.split("\n");
    const analyticsRouteLine = lines.find(
      (l) => l.includes("/admin/analytics") && l.includes("AdminGuard"),
    );
    expect(analyticsRouteLine).toBeDefined();
  });
});

describe("Layout sidebar includes Analytics entry", () => {
  const src = fs.readFileSync(LAYOUT_TSX, "utf-8");

  it("has a sidebar entry pointing to /admin/analytics", () => {
    expect(src).toContain("/admin/analytics");
  });

  it('labels the sidebar entry "Analytics"', () => {
    // Should have an entry with title "Analytics" and href "/admin/analytics"
    const lines = src.split("\n");
    const analyticsLine = lines.find(
      (l) => l.includes("Analytics") && l.includes("/admin/analytics"),
    );
    expect(analyticsLine).toBeDefined();
  });
});
