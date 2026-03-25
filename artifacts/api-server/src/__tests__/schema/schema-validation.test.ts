import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

// ─────────────────────────────────────────────
// Re-create minimal Zod schemas matching the Drizzle schema in
// lib/db/src/schema/spmo.ts so we can validate constraints
// without importing the DB layer (which requires DATABASE_URL).
// ─────────────────────────────────────────────

const projectStatusEnum = z.enum(["active", "on_hold", "completed", "cancelled"]);

const insertSpmoProjectSchema = z.object({
  depStatus: z.enum(["blocked", "ready"]).default("ready"),
  projectCode: z.string().optional(),
  initiativeId: z.number().int(),
  departmentId: z.number().int().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  ownerId: z.string().min(1),
  ownerName: z.string().optional(),
  startDate: z.string(), // date as string
  targetDate: z.string(),
  weight: z.number().default(0),
  budget: z.string().default("0"),
  budgetCapex: z.string().default("0"),
  budgetOpex: z.string().default("0"),
  budgetSpent: z.string().default("0"),
  status: projectStatusEnum.default("active"),
});

const insertSpmoInitiativeSchema = z.object({
  pillarId: z.number().int(),
  initiativeCode: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  ownerId: z.string().min(1),
  ownerName: z.string().optional(),
  startDate: z.string(),
  targetDate: z.string(),
  weight: z.number().default(0),
  budget: z.string().default("0"),
  status: z.enum(["active", "on_hold", "completed", "cancelled"]).default("active"),
  sortOrder: z.number().int().default(0),
});

const insertSpmoKpiSchema = z.object({
  type: z.enum(["strategic", "operational"]).default("strategic"),
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().default(""),
  baseline: z.number().default(0),
  target: z.number().default(0),
  actual: z.number().default(0),
  projectId: z.number().int().optional(),
  pillarId: z.number().int().optional(),
  initiativeId: z.number().int().optional(),
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),
  status: z
    .enum(["exceeding", "on_track", "at_risk", "critical", "achieved", "not_started"])
    .default("on_track"),
  kpiType: z.enum(["cumulative", "rate", "milestone", "reduction"]).default("rate"),
  direction: z.enum(["higher", "lower"]).default("higher"),
  measurementPeriod: z.enum(["annual", "quarterly", "monthly"]).default("annual"),
});

const insertSpmoBudgetSchema = z.object({
  projectId: z.number().int().optional(),
  pillarId: z.number().int().optional(),
  category: z.string().min(1),
  description: z.string().optional(),
  allocated: z.string().default("0"),
  spent: z.string().default("0"),
  currency: z.string().default("SAR"),
  period: z.string().min(1),
  fiscalYear: z.number().int().optional(),
  fiscalQuarter: z.number().int().optional(),
});

const insertSpmoRiskSchema = z.object({
  pillarId: z.number().int().optional(),
  projectId: z.number().int().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  probability: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  impact: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  riskScore: z.number().int().default(4),
  owner: z.string().optional(),
  status: z.enum(["open", "mitigated", "accepted", "closed"]).default("open"),
});

const insertSpmoDependencySchema = z.object({
  sourceType: z.enum(["milestone", "project"]),
  sourceId: z.number().int(),
  sourceThreshold: z.number().default(100),
  targetType: z.enum(["milestone", "project"]),
  targetId: z.number().int(),
  depType: z.enum(["ms-ms", "ms-proj", "proj-proj"]),
  lagDays: z.number().int().default(0),
  isHard: z.boolean().default(true),
  notes: z.string().optional(),
  createdById: z.string().optional(),
});

