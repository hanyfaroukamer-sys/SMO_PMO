/**
 * Dependency flow integration test.
 * Simulates the complete dependency blocking/unblocking cycle:
 * 1. Create dependency: A.M3 must be complete before B.M5 can start
 * 2. Verify B.M5 is blocked
 * 3. Complete A.M3 (100%) — still blocked (not approved)
 * 4. Approve A.M3 — B.M5 becomes ready
 * 5. Update B.M5 progress — succeeds
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoDependenciesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { resolveDependencies, recalculateDownstreamStatuses } from "../../lib/dep-engine.js";

const uid = () => `depflow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("Dependency blocking/unblocking cycle", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectAId: number;
  let projectBId: number;
  let msA3: number; // source milestone (project A)
  let msB5: number; // target milestone (project B)
  let depId: number;

  beforeAll(async () => {
    // Step 1: Create two projects with one milestone each
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [init] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-depflow",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 1_000_000,
    }).returning();
    initiativeId = init.id;

    const [projA] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " A",
      ownerId: "test-depflow",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 500_000,
    }).returning();
    projectAId = projA.id;

    const [projB] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " B",
      ownerId: "test-depflow",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 500_000,
    }).returning();
    projectBId = projB.id;

    const [mA] = await db.insert(spmoMilestonesTable).values({
      projectId: projectAId, name: uid() + " A-M3", progress: 0, status: "pending",
    }).returning();
    const [mB] = await db.insert(spmoMilestonesTable).values({
      projectId: projectBId, name: uid() + " B-M5", progress: 0, status: "pending",
    }).returning();
    msA3 = mA.id;
    msB5 = mB.id;

    // Step 2: Create hard dependency: A.M3 → B.M5
    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA3,
      targetType: "milestone",
      targetId: msB5,
      depType: "ms-ms",
      isHard: true,
      createdById: "test-depflow",
    }).returning();
    depId = dep.id;
  });

  afterAll(async () => {
    await db.delete(spmoDependenciesTable).where(eq(spmoDependenciesTable.id, depId));
    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, [msA3, msB5]));
    await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, [projectAId, projectBId]));
    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("Step 3: B.M5 dependency status is 'blocked' (A.M3 at 0%)", async () => {
    const result = await resolveDependencies(msB5, "milestone");
    expect(result.status).toBe("blocked");
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].isHard).toBe(true);
  });

  it("Step 4: Trying to update B.M5 while blocked should be reflected in dep resolution", async () => {
    // The API layer enforces the block; here we just verify the dep state is still blocked
    const result = await resolveDependencies(msB5, "milestone");
    expect(result.status).toBe("blocked");
  });

  it("Step 5: Set A.M3 to 100% (but not approved)", async () => {
    await db.update(spmoMilestonesTable)
      .set({ progress: 100, status: "submitted" })
      .where(eq(spmoMilestonesTable.id, msA3));

    await recalculateDownstreamStatuses(msA3);
    // B.M5 should STILL be blocked (ms-ms requires approval)
    const result = await resolveDependencies(msB5, "milestone");
    expect(result.status).toBe("blocked");
    expect(result.blockers[0].reason).toMatch(/approval/i);
  });

  it("Step 7: Approve A.M3 → B.M5 becomes 'ready'", async () => {
    await db.update(spmoMilestonesTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(spmoMilestonesTable.id, msA3));

    await recalculateDownstreamStatuses(msA3);
    const result = await resolveDependencies(msB5, "milestone");
    expect(result.status).toBe("ready");
    expect(result.blockers[0].satisfied).toBe(true);
  });

  it("Step 9: Update B.M5 progress to 50% → succeeds (dep is satisfied)", async () => {
    await db.update(spmoMilestonesTable)
      .set({ progress: 50, status: "in_progress" })
      .where(eq(spmoMilestonesTable.id, msB5));

    const [ms] = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, msB5));
    expect(ms.progress).toBe(50);
    expect(ms.status).toBe("in_progress");

    // Dep still shows ready even after progress update
    const result = await resolveDependencies(msB5, "milestone");
    expect(result.status).toBe("ready");
  });
});
