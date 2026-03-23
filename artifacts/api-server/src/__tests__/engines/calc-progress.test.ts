import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { milestoneEffectiveProgress, projectProgress, initiativeProgress, pillarProgress } from "../../lib/spmo-calc.js";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ─── Pure-function unit tests ───────────────────────────────────────────────

describe("milestoneEffectiveProgress", () => {
  it("approved milestone at 100% → returns 100", () => {
    expect(milestoneEffectiveProgress({ progress: 100, status: "approved" })).toBe(100);
  });

  it("submitted milestone at 100% → capped at 99 (99% gate rule)", () => {
    expect(milestoneEffectiveProgress({ progress: 100, status: "submitted" })).toBe(99);
  });

  it("pending milestone at 100% → capped at 99", () => {
    expect(milestoneEffectiveProgress({ progress: 100, status: "pending" })).toBe(99);
  });

  it("in-progress milestone at 50% → returns 50", () => {
    expect(milestoneEffectiveProgress({ progress: 50, status: "in_progress" })).toBe(50);
  });

  it("in-progress milestone at 0% → returns 0", () => {
    expect(milestoneEffectiveProgress({ progress: 0, status: "in_progress" })).toBe(0);
  });

  it("approved milestone at 80% → returns 80 (no cap below 100)", () => {
    expect(milestoneEffectiveProgress({ progress: 80, status: "approved" })).toBe(80);
  });
});

// ─── DB-backed integration tests ────────────────────────────────────────────