const insertSpmoMilestoneSchema = z.object({
  depStatus: z.enum(["blocked", "ready"]).default("ready"),
  projectId: z.number().int(),
  name: z.string().min(1),
  description: z.string().optional(),
  weight: z.number().default(0),
  effortDays: z.number().optional(),
  progress: z.number().default(0),
  status: z
    .enum(["pending", "in_progress", "submitted", "approved", "rejected"])
    .default("pending"),
  phaseGate: z.enum(["planning", "tendering", "closure"]).optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("Schema validation — Project", () => {
  it("accepts a valid project with required fields", () => {
    const data = {
      initiativeId: 1,
      name: "Smartcity Portal",
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
    };
    const result = insertSpmoProjectSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("requires name", () => {
    const data = {
      initiativeId: 1,
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
    };
    const result = insertSpmoProjectSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("requires initiativeId", () => {
    const data = {
      name: "Portal",
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
    };
    const result = insertSpmoProjectSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("projectCode is optional", () => {
    const withCode = {
      initiativeId: 1,
      name: "Portal",
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      projectCode: "PRJ-001",
    };
    const withoutCode = {
      initiativeId: 1,
      name: "Portal",
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
    };
    expect(insertSpmoProjectSchema.safeParse(withCode).success).toBe(true);
    expect(insertSpmoProjectSchema.safeParse(withoutCode).success).toBe(true);
  });

  it("defaults status to active", () => {
    const data = {
      initiativeId: 1,
      name: "Portal",
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
    };
    const result = insertSpmoProjectSchema.parse(data);
    expect(result.status).toBe("active");
  });

  it("rejects invalid status enum value", () => {
    const data = {
      initiativeId: 1,
      name: "Portal",
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      status: "unknown",
    };
    const result = insertSpmoProjectSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("Schema validation — Initiative", () => {
  it("requires name and pillarId", () => {
    const valid = {
      pillarId: 1,
      name: "Digital Transformation",
      ownerId: "user-1",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
    };
    expect(insertSpmoInitiativeSchema.safeParse(valid).success).toBe(true);

    const missingName = { ...valid, name: undefined };
    expect(insertSpmoInitiativeSchema.safeParse(missingName).success).toBe(false);

    const missingPillar = { ...valid, pillarId: undefined };
    expect(insertSpmoInitiativeSchema.safeParse(missingPillar).success).toBe(false);
  });

  it("dates are strings (date format)", () => {
    const data = {
      pillarId: 1,
      name: "Init",
      ownerId: "user-1",
      startDate: "2025-06-01",
      targetDate: "2026-06-01",
    };
    const result = insertSpmoInitiativeSchema.parse(data);
    expect(typeof result.startDate).toBe("string");
    expect(typeof result.targetDate).toBe("string");
  });
});

describe("Schema validation — KPI", () => {
  it("requires name", () => {
    const valid = { name: "Revenue Growth" };
    expect(insertSpmoKpiSchema.safeParse(valid).success).toBe(true);

    const invalid = {};
    expect(insertSpmoKpiSchema.safeParse(invalid).success).toBe(false);
  });

  it("target and actual default to 0 (numbers)", () => {
    const result = insertSpmoKpiSchema.parse({ name: "Speed" });
    expect(result.target).toBe(0);
    expect(result.actual).toBe(0);
    expect(typeof result.target).toBe("number");
    expect(typeof result.actual).toBe("number");
  });

  it("pillarId is optional (nullable in DB)", () => {
    const without = { name: "Speed" };
    const withPillar = { name: "Speed", pillarId: 5 };
    expect(insertSpmoKpiSchema.safeParse(without).success).toBe(true);
    expect(insertSpmoKpiSchema.safeParse(withPillar).success).toBe(true);
  });
});

describe("Schema validation — Budget", () => {
  it("requires category and period", () => {
    const valid = { category: "CAPEX", period: "2025-Q1" };
    expect(insertSpmoBudgetSchema.safeParse(valid).success).toBe(true);

    const missingCategory = { period: "2025-Q1" };
    expect(insertSpmoBudgetSchema.safeParse(missingCategory).success).toBe(false);

    const missingPeriod = { category: "CAPEX" };
    expect(insertSpmoBudgetSchema.safeParse(missingPeriod).success).toBe(false);
  });

  it("allocated and spent default to '0' (string/numeric)", () => {
    const result = insertSpmoBudgetSchema.parse({ category: "OPEX", period: "2025-Q2" });
    expect(result.allocated).toBe("0");
    expect(result.spent).toBe("0");
    expect(typeof result.allocated).toBe("string");
    expect(typeof result.spent).toBe("string");
  });

  it("projectId is optional", () => {
    const data = { category: "OPEX", period: "2025-Q2" };
    expect(insertSpmoBudgetSchema.safeParse(data).success).toBe(true);
  });
});

describe("Schema validation — Risk", () => {
  it("requires title", () => {
    expect(insertSpmoRiskSchema.safeParse({ title: "Vendor delay" }).success).toBe(true);
    expect(insertSpmoRiskSchema.safeParse({}).success).toBe(false);
  });

  it("probability accepts valid enum values", () => {
    for (const val of ["low", "medium", "high", "critical"]) {
      expect(
        insertSpmoRiskSchema.safeParse({ title: "R", probability: val }).success
      ).toBe(true);
    }
  });

  it("impact accepts valid enum values", () => {
    for (const val of ["low", "medium", "high", "critical"]) {
      expect(
        insertSpmoRiskSchema.safeParse({ title: "R", impact: val }).success
      ).toBe(true);
    }
  });

  it("rejects invalid probability/impact values", () => {
    expect(
      insertSpmoRiskSchema.safeParse({ title: "R", probability: "extreme" }).success
    ).toBe(false);
    expect(
      insertSpmoRiskSchema.safeParse({ title: "R", impact: "tiny" }).success
    ).toBe(false);
  });

  it("status defaults to open", () => {
    const result = insertSpmoRiskSchema.parse({ title: "R" });
    expect(result.status).toBe("open");
  });
});

describe("Schema validation — Dependency", () => {
  it("requires sourceType, sourceId, targetType, targetId, depType", () => {
    const valid = {
      sourceType: "milestone" as const,
      sourceId: 1,
      targetType: "project" as const,
      targetId: 2,
      depType: "ms-proj" as const,
    };
    expect(insertSpmoDependencySchema.safeParse(valid).success).toBe(true);
  });

  it("sourceType must be 'milestone' or 'project'", () => {
    const data = {
      sourceType: "task",
      sourceId: 1,
      targetType: "project",
      targetId: 2,
      depType: "ms-proj",
    };
    expect(insertSpmoDependencySchema.safeParse(data).success).toBe(false);
  });

  it("depType must be 'ms-ms', 'ms-proj', or 'proj-proj'", () => {
    const base = {
      sourceType: "milestone" as const,
      sourceId: 1,
      targetType: "milestone" as const,
      targetId: 2,
    };
    expect(
      insertSpmoDependencySchema.safeParse({ ...base, depType: "ms-ms" }).success
    ).toBe(true);
    expect(
      insertSpmoDependencySchema.safeParse({ ...base, depType: "ms-proj" }).success
    ).toBe(true);
    expect(
      insertSpmoDependencySchema.safeParse({ ...base, depType: "proj-proj" }).success
    ).toBe(true);
    expect(
      insertSpmoDependencySchema.safeParse({ ...base, depType: "invalid" }).success
    ).toBe(false);
  });

  it("defaults isHard to true and lagDays to 0", () => {
    const result = insertSpmoDependencySchema.parse({
      sourceType: "project",
      sourceId: 1,
      targetType: "project",
      targetId: 2,
      depType: "proj-proj",
    });
    expect(result.isHard).toBe(true);
    expect(result.lagDays).toBe(0);
  });
});

describe("Schema validation — Milestone", () => {
  it("requires name and projectId", () => {
    const valid = { name: "Design Complete", projectId: 1 };
    expect(insertSpmoMilestoneSchema.safeParse(valid).success).toBe(true);

    expect(insertSpmoMilestoneSchema.safeParse({ projectId: 1 }).success).toBe(false);
    expect(
      insertSpmoMilestoneSchema.safeParse({ name: "Design Complete" }).success
    ).toBe(false);
  });

  it("weight defaults to 0", () => {
    const result = insertSpmoMilestoneSchema.parse({ name: "M1", projectId: 1 });
    expect(result.weight).toBe(0);
  });

  it("status defaults to pending", () => {
    const result = insertSpmoMilestoneSchema.parse({ name: "M1", projectId: 1 });
    expect(result.status).toBe("pending");
  });

  it("status enum accepts all valid values", () => {
    for (const s of ["pending", "in_progress", "submitted", "approved", "rejected"]) {
      const data = { name: "M1", projectId: 1, status: s };
      expect(insertSpmoMilestoneSchema.safeParse(data).success).toBe(true);
    }
  });

  it("rejects invalid status value", () => {
    const data = { name: "M1", projectId: 1, status: "done" };
    expect(insertSpmoMilestoneSchema.safeParse(data).success).toBe(false);
  });
});
