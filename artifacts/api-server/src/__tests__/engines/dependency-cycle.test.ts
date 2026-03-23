import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { detectCycle } from "../../lib/dep-engine.js";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoDependenciesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const uid = () => `cyc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("detectCycle — dependency graph cycle detection", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectAId: number;
  let projectBId: number;
  let msA1: number, msA2: number, msA3: number, msA9: number;
  let msB5: number, msB7: number;
  const depIds: number[] = [];

  beforeAll(async () => {
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [init] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-cycle",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 1_000_000,
    }).returning();
    initiativeId = init.id;

    const [projA] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " A",
      ownerId: "test-cycle",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 500_000,
    }).returning();
    projectAId = projA.id;

    const [projB] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " B",
      ownerId: "test-cycle",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 500_000,
    }).returning();
    projectBId = projB.id;

    // Project A: milestones (ordered by ID = insertion order)
    const [m1] = await db.insert(spmoMilestonesTable).values({ projectId: projectAId, name: uid() + " A-M1" }).returning();
    const [m2] = await db.insert(spmoMilestonesTable).values({ projectId: projectAId, name: uid() + " A-M2" }).returning();
    const [m3] = await db.insert(spmoMilestonesTable).values({ projectId: projectAId, name: uid() + " A-M3" }).returning();
    const [m9] = await db.insert(spmoMilestonesTable).values({ projectId: projectAId, name: uid() + " A-M9" }).returning();
    msA1 = m1.id; msA2 = m2.id; msA3 = m3.id; msA9 = m9.id;

    // Project B: milestones
    const [m5] = await db.insert(spmoMilestonesTable).values({ projectId: projectBId, name: uid() + " B-M5" }).returning();
    const [m7] = await db.insert(spmoMilestonesTable).values({ projectId: projectBId, name: uid() + " B-M7" }).returning();
    msB5 = m5.id; msB7 = m7.id;
  });

  afterAll(async () => {
    if (depIds.length) {
      await db.delete(spmoDependenciesTable).where(inArray(spmoDependenciesTable.id, depIds));
    }
    await db.delete(spmoDependenciesTable).where(eq(spmoDependenciesTable.createdById, "test-cycle"));
    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, [projectAId, projectBId]));
    await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, [projectAId, projectBId]));
    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("1. Simple A→B (no existing deps): no cycle → false", async () => {
    const hasCycle = await detectCycle(msA1, msB5);
    expect(hasCycle).toBe(false);
  });

  it("2. A→B then try to add B→A: cycle → true", async () => {
    // Insert A-M1 → B-M5
    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA1,
      targetType: "milestone",
      targetId: msB5,
      depType: "ms-ms",
      createdById: "test-cycle",
    }).returning();
    depIds.push(dep.id);

    // Now try adding B-M5 → A-M1 (reverse)
    const hasCycle = await detectCycle(msB5, msA1);
    expect(hasCycle).toBe(true);

    // Cleanup for next test
    await db.delete(spmoDependenciesTable).where(eq(spmoDependenciesTable.id, dep.id));
    depIds.splice(depIds.indexOf(dep.id), 1);
  });

  it("3. A→B→C then try to add C→A: cycle → true", async () => {
    const [dep1] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA1,
      targetType: "milestone",
      targetId: msB5,
      depType: "ms-ms",
      createdById: "test-cycle",
    }).returning();
    const [dep2] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msB5,
      targetType: "milestone",
      targetId: msA2,
      depType: "ms-ms",
      createdById: "test-cycle",
    }).returning();
    depIds.push(dep1.id, dep2.id);

    // Try adding A-M2 → A-M1 (A2 → A1 closes A1→B5→A2→A1)
    const hasCycle = await detectCycle(msA2, msA1);
    expect(hasCycle).toBe(true);

    // Cleanup
    await db.delete(spmoDependenciesTable).where(inArray(spmoDependenciesTable.id, [dep1.id, dep2.id]));
    depIds.splice(0, depIds.length);
  });

  it("4. A.M3→B.M5, B.M7→A.M9: no cycle (valid cross-project deps with intra ordering)", async () => {
    // msA3 < msA9 (by ID — intra-A ordering adds msA3→msA9)
    // msB5 < msB7 (by ID — intra-B ordering adds msB5→msB7)
    // Cross: msA3→msB5 and msB7→msA9
    // Full paths: msA3→msB5→msB7→msA9 (no cycle — all forward)
    const [dep1] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA3,
      targetType: "milestone",
      targetId: msB5,
      depType: "ms-ms",
      createdById: "test-cycle",
    }).returning();
    depIds.push(dep1.id);

    // Check adding B.M7→A.M9 creates no cycle
    const hasCycle = await detectCycle(msB7, msA9);
    expect(hasCycle).toBe(false);

    await db.delete(spmoDependenciesTable).where(eq(spmoDependenciesTable.id, dep1.id));
    depIds.splice(0, depIds.length);
  });

  it("5. Empty graph, add any edge → no cycle", async () => {
    // No deps in DB for these milestones
    const hasCycle = await detectCycle(msA1, msB7);
    expect(hasCycle).toBe(false);
  });

  it("6. Self-reference A→A: cycle → true", async () => {
    const hasCycle = await detectCycle(msA1, msA1);
    expect(hasCycle).toBe(true);
  });
});
