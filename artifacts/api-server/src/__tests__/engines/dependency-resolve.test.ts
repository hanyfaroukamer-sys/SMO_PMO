import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { resolveDependencies } from "../../lib/dep-engine.js";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoDependenciesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const uid = () => `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("resolveDependencies", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectAId: number;
  let projectBId: number;
  let msA: number;
  let msB: number;
  let msC: number;
  const createdDepIds: number[] = [];

  beforeAll(async () => {
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [init] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-resolve",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 1_000_000,
    }).returning();
    initiativeId = init.id;

    const [projA] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " ProjA",
      ownerId: "test-resolve",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 600_000,
    }).returning();
    projectAId = projA.id;

    const [projB] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid() + " ProjB",
      ownerId: "test-resolve",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 400_000,
    }).returning();
    projectBId = projB.id;

    const [ma] = await db.insert(spmoMilestonesTable).values({
      projectId: projectAId, name: uid() + " M-A", progress: 0, status: "pending",
    }).returning();
    const [mb] = await db.insert(spmoMilestonesTable).values({
      projectId: projectBId, name: uid() + " M-B", progress: 0, status: "pending",
    }).returning();
    const [mc] = await db.insert(spmoMilestonesTable).values({
      projectId: projectBId, name: uid() + " M-C", progress: 0, status: "pending",
    }).returning();
    msA = ma.id; msB = mb.id; msC = mc.id;
  });

  afterAll(async () => {
    await db.delete(spmoDependenciesTable).where(eq(spmoDependenciesTable.createdById, "test-resolve"));
    await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, [projectAId, projectBId]));
    await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, [projectAId, projectBId]));
    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  afterEach(async () => {
    if (createdDepIds.length > 0) {
      await db.delete(spmoDependenciesTable).where(inArray(spmoDependenciesTable.id, createdDepIds));
      createdDepIds.splice(0, createdDepIds.length);
    }
    // Reset milestones to clean state
    await db.update(spmoMilestonesTable).set({ progress: 0, status: "pending", approvedAt: null }).where(
      inArray(spmoMilestonesTable.id, [msA, msB, msC])
    );
  });

  it("1. Milestone with no dependencies → ready, empty blockers", async () => {
    const result = await resolveDependencies(msC, "milestone");
    expect(result.status).toBe("ready");
    expect(result.blockers).toHaveLength(0);
  });

  it("2. Milestone with 1 hard dep, source at 80% → blocked", async () => {
    await db.update(spmoMilestonesTable).set({ progress: 80 }).where(eq(spmoMilestonesTable.id, msA));
    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA,
      targetType: "milestone",
      targetId: msB,
      depType: "ms-ms",
      isHard: true,
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep.id);

    const result = await resolveDependencies(msB, "milestone");
    expect(result.status).toBe("blocked");
    expect(result.blockers[0].sourceProgress).toBe(80);
  });

  it("3. Source at 100% and approved → ready", async () => {
    await db.update(spmoMilestonesTable).set({
      progress: 100,
      status: "approved",
      approvedAt: new Date(),
    }).where(eq(spmoMilestonesTable.id, msA));

    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA,
      targetType: "milestone",
      targetId: msB,
      depType: "ms-ms",
      isHard: true,
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep.id);

    const result = await resolveDependencies(msB, "milestone");
    expect(result.status).toBe("ready");
    expect(result.blockers[0].satisfied).toBe(true);
  });

  it("4. Source at 100% but NOT approved → still blocked", async () => {
    await db.update(spmoMilestonesTable).set({ progress: 100, status: "submitted" }).where(
      eq(spmoMilestonesTable.id, msA)
    );

    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA,
      targetType: "milestone",
      targetId: msB,
      depType: "ms-ms",
      isHard: true,
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep.id);

    const result = await resolveDependencies(msB, "milestone");
    expect(result.status).toBe("blocked");
    expect(result.blockers[0].reason).toMatch(/approval/i);
  });

  it("5. Two hard deps, 1 satisfied and 1 not → blocked", async () => {
    // msA = approved (satisfied), msC = pending (not satisfied)
    await db.update(spmoMilestonesTable).set({
      progress: 100, status: "approved", approvedAt: new Date(),
    }).where(eq(spmoMilestonesTable.id, msA));
    await db.update(spmoMilestonesTable).set({ progress: 40, status: "in_progress" }).where(
      eq(spmoMilestonesTable.id, msC)
    );

    const [dep1] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA,
      targetType: "milestone",
      targetId: msB,
      depType: "ms-ms",
      isHard: true,
      createdById: "test-resolve",
    }).returning();
    const [dep2] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msC,
      targetType: "milestone",
      targetId: msB,
      depType: "ms-ms",
      isHard: true,
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep1.id, dep2.id);

    const result = await resolveDependencies(msB, "milestone");
    expect(result.status).toBe("blocked");
    expect(result.blockers).toHaveLength(2);
    const unsatisfied = result.blockers.filter(b => !b.satisfied);
    expect(unsatisfied).toHaveLength(1);
  });

  it("6. Soft dep, unsatisfied → ready (soft deps don't block)", async () => {
    await db.update(spmoMilestonesTable).set({ progress: 20, status: "in_progress" }).where(
      eq(spmoMilestonesTable.id, msA)
    );

    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA,
      targetType: "milestone",
      targetId: msB,
      depType: "ms-ms",
      isHard: false, // SOFT dependency
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep.id);

    const result = await resolveDependencies(msB, "milestone");
    expect(result.status).toBe("ready");
    expect(result.blockers[0].isHard).toBe(false);
  });

  it("7. proj-proj dep, source at 55%, threshold 60% → blocked", async () => {
    // Set milestone in projA so computed progress ≈ 55%
    await db.update(spmoMilestonesTable).set({ progress: 55 }).where(eq(spmoMilestonesTable.id, msA));

    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "project",
      sourceId: projectAId,
      targetType: "project",
      targetId: projectBId,
      depType: "proj-proj",
      sourceThreshold: 60,
      isHard: true,
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep.id);

    const result = await resolveDependencies(projectBId, "project");
    expect(result.status).toBe("blocked");
    expect(result.blockers[0].required).toBe(60);
  });

  it("8. proj-proj dep, source at 65%, threshold 60% → ready", async () => {
    await db.update(spmoMilestonesTable).set({ progress: 65 }).where(eq(spmoMilestonesTable.id, msA));

    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "project",
      sourceId: projectAId,
      targetType: "project",
      targetId: projectBId,
      depType: "proj-proj",
      sourceThreshold: 60,
      isHard: true,
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep.id);

    const result = await resolveDependencies(projectBId, "project");
    expect(result.status).toBe("ready");
  });

  it("9. Lag days: source approved, within lag period → blocked", async () => {
    // Approve source with today's approvedAt, add 30 lag days
    await db.update(spmoMilestonesTable).set({
      progress: 100,
      status: "approved",
      approvedAt: new Date(), // Just approved now
    }).where(eq(spmoMilestonesTable.id, msA));

    const [dep] = await db.insert(spmoDependenciesTable).values({
      sourceType: "milestone",
      sourceId: msA,
      targetType: "milestone",
      targetId: msB,
      depType: "ms-ms",
      isHard: true,
      lagDays: 30, // 30-day lag — not expired yet
      createdById: "test-resolve",
    }).returning();
    createdDepIds.push(dep.id);

    const result = await resolveDependencies(msB, "milestone");
    // Source is satisfied but we're within the lag window → still blocked
    expect(result.status).toBe("blocked");
  });
});
