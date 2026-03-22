import { eq, and, inArray, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  spmoDependenciesTable,
  spmoMilestonesTable,
  spmoProjectsTable,
} from "@workspace/db";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface BlockerInfo {
  sourceId: number;
  sourceType: "milestone" | "project";
  sourceName: string;
  sourceProject: string;
  sourceProgress: number;
  sourceApproval: string;
  required: number;
  isHard: boolean;
  lagDays: number;
  satisfied: boolean;
  reason: string;
  depType: string;
}

export interface DepResolution {
  status: "blocked" | "ready";
  blockers: BlockerInfo[];
}

export interface CascadeResult {
  directlyBlocked: Array<{ id: number; name: string; project: string; type: string }>;
  indirectlyBlocked: Array<{ id: number; name: string; project: string; type: string; hops: number }>;
  totalAffected: number;
}

// ─────────────────────────────────────────────────────────────────
// Cycle Detection
// ─────────────────────────────────────────────────────────────────

export async function detectCycle(
  newSourceId: number,
  newTargetId: number,
): Promise<boolean> {
  // Fetch all existing dependencies
  const allDeps = await db
    .select({ sourceId: spmoDependenciesTable.sourceId, targetId: spmoDependenciesTable.targetId })
    .from(spmoDependenciesTable);

  // Fetch all milestones for intra-project sequential edges (ordered by id as insertion order proxy)
  const allMilestones = await db
    .select({
      id: spmoMilestonesTable.id,
      projectId: spmoMilestonesTable.projectId,
    })
    .from(spmoMilestonesTable)
    .orderBy(spmoMilestonesTable.id);

  // Build adjacency list: node → [nodes it leads to]
  const adj: Map<number, number[]> = new Map();

  function addEdge(from: number, to: number) {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  // Add explicit cross-project dependency edges
  for (const dep of allDeps) {
    addEdge(dep.sourceId, dep.targetId);
  }

  // Add intra-project sequential edges (earlier id → later id within same project)
  const byProject: Map<number, Array<{ id: number }>> = new Map();
  for (const ms of allMilestones) {
    if (!byProject.has(ms.projectId)) byProject.set(ms.projectId, []);
    byProject.get(ms.projectId)!.push({ id: ms.id });
  }
  for (const milestones of byProject.values()) {
    for (let i = 0; i < milestones.length - 1; i++) {
      addEdge(milestones[i].id, milestones[i + 1].id);
    }
  }

  // Add the proposed new edge temporarily
  addEdge(newSourceId, newTargetId);

  // BFS from newTargetId: can we reach newSourceId?
  const visited = new Set<number>();
  const queue: number[] = [newTargetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === newSourceId) return true; // CYCLE FOUND
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = adj.get(current) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────
// Dependency Resolution
// ─────────────────────────────────────────────────────────────────

export async function resolveDependencies(
  targetId: number,
  targetType: "milestone" | "project",
): Promise<DepResolution> {
  const deps = await db
    .select()
    .from(spmoDependenciesTable)
    .where(
      and(
        eq(spmoDependenciesTable.targetId, targetId),
        eq(spmoDependenciesTable.targetType, targetType),
      ),
    );

  if (deps.length === 0) {
    return { status: "ready", blockers: [] };
  }

  const blockers: BlockerInfo[] = [];

  for (const dep of deps) {
    let sourceProgress = 0;
    let sourceApproval = "none";
    let sourceName = "";
    let sourceProject = "";
    let completedAt: Date | null = null;

    if (dep.sourceType === "milestone") {
      const ms = await db
        .select({
          id: spmoMilestonesTable.id,
          name: spmoMilestonesTable.name,
          progress: spmoMilestonesTable.progress,
          status: spmoMilestonesTable.status,
          approvedAt: spmoMilestonesTable.approvedAt,
          projectId: spmoMilestonesTable.projectId,
        })
        .from(spmoMilestonesTable)
        .where(eq(spmoMilestonesTable.id, dep.sourceId))
        .limit(1);

      if (ms[0]) {
        sourceProgress = ms[0].progress;
        sourceApproval = ms[0].status;
        sourceName = ms[0].name;

        const proj = await db
          .select({ name: spmoProjectsTable.name })
          .from(spmoProjectsTable)
          .where(eq(spmoProjectsTable.id, ms[0].projectId))
          .limit(1);
        sourceProject = proj[0]?.name ?? "";

        if (ms[0].progress >= 100 && ms[0].status === "approved") {
          completedAt = ms[0].approvedAt;
        }
      }
    } else {
      // Source is a project
      const proj = await db
        .select({ id: spmoProjectsTable.id, name: spmoProjectsTable.name })
        .from(spmoProjectsTable)
        .where(eq(spmoProjectsTable.id, dep.sourceId))
        .limit(1);

      if (proj[0]) {
        sourceName = proj[0].name;
        sourceProject = proj[0].name;
        sourceProgress = await getComputedProjectProgress(dep.sourceId);
        sourceApproval = "n/a";
        if (sourceProgress >= dep.sourceThreshold) {
          completedAt = new Date();
        }
      }
    }

    // Determine if satisfied
    let satisfied = false;
    if (dep.depType === "ms-ms" || dep.depType === "ms-proj") {
      satisfied = sourceProgress >= 100 && sourceApproval === "approved";
    } else {
      satisfied = sourceProgress >= dep.sourceThreshold;
    }

    // Check lag period
    if (satisfied && dep.lagDays > 0 && completedAt) {
      const readyAfter = new Date(completedAt);
      readyAfter.setDate(readyAfter.getDate() + dep.lagDays);
      if (new Date() < readyAfter) {
        satisfied = false;
      }
    }

    const required = dep.depType === "proj-proj" ? dep.sourceThreshold : 100;

    let reason = "";
    if (satisfied) {
      reason = "Satisfied";
    } else if (dep.depType === "ms-ms" || dep.depType === "ms-proj") {
      reason =
        sourceProgress >= 100
          ? "Complete but awaiting approval"
          : `At ${Math.round(sourceProgress)}% — needs 100% + approval`;
    } else {
      reason = `At ${Math.round(sourceProgress)}% — needs ${required}%`;
    }

    blockers.push({
      sourceId: dep.sourceId,
      sourceType: dep.sourceType as "milestone" | "project",
      sourceName,
      sourceProject,
      sourceProgress,
      sourceApproval,
      required,
      isHard: dep.isHard,
      lagDays: dep.lagDays,
      satisfied,
      reason,
      depType: dep.depType,
    });
  }

  const hasUnsatisfiedHard = blockers.some((b) => !b.satisfied && b.isHard);

  return {
    status: hasUnsatisfiedHard ? "blocked" : "ready",
    blockers,
  };
}

// ─────────────────────────────────────────────────────────────────
// Cascade recalculation — update dep_status on downstream targets
// ─────────────────────────────────────────────────────────────────

export async function recalculateDownstreamStatuses(sourceId: number): Promise<void> {
  const deps = await db
    .select({
      targetId: spmoDependenciesTable.targetId,
      targetType: spmoDependenciesTable.targetType,
    })
    .from(spmoDependenciesTable)
    .where(eq(spmoDependenciesTable.sourceId, sourceId));

  for (const dep of deps) {
    const resolution = await resolveDependencies(
      dep.targetId,
      dep.targetType as "milestone" | "project",
    );
    const newStatus = resolution.status;

    if (dep.targetType === "milestone") {
      await db
        .update(spmoMilestonesTable)
        .set({ depStatus: newStatus })
        .where(eq(spmoMilestonesTable.id, dep.targetId));
    } else {
      await db
        .update(spmoProjectsTable)
        .set({ depStatus: newStatus })
        .where(eq(spmoProjectsTable.id, dep.targetId));
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Cascade Impact Analysis
// ─────────────────────────────────────────────────────────────────

export async function analyzeCascade(sourceId: number): Promise<CascadeResult> {
  const allDeps = await db
    .select({
      sourceId: spmoDependenciesTable.sourceId,
      targetId: spmoDependenciesTable.targetId,
      targetType: spmoDependenciesTable.targetType,
      isHard: spmoDependenciesTable.isHard,
    })
    .from(spmoDependenciesTable)
    .where(eq(spmoDependenciesTable.isHard, true));

  const directly: CascadeResult["directlyBlocked"] = [];
  const indirectly: CascadeResult["indirectlyBlocked"] = [];
  const visited = new Set<number>();
  const queue: Array<{ id: number; hops: number }> = [{ id: sourceId, hops: 0 }];

  while (queue.length > 0) {
    const { id, hops } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const downstream = allDeps.filter((d) => d.sourceId === id);

    for (const dep of downstream) {
      if (visited.has(dep.targetId)) continue;
      const info = await getNodeInfo(dep.targetId, dep.targetType);

      if (hops === 0) {
        directly.push({ id: dep.targetId, name: info.name, project: info.project, type: dep.targetType });
      } else {
        indirectly.push({ id: dep.targetId, name: info.name, project: info.project, type: dep.targetType, hops });
      }
      queue.push({ id: dep.targetId, hops: hops + 1 });
    }
  }

  return {
    directlyBlocked: directly,
    indirectlyBlocked: indirectly,
    totalAffected: directly.length + indirectly.length,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function getNodeInfo(id: number, type: string): Promise<{ name: string; project: string }> {
  if (type === "milestone") {
    const rows = await db
      .select({ name: spmoMilestonesTable.name, projectId: spmoMilestonesTable.projectId })
      .from(spmoMilestonesTable)
      .where(eq(spmoMilestonesTable.id, id))
      .limit(1);

    if (!rows[0]) return { name: String(id), project: "" };
    const proj = await db
      .select({ name: spmoProjectsTable.name })
      .from(spmoProjectsTable)
      .where(eq(spmoProjectsTable.id, rows[0].projectId))
      .limit(1);
    return { name: rows[0].name, project: proj[0]?.name ?? "" };
  }
  const rows = await db
    .select({ name: spmoProjectsTable.name })
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.id, id))
    .limit(1);
  return { name: rows[0]?.name ?? String(id), project: rows[0]?.name ?? "" };
}

async function getComputedProjectProgress(projectId: number): Promise<number> {
  const milestones = await db
    .select({ weight: spmoMilestonesTable.weight, progress: spmoMilestonesTable.progress })
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.projectId, projectId));

  if (milestones.length === 0) return 0;
  const totalWeight = milestones.reduce((s, m) => s + (m.weight ?? 0), 0);
  if (totalWeight === 0) {
    const avg = milestones.reduce((s, m) => s + (m.progress ?? 0), 0) / milestones.length;
    return Math.round(avg);
  }
  const weighted = milestones.reduce((s, m) => s + ((m.weight ?? 0) / totalWeight) * (m.progress ?? 0), 0);
  return Math.round(weighted);
}
