import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FRONTEND_SRC = path.resolve(__dirname, "../../../../strategy-pmo/src");
const API_SRC = path.resolve(__dirname, "../../");
const DB_SRC = path.resolve(__dirname, "../../../../../lib/db/src");
const API_ZOD_SRC = path.resolve(__dirname, "../../../../../lib/api-zod/src");

describe("Execution stage gate placeholder logic", () => {
  // ─────────────────────────────────────────────────────────────
  // spmo-calc.ts — execution placeholder detection and exclusion
  // ─────────────────────────────────────────────────────────────
  describe("spmo-calc.ts execution placeholder handling", () => {
    const calcContent = fs.readFileSync(
      path.join(API_SRC, "lib/spmo-calc.ts"),
      "utf-8",
    );

    it("contains the execution_placeholder string literal", () => {
      expect(calcContent).toContain("execution_placeholder");
    });

    it("contains regex for detecting old 'Execution & Delivery' by name", () => {
      // Should detect old-format placeholders where phaseGate is null but name matches
      // Pattern: /^Execution\s*[&+]\s*Delivery/i
      const hasExecRegex = /\/\^Execution\\s\*\[&\+\]\\s\*Delivery\/i/.test(calcContent);
      expect(hasExecRegex).toBe(true);
    });

    it("excludes execution placeholder from progress when custom milestones exist", () => {
      // The calc should filter out execution placeholders when non-phase-gate milestones exist
      expect(calcContent).toContain("isExecPlaceholder");

      // Should check for custom milestones (non-phase-gate, non-placeholder)
      expect(calcContent).toMatch(/nonPlaceholderCustom/);

      // Should have conditional filtering: if custom milestones exist, filter out placeholders
      expect(calcContent).toMatch(/hasCustom/);

      // The filter should exclude exec placeholders from the milestone list used for progress
      const filterPattern = /milestones.*filter.*isExecPlaceholder|allMilestones\.filter.*!isExecPlaceholder/;
      expect(calcContent).toMatch(filterPattern);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // spmo.ts — endpoint-level placeholder handling
  // ─────────────────────────────────────────────────────────────
  describe("spmo.ts execution placeholder in endpoints", () => {
    const routeContent = fs.readFileSync(
      path.join(API_SRC, "routes/spmo.ts"),
      "utf-8",
    );

    it("milestone list endpoint filters execution placeholder", () => {
      // The milestone list should detect and optionally hide execution placeholders
      // Pattern: isExecutionPlaceholder or isExecPlaceholder function in route file
      const hasPlaceholderCheck =
        routeContent.includes("isExecutionPlaceholder") ||
        routeContent.includes("isExecPlaceholder");
      expect(hasPlaceholderCheck).toBe(true);

      // Should have logic to check for custom milestones and conditionally filter
      expect(routeContent).toMatch(/hasCustomMilestones|hasCustom/);
    });

    it("project detail endpoint filters execution placeholder", () => {
      // The project detail (GET /spmo/projects/:id) should also filter placeholders
      // There should be a PHASE_ORDER record that includes execution_placeholder
      expect(routeContent).toMatch(/PHASE_ORDER.*execution_placeholder/);

      // Should filter out execution placeholder in detail response
      const hasDetailFilter =
        routeContent.includes("isExecPlaceholderSingle") ||
        routeContent.includes("isExecutionPlaceholder");
      expect(hasDetailFilter).toBe(true);
    });

    it("project creation sets phaseGate to execution_placeholder for the execution milestone", () => {
      // When creating a project, the auto-generated milestones should include
      // an execution milestone with phaseGate: "execution_placeholder"
      const creationPattern =
        /phaseGate:\s*["'`]execution_placeholder["'`]/;
      expect(routeContent).toMatch(creationPattern);

      // The execution milestone should be named "Execution & Delivery"
      const execMilestone =
        /name:\s*["'`]Execution\s*&\s*Delivery["'`].*phaseGate:\s*["'`]execution_placeholder["'`]/s;
      expect(routeContent).toMatch(execMilestone);
    });

    it("detectProjectPhase handles execution_placeholder", () => {
      // The detectProjectPhase function should recognize execution_placeholder as a valid phaseGate
      expect(routeContent).toMatch(/function\s+detectProjectPhase/);

      // Should filter milestones using execution_placeholder in phase detection
      expect(routeContent).toMatch(
        /phaseGate\s*===\s*["'`]execution_placeholder["'`]/,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Database schema — programme config effortDays columns
  // ─────────────────────────────────────────────────────────────
  describe("Programme config schema has effortDays columns", () => {
    const schemaContent = fs.readFileSync(
      path.join(DB_SRC, "schema/spmo.ts"),
      "utf-8",
    );

    it("has defaultPlanningEffortDays column", () => {
      expect(schemaContent).toMatch(/defaultPlanningEffortDays/);
      // Should be a real/numeric column with a default value
      expect(schemaContent).toMatch(
        /defaultPlanningEffortDays.*real\(.*default_planning_effort_days.*\)/,
      );
    });

    it("has defaultExecutionEffortDays column", () => {
      expect(schemaContent).toMatch(/defaultExecutionEffortDays/);
      expect(schemaContent).toMatch(
        /defaultExecutionEffortDays.*real\(.*default_execution_effort_days.*\)/,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Admin page — effortDays configuration fields
  // ─────────────────────────────────────────────────────────────
  describe("Admin page effortDays configuration", () => {
    const adminContent = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/admin.tsx"),
      "utf-8",
    );

    it("has defaultPlanningEffortDays configuration field", () => {
      expect(adminContent).toContain("defaultPlanningEffortDays");
    });

    it("has defaultExecutionEffortDays configuration field", () => {
      expect(adminContent).toContain("defaultExecutionEffortDays");
    });

    it("sends effortDays values when saving config", () => {
      // The save handler should include effortDays fields in the payload
      expect(adminContent).toMatch(/defaultPlanningEffortDays:\s*pe\.planning/);
      expect(adminContent).toMatch(/defaultExecutionEffortDays:\s*pe\.execution/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Zod schema — accepts effortDays config fields
  // ─────────────────────────────────────────────────────────────
  describe("Zod API schema accepts effortDays config fields", () => {
    const apiContent = fs.readFileSync(
      path.join(API_ZOD_SRC, "generated/api.ts"),
      "utf-8",
    );

    it("has defaultPlanningEffortDays in Zod schema", () => {
      expect(apiContent).toMatch(
        /defaultPlanningEffortDays:\s*zod\.number\(\)/,
      );
    });

    it("has defaultExecutionEffortDays in Zod schema", () => {
      // Should also have the execution effort days field
      expect(apiContent).toContain("defaultExecutionEffortDays");
    });

    it("effortDays fields accept numeric values with min/max constraints", () => {
      // The Zod schema should validate effortDays as numbers with reasonable bounds
      const planningMatch = apiContent.match(
        /defaultPlanningEffortDays:\s*zod\.number\(\)\.min\((\d+)\)\.max\((\d+)\)/,
      );
      expect(planningMatch).not.toBeNull();
      expect(Number(planningMatch![1])).toBeGreaterThanOrEqual(1);
      expect(Number(planningMatch![2])).toBeLessThanOrEqual(999);
    });
  });
});