const uid = () => `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("projectProgress (DB integration)", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectId: number;
  const createdProjectIds: number[] = [];

  beforeAll(async () => {
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [initiative] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 100_000_000,
    }).returning();
    initiativeId = initiative.id;

    const [project] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 100_000_000,
    }).returning();
    projectId = project.id;
    createdProjectIds.push(projectId);
  });

  afterAll(async () => {
    if (createdProjectIds.length) {
      await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, createdProjectIds));
      await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, createdProjectIds));
    }
    if (initiativeId) await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    if (pillarId) await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("project with zero milestones → progress = 0", async () => {
    const result = await projectProgress(projectId);
    expect(result.progress).toBe(0);
    expect(result.milestoneCount).toBe(0);
  });

  it("single milestone at 50% with effort 100 → project progress = 50%", async () => {
    const [ms] = await db.insert(spmoMilestonesTable).values({
      projectId,
      name: uid(),
      progress: 50,
      effortDays: 100,
      status: "in_progress",
    }).returning();

    const result = await projectProgress(projectId);
    expect(result.progress).toBe(50);

    await db.delete(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, ms.id));
  });

  it("two milestones at 80% and 40% with equal effort → project = 60%", async () => {
    const [ms1] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 80, effortDays: 50, status: "in_progress",
    }).returning();
    const [ms2] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 40, effortDays: 50, status: "in_progress",
    }).returning();

    const result = await projectProgress(projectId);
    expect(result.progress).toBe(60);

    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [ms1.id, ms2.id]));
  });

  it("two milestones 80%/40% with unequal effort 30/70 → project = 52%", async () => {
    const [ms1] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 80, effortDays: 30, status: "in_progress",
    }).returning();
    const [ms2] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 40, effortDays: 70, status: "in_progress",
    }).returning();

    const result = await projectProgress(projectId);
    // 80*0.3 + 40*0.7 = 24 + 28 = 52
    expect(result.progress).toBe(52);

    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [ms1.id, ms2.id]));
  });

  it("milestone at 100% but status pending → gated progress = 99% (not 100)", async () => {
    const [ms] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 100, effortDays: 100, status: "pending",
    }).returning();

    const result = await projectProgress(projectId);
    expect(result.progress).toBe(99);

    await db.delete(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, ms.id));
  });

  it("milestone at 100% and approved → gated progress = 100%", async () => {
    const [ms] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 100, effortDays: 100, status: "approved",
    }).returning();

    const result = await projectProgress(projectId);
    expect(result.progress).toBe(100);

    await db.delete(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, ms.id));
  });

  it("milestone with effort 0 → no division by zero; falls back to simple average", async () => {
    const [ms1] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 60, effortDays: 0, status: "in_progress",
    }).returning();
    const [ms2] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 80, effortDays: 0, status: "in_progress",
    }).returning();

    let result: Awaited<ReturnType<typeof projectProgress>> | undefined;
    await expect(async () => {
      result = await projectProgress(projectId);
    }).not.toThrow();
    expect(result!.progress).toBe(70); // simple avg of 60 and 80

    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [ms1.id, ms2.id]));
  });

  it("all milestones at 100% and approved → project = 100%", async () => {
    const [ms1] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 100, effortDays: 50, status: "approved",
    }).returning();
    const [ms2] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid(), progress: 100, effortDays: 50, status: "approved",
    }).returning();

    const result = await projectProgress(projectId);
    expect(result.progress).toBe(100);

    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [ms1.id, ms2.id]));
  });
});

describe("initiativeProgress (DB integration)", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectAId: number;
  let projectBId: number;

  beforeAll(async () => {
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [initiative] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 100_000_000,
    }).returning();
    initiativeId = initiative.id;

    const [projA] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 60_000_000,
    }).returning();
    projectAId = projA.id;

    const [projB] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 40_000_000,
    }).returning();
    projectBId = projB.id;
  });

  afterAll(async () => {
    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, [projectAId, projectBId]));
    await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, [projectAId, projectBId]));
    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("two projects budgets 60M/40M at 80%/50% → initiative = 68% (budget-weighted)", async () => {
    const [ms1] = await db.insert(spmoMilestonesTable).values({
      projectId: projectAId, name: uid(), progress: 80, effortDays: 100, status: "in_progress",
    }).returning();
    const [ms2] = await db.insert(spmoMilestonesTable).values({
      projectId: projectBId, name: uid(), progress: 50, effortDays: 100, status: "in_progress",
    }).returning();

    const result = await initiativeProgress(initiativeId);
    // 80*(60/100) + 50*(40/100) = 48 + 20 = 68
    expect(result.progress).toBe(68);

    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [ms1.id, ms2.id]));
  });

  it("empty initiative (no projects) → returns 0 without crash", async () => {
    const [emptyInit] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 50_000_000,
    }).returning();

    const result = await initiativeProgress(emptyInit.id);
    expect(result.progress).toBe(0);
    expect(result.projectCount).toBe(0);

    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, emptyInit.id));
  });
});

describe("pillarProgress (DB integration)", () => {
  let pillarId: number;
  let initiativeAId: number;
  let initiativeBId: number;

  beforeAll(async () => {
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [initA] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 50_000_000,
    }).returning();
    initiativeAId = initA.id;

    const [initB] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 50_000_000,
    }).returning();
    initiativeBId = initB.id;
  });

  afterAll(async () => {
    const projects = await db.select({ id: spmoProjectsTable.id })
      .from(spmoProjectsTable)
      .where(inArray(spmoProjectsTable.initiativeId, [initiativeAId, initiativeBId]));
    if (projects.length) {
      await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, projects.map(p => p.id)));
      await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, projects.map(p => p.id)));
    }
    await db.delete(spmoInitiativesTable).where(inArray(spmoInitiativesTable.id, [initiativeAId, initiativeBId]));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("pillar with two initiatives both at 70% → pillar progress = 70% (budget-weighted)", async () => {
    const [projA] = await db.insert(spmoProjectsTable).values({
      initiativeId: initiativeAId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 50_000_000,
    }).returning();
    const [projB] = await db.insert(spmoProjectsTable).values({
      initiativeId: initiativeBId,
      name: uid(),
      ownerId: "test-user",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 50_000_000,
    }).returning();

    const [ms1] = await db.insert(spmoMilestonesTable).values({
      projectId: projA.id, name: uid(), progress: 70, effortDays: 100, status: "in_progress",
    }).returning();
    const [ms2] = await db.insert(spmoMilestonesTable).values({
      projectId: projB.id, name: uid(), progress: 70, effortDays: 100, status: "in_progress",
    }).returning();

    const result = await pillarProgress(pillarId);
    expect(result.progress).toBe(70);

    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [ms1.id, ms2.id]));
    await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, [projA.id, projB.id]));
  });

  it("empty pillar (no initiatives) → returns 0 without crash", async () => {
    const [emptyPillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    const result = await pillarProgress(emptyPillar.id);
    expect(result.progress).toBe(0);
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, emptyPillar.id));
  });
});
