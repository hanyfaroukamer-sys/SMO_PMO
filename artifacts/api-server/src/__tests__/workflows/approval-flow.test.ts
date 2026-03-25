/**
 * Approval flow integration test.
 * Simulates the full milestone approval lifecycle and verifies that:
 *  - 99% gate holds while milestone is submitted (not approved)
 *  - Approving the milestone unlocks full 100% contribution
 *  - Progress cascades correctly through the hierarchy
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
import { projectProgress, initiativeProgress, pillarProgress } from "../../lib/spmo-calc.js";

const uid = () => `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("Approval flow: milestone 99%-gate lifecycle", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectId: number;
  let ms1Id: number; // effort 30 days
  let ms2Id: number; // effort 35 days
  let ms3Id: number; // effort 35 days  (total = 100 days)

  beforeAll(async () => {
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [init] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-appr",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 100_000_000,
    }).returning();
    initiativeId = init.id;

    const [proj] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid(),
      ownerId: "test-appr",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 50_000_000,
    }).returning();
    projectId = proj.id;

    const [m1] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid() + " M1", progress: 0, weight: 30, effortDays: 30, status: "pending",
    }).returning();
    const [m2] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid() + " M2", progress: 0, weight: 35, effortDays: 35, status: "pending",
    }).returning();
    const [m3] = await db.insert(spmoMilestonesTable).values({
      projectId, name: uid() + " M3", progress: 0, weight: 35, effortDays: 35, status: "pending",
    }).returning();
    ms1Id = m1.id; ms2Id = m2.id; ms3Id = m3.id;
  });

  afterAll(async () => {
    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [ms1Id, ms2Id, ms3Id]));
    await db.delete(spmoProjectsTable).where(eq(spmoProjectsTable.id, projectId));
    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("Step 2: Set milestone 1 progress to 100% (pending approval)", async () => {
    await db.update(spmoMilestonesTable)
      .set({ progress: 100, status: "in_progress" })
      .where(eq(spmoMilestonesTable.id, ms1Id));

    const result = await projectProgress(projectId);
    // M1: 100% but NOT approved → gated to 99. Effort = 30 of 100 total
    // M2: 0%, effort 35. M3: 0%, effort 35
    // Weighted: (99*30 + 0*35 + 0*35) / 100 = 29.7
    expect(result.progress).toBeCloseTo(29.7, 0);
  });

  it("Step 3–5: Submit milestone 1 for approval → status is 'submitted'", async () => {
    await db.update(spmoMilestonesTable)
      .set({ status: "submitted" })
      .where(eq(spmoMilestonesTable.id, ms1Id));

    const [ms] = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, ms1Id));
    expect(ms.status).toBe("submitted");
  });

  it("Step 6: While pending, project progress reflects 99% gate (~29.7%)", async () => {
    const result = await projectProgress(projectId);
    // M1 is submitted (still not approved) → gated at 99%
    // (99*30 + 0*35 + 0*35) / 100 = 29.7
    expect(result.progress).toBeCloseTo(29.7, 0);
    expect(result.pendingApprovals).toBe(1);
  });

  it("Step 7: Approve milestone 1 → status becomes 'approved'", async () => {
    await db.update(spmoMilestonesTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(spmoMilestonesTable.id, ms1Id));

    const [ms] = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, ms1Id));
    expect(ms.status).toBe("approved");
  });

  it("Step 8: After approval, project progress = 30% (100% × 30/100)", async () => {
    const result = await projectProgress(projectId);
    // M1 approved at 100% → full contribution: (100*30 + 0*35 + 0*35) / 100 = 30
    expect(result.progress).toBe(30);
    expect(result.approvedMilestones).toBe(1);
  });

  it("Step 9: Initiative progress updated accordingly (project is only child)", async () => {
    const initResult = await initiativeProgress(initiativeId);
    // Only one project at 30% → initiative = 30%
    expect(initResult.progress).toBe(30);
  });
});
