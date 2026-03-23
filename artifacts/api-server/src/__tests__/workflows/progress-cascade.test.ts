/**
 * Progress cascade test.
 * Verifies that milestone progress rolls up correctly through
 * the entire hierarchy: Milestone → Project → Initiative → Pillar → Strategy.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  projectProgress,
  initiativeProgress,
  pillarProgress,
  calcProgrammeProgress,
} from "../../lib/spmo-calc.js";

const uid = () => `casc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("Progress cascade: milestone → strategy", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectAId: number;
  let projectBId: number;
  let msA1: number;
  let msB1: number;

  beforeAll(async () => {
    // Step 1: Create hierarchy — 1 pillar → 1 initiative → 2 projects (60M / 40M)
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [init] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-casc",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 100_000_000,
    }).returning();
    initiativeId = init.id;

    const [projA] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " ProjectA",
      ownerId: "test-casc",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 60_000_000, // 60% weight
    }).returning();
    projectAId = projA.id;

    const [projB] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " ProjectB",
      ownerId: "test-casc",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 40_000_000, // 40% weight
    }).returning();
    projectBId = projB.id;

    // Step 2: Create milestones
    const [mA] = await db.insert(spmoMilestonesTable).values({
      projectId: projectAId, name: uid() + " A-M1", progress: 0, effortDays: 100, status: "in_progress",
    }).returning();
    const [mB] = await db.insert(spmoMilestonesTable).values({
      projectId: projectBId, name: uid() + " B-M1", progress: 0, effortDays: 100, status: "in_progress",
    }).returning();
    msA1 = mA.id;
    msB1 = mB.id;
  });

  afterAll(async () => {
    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [msA1, msB1]));
    await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, [projectAId, projectBId]));
    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("Step 2: Set all milestones in project A to 80%", async () => {
    await db.update(spmoMilestonesTable)
      .set({ progress: 80 })
      .where(eq(spmoMilestonesTable.id, msA1));
  });

  it("Step 3: Set all milestones in project B to 50%", async () => {
    await db.update(spmoMilestonesTable)
      .set({ progress: 50 })
      .where(eq(spmoMilestonesTable.id, msB1));
  });

  it("Step 4: Project A progress = 80%", async () => {
    const result = await projectProgress(projectAId);
    expect(result.progress).toBe(80);
  });

  it("Step 5: Project B progress = 50%", async () => {
    const result = await projectProgress(projectBId);
    expect(result.progress).toBe(50);
  });

  it("Step 6: Initiative progress = 68% (80×0.6 + 50×0.4 = 68)", async () => {
    const result = await initiativeProgress(initiativeId);
    // 80*(60/100) + 50*(40/100) = 48 + 20 = 68
    expect(result.progress).toBe(68);
  });

  it("Step 7: Pillar progress = 68% (single initiative)", async () => {
    const result = await pillarProgress(pillarId);
    // Budget-weighted: only one initiative with budget 100M → 68%
    expect(result.progress).toBe(68);
  });

  it("Step 8: Strategy-level calcProgrammeProgress includes this pillar at 68%", async () => {
    const result = await calcProgrammeProgress();
    const pillarSummary = result.pillarSummaries.find(p => p.pillar.id === pillarId);
    expect(pillarSummary).toBeDefined();
    expect(pillarSummary!.progress).toBe(68);
  });
});
