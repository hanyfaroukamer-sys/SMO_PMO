import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FRONTEND_SRC = path.resolve(__dirname, "../../../../strategy-pmo/src");

describe("Hook fixes verification", () => {
  describe("use-toast.ts - TOAST_REMOVE_DELAY", () => {
    const content = fs.readFileSync(
      path.join(FRONTEND_SRC, "hooks/use-toast.ts"),
      "utf-8",
    );

    it("sets TOAST_REMOVE_DELAY to 5000 (not 1000000)", () => {
      const match = content.match(/TOAST_REMOVE_DELAY\s*=\s*(\d+)/);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(5000);
    });

    it("does not use the problematic 1000000 value", () => {
      expect(content).not.toContain("1000000");
    });
  });

  describe("use-mobile.tsx - initial state", () => {
    const content = fs.readFileSync(
      path.join(FRONTEND_SRC, "hooks/use-mobile.tsx"),
      "utf-8",
    );

    it("initializes state using window.innerWidth check (not undefined)", () => {
      // Should check window.innerWidth for SSR-safe initial state
      expect(content).toContain("window.innerWidth");
      // The initial useState should use a conditional, not just `undefined`
      const hasConditionalInit =
        /useState[^)]*window\.innerWidth/.test(content) ||
        /typeof window/.test(content);
      expect(hasConditionalInit).toBe(true);
    });

    it("does not initialize isMobile as undefined", () => {
      // Should not have useState(undefined) or useState<boolean>() with no init
      const undefinedInit = /useState\s*<\s*boolean\s*>\s*\(\s*\)/.test(content);
      const explicitUndefined = /useState\s*<\s*boolean\s*>\s*\(\s*undefined\s*\)/.test(content);
      expect(undefinedInit).toBe(false);
      expect(explicitUndefined).toBe(false);
    });
  });

  describe("gantt-chart.tsx - TODAY constant", () => {
    const content = fs.readFileSync(
      path.join(FRONTEND_SRC, "components/gantt-chart.tsx"),
      "utf-8",
    );

    it("does not define module-level TODAY constant", () => {
      // TODAY should NOT be at module scope (causes stale date bugs)
      // It should be inside a component, ideally in useMemo
      const lines = content.split("\n");
      const moduleLevelToday = lines.some((line, i) => {
        // A module-level const would not be inside a function
        // Check: is "const TODAY = new Date()" before any function/component definition?
        return /^const\s+TODAY\s*=\s*new\s+Date\(\)/.test(line.trim());
      });
      expect(moduleLevelToday).toBe(false);
    });

    it("uses useMemo for TODAY within a component", () => {
      expect(content).toContain("useMemo");
      // TODAY should be inside a useMemo
      const todayInMemo = /const\s+TODAY\s*=\s*useMemo\s*\(/.test(content);
      expect(todayInMemo).toBe(true);
    });
  });
});
