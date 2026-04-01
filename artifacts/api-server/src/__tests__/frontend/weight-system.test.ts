import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FRONTEND_SRC = path.resolve(__dirname, "../../../../strategy-pmo/src");
const API_SRC = path.resolve(__dirname, "../../");

describe("Weight cascade system verification", () => {
  // ─────────────────────────────────────────────────────────────
  // spmo-calc.ts — weight cascade logic
  // ─────────────────────────────────────────────────────────────
  describe("spmo-calc.ts weight cascade logic", () => {
    const calcContent = fs.readFileSync(
      path.join(API_SRC, "lib/spmo-calc.ts"),
      "utf-8",
    );

    it("contains adminWeightsSet or adminWeightSum check", () => {
      const hasAdminWeightsSet = calcContent.includes("adminWeightsSet");
      const hasAdminWeightSum = calcContent.includes("adminWeightSum");
      expect(hasAdminWeightsSet || hasAdminWeightSum).toBe(true);
    });

    it("contains Math.abs(adminWeightSum - 100) validation (weights must sum to ~100%)", () => {
      // The validation ensures admin weights are only used when they sum close to 100%
      const hasAbsCheck = /Math\.abs\(\s*adminWeightSum\s*-\s*100\s*\)/.test(calcContent);
      expect(hasAbsCheck).toBe(true);
    });

    it("implements weight cascade order: admin > budget > effortDays > equal", () => {
      // The cascade should check admin weights first, then budget, then effort, then equal
      const adminIdx = calcContent.indexOf("adminWeightsSet");
      const budgetIdx = calcContent.indexOf("allHaveBudget");
      const effortIdx = calcContent.indexOf("useEffortDays");

      expect(adminIdx).toBeGreaterThan(-1);
      expect(budgetIdx).toBeGreaterThan(-1);
      expect(effortIdx).toBeGreaterThan(-1);

      // Admin check must come before budget check, which must come before effort check
      expect(adminIdx).toBeLessThan(budgetIdx);
      expect(budgetIdx).toBeLessThan(effortIdx);

      // The weightSource type should enumerate all four cascade levels
      const hasWeightSourceType = /weightSource.*"admin".*"budget".*"effort".*"equal"/.test(calcContent);
      expect(hasWeightSourceType).toBe(true);
    });

    it("exports computeProjectWeights", () => {
      expect(calcContent).toMatch(/export\s+(async\s+)?function\s+computeProjectWeights/);
    });

    it("exports computeInitiativeWeights", () => {
      expect(calcContent).toMatch(/export\s+(async\s+)?function\s+computeInitiativeWeights/);
    });

    it("exports computePillarWeights", () => {
      expect(calcContent).toMatch(/export\s+(async\s+)?function\s+computePillarWeights/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // spmo.ts — bulk weight endpoints and response shapes
  // ─────────────────────────────────────────────────────────────
  describe("spmo.ts weight endpoints", () => {
    const routeContent = fs.readFileSync(
      path.join(API_SRC, "routes/spmo.ts"),
      "utf-8",
    );

    it("has bulk weight endpoint: PUT /initiatives/:id/projects/weights", () => {
      expect(routeContent).toMatch(
        /router\.put\(\s*["'`]\/spmo\/initiatives\/:id\/projects\/weights["'`]/,
      );
    });

    it("has bulk weight endpoint: PUT /pillars/:id/initiatives/weights", () => {
      expect(routeContent).toMatch(
        /router\.put\(\s*["'`]\/spmo\/pillars\/:id\/initiatives\/weights["'`]/,
      );
    });

    it("has weight reset endpoint: POST /initiatives/:id/projects/weights/reset", () => {
      expect(routeContent).toMatch(
        /router\.post\(\s*["'`]\/spmo\/initiatives\/:id\/projects\/weights\/reset["'`]/,
      );
    });

    it("has weight reset endpoint: POST /pillars/:id/initiatives/weights/reset", () => {
      expect(routeContent).toMatch(
        /router\.post\(\s*["'`]\/spmo\/pillars\/:id\/initiatives\/weights\/reset["'`]/,
      );
    });

    it("returns effectiveWeight and weightSource in project list response", () => {
      // The project list handler should attach effectiveWeight and weightSource
      const hasEffectiveWeight = routeContent.includes("effectiveWeight");
      const hasWeightSource = routeContent.includes("weightSource");
      expect(hasEffectiveWeight).toBe(true);
      expect(hasWeightSource).toBe(true);

      // Specifically for projects — there should be a pattern like:
      // effectiveWeight: wInfo?.effectiveWeight ?? 0, weightSource: wInfo?.weightSource ?? "equal"
      const projectWeightPattern = /effectiveWeight:\s*wInfo\?\.effectiveWeight\s*\?\?\s*0.*weightSource:\s*wInfo\?\.weightSource/;
      expect(routeContent).toMatch(projectWeightPattern);
    });

    it("returns effectiveWeight in initiative list response", () => {
      // Initiative list should include effectiveWeight from initWeightMaps
      const initWeightPattern = /initWeightMaps/;
      expect(routeContent).toMatch(initWeightPattern);

      // The initiative response spreads effectiveWeight
      expect(routeContent).toMatch(/effectiveWeight:\s*wInfo\?\.effectiveWeight/);
    });

    it("returns effectiveWeight in pillar list response", () => {
      // Pillar list attaches effectiveWeight from the pillar weight map
      expect(routeContent).toMatch(/effectiveWeight:\s*pw\?\.effectiveWeight/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Frontend pages — reading effectiveWeight for display
  // ─────────────────────────────────────────────────────────────
  describe("projects.tsx weight display", () => {
    const projectsContent = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/projects.tsx"),
      "utf-8",
    );

    it("reads effectiveWeight (not just weight) for display", () => {
      // Should reference effectiveWeight for showing project weights
      expect(projectsContent).toContain("effectiveWeight");

      // Should use effectiveWeight in weight display, e.g. Math.round((project as any).effectiveWeight)
      expect(projectsContent).toMatch(/effectiveWeight/);
    });

    it("computeProportionalWeights accepts startDate and dueDate parameters", () => {
      // The function signature should accept items with startDate and dueDate
      const fnMatch = projectsContent.match(
        /function\s+computeProportionalWeights\s*\(([^)]+)\)/,
      );
      expect(fnMatch).not.toBeNull();

      // The items type should include startDate and dueDate
      expect(projectsContent).toMatch(
        /computeProportionalWeights.*startDate.*dueDate/s,
      );
    });

    it("has resetWeightsToDuration function (Duration button)", () => {
      // The function should exist for resetting weights based on date duration
      expect(projectsContent).toMatch(
        /function\s+resetWeightsToDuration/,
      );

      // It should be wired to a button click handler
      expect(projectsContent).toMatch(/onClick.*resetWeightsToDuration/s);
    });
  });

  describe("initiatives.tsx weight display", () => {
    const initiativesContent = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/initiatives.tsx"),
      "utf-8",
    );

    it("reads effectiveWeight for display", () => {
      expect(initiativesContent).toContain("effectiveWeight");

      // Should use effectiveWeight when showing initiative weights
      // Pattern: (init as any).effectiveWeight or similar
      expect(initiativesContent).toMatch(/effectiveWeight/);
    });
  });

  describe("pillars.tsx weight display", () => {
    const pillarsContent = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/pillars.tsx"),
      "utf-8",
    );

    it("reads effectiveWeight for display", () => {
      expect(pillarsContent).toContain("effectiveWeight");

      // Should use effectiveWeight for pillar weight display
      expect(pillarsContent).toMatch(/effectiveWeight/);
    });
  });
});
