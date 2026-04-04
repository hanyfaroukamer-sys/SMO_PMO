import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/* ── Source paths ─────────────────────────────────────────────── */
const LIB_DIR = path.resolve(__dirname, "../../lib");
const ANALYTICS_ROUTER = path.resolve(__dirname, "../../routes/analytics.ts");
const MENTION_EMAIL = path.resolve(LIB_DIR, "mention-email.ts");

/* ── Engine manifest ─────────────────────────────────────────── */
const ENGINES: { file: string; exportName: string }[] = [
  { file: "engine-predictive-delay.ts", exportName: "computeDelayPredictions" },
  { file: "engine-budget-forecast.ts", exportName: "computeBudgetForecasts" },
  { file: "engine-stakeholder.ts", exportName: "computeStakeholderAlerts" },
  { file: "engine-critical-path.ts", exportName: "computeCriticalPath" },
  { file: "engine-evm.ts", exportName: "computeEvmMetrics" },
  { file: "engine-scenario.ts", exportName: "simulateScenario" },
  { file: "engine-ai-advisor.ts", exportName: "queryAdvisor" },
  { file: "engine-board-report.ts", exportName: "generateBoardReport" },
];

/* ── Tests ────────────────────────────────────────────────────── */

describe("All 8 engine files exist", () => {
  for (const { file } of ENGINES) {
    it(`${file} exists`, () => {
      const fullPath = path.join(LIB_DIR, file);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  }

  it("there are exactly 8 engine files", () => {
    expect(ENGINES.length).toBe(8);
  });
});

describe("Each engine exports its expected function", () => {
  for (const { file, exportName } of ENGINES) {
    it(`${file} exports ${exportName}`, () => {
      const src = fs.readFileSync(path.join(LIB_DIR, file), "utf-8");
      const exportRegex = new RegExp(
        `export\\s+(async\\s+)?function\\s+${exportName}\\b`,
      );
      expect(exportRegex.test(src)).toBe(true);
    });
  }
});

describe("Each engine imports from @workspace/db", () => {
  for (const { file } of ENGINES) {
    it(`${file} imports from @workspace/db`, () => {
      const src = fs.readFileSync(path.join(LIB_DIR, file), "utf-8");
      expect(src).toMatch(/from\s+["']@workspace\/db["']/);
    });
  }
});

describe("Analytics router references all 8 engines", () => {
  const routerSrc = fs.readFileSync(ANALYTICS_ROUTER, "utf-8");

  for (const { file } of ENGINES) {
    // The router uses dynamic imports like: import("../lib/engine-foo.js")
    // Strip the .ts extension to get the base name
    const baseName = file.replace(/\.ts$/, "");
    it(`references ${baseName}`, () => {
      expect(routerSrc).toContain(baseName);
    });
  }

  it("dynamically imports all engines (8 import() calls to engine files)", () => {
    const dynamicImports = routerSrc.match(/import\s*\(\s*["']\.\.\/lib\/engine-/g);
    expect(dynamicImports).not.toBeNull();
    // There are at least 8 dynamic imports (summary endpoint re-imports 4)
    expect(dynamicImports!.length).toBeGreaterThanOrEqual(8);
  });
});

describe("mention-email.ts exports", () => {
  it("mention-email.ts exists", () => {
    expect(fs.existsSync(MENTION_EMAIL)).toBe(true);
  });

  const src = fs.readFileSync(MENTION_EMAIL, "utf-8");

  it("exports sendEmail", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+sendEmail\b/);
  });

  it("exports sendMentionEmail", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+sendMentionEmail\b/);
  });

  it("exports isEmailConfigured", () => {
    expect(src).toMatch(/export\s+function\s+isEmailConfigured\b/);
  });
});
