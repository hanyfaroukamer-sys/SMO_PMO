import { db } from "@workspace/db";
import {
  spmoMilestonesTable,
  spmoProjectsTable,
  spmoDependenciesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// Critical Path Engine
// Computes critical path through milestone dependencies using
// forward/backward pass scheduling (CPM algorithm).
// ─────────────────────────────────────────────────────────────

export interface CriticalPathResult {
  criticalPath: {
    milestoneId: number;
    milestoneName: string;
    projectId: number;
    projectName: string;
    startDate: string | null;
    dueDate: string | null;
    float: number;
    isCritical: boolean;
  }[];
  totalDuration: number; // days
  projectCompletionDate: string; // earliest possible
  bottlenecks: {
    milestoneId: number;
    milestoneName: string;
    dependentCount: number;
  }[];
  cycles: number[]; // IDs of nodes involved in dependency cycles
}

interface MilestoneNode {
  id: number;
  name: string;
  projectId: number;
  projectName: string;
  startDate: string | null;
  dueDate: string | null;
  duration: number; // days
  predecessors: { nodeId: number; lagDays: number }[];
  successors: { nodeId: number; lagDays: number }[];
  // Forward pass
  earliestStart: number;
  earliestFinish: number;
  // Backward pass
  latestStart: number;
  latestFinish: number;
  // Float
  float: number;
}

export async function computeCriticalPath(
  projectId?: number,
): Promise<CriticalPathResult> {
  // 1. Get milestones
  let milestones;
  if (projectId != null) {
    milestones = await db
      .select()
      .from(spmoMilestonesTable)
      .where(eq(spmoMilestonesTable.projectId, projectId));
  } else {
    milestones = await db.select().from(spmoMilestonesTable);
  }

  if (milestones.length === 0) {
    return {
      criticalPath: [],
      totalDuration: 0,
      projectCompletionDate: new Date().toISOString().split("T")[0],
      bottlenecks: [],
      cycles: [],
    };
  }

  // Get project names for display
  const projectIds = [...new Set(milestones.map((m) => m.projectId))];
  const projects =
    projectIds.length > 0
      ? await db
          .select({ id: spmoProjectsTable.id, name: spmoProjectsTable.name })
          .from(spmoProjectsTable)
          .where(inArray(spmoProjectsTable.id, projectIds))
      : [];
  const projectNameMap = new Map(projects.map((p) => [p.id, p.name]));

  // 2. Get all milestone-to-milestone dependencies
  const milestoneIds = milestones.map((m) => m.id);
  let dependencies;
  if (milestoneIds.length > 0) {
    dependencies = await db
      .select()
      .from(spmoDependenciesTable)
      .where(
        and(
          eq(spmoDependenciesTable.sourceType, "milestone"),
          eq(spmoDependenciesTable.targetType, "milestone"),
          inArray(spmoDependenciesTable.sourceId, milestoneIds),
        ),
      );

    // Also filter target IDs to our milestone set
    dependencies = dependencies.filter((d) => milestoneIds.includes(d.targetId));
  } else {
    dependencies = [];
  }

  // 3. Build a DAG
  const nodes = new Map<number, MilestoneNode>();

  for (const m of milestones) {
    // Estimate duration from startDate/dueDate or effortDays
    let duration = m.effortDays ?? 0;
    if (m.startDate && m.dueDate) {
      const start = new Date(m.startDate);
      const end = new Date(m.dueDate);
      const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 0) duration = diff;
    }
    duration = Math.max(1, duration); // minimum 1 day

    nodes.set(m.id, {
      id: m.id,
      name: m.name,
      projectId: m.projectId,
      projectName: projectNameMap.get(m.projectId) ?? "Unknown",
      startDate: m.startDate,
      dueDate: m.dueDate,
      duration,
      predecessors: [],
      successors: [],
      earliestStart: 0,
      earliestFinish: 0,
      latestStart: Infinity,
      latestFinish: Infinity,
      float: 0,
    });
  }

  // Wire up dependencies: source must finish before target can start
  for (const dep of dependencies) {
    const sourceNode = nodes.get(dep.sourceId);
    const targetNode = nodes.get(dep.targetId);
    if (!sourceNode || !targetNode) continue;

    sourceNode.successors.push({
      nodeId: dep.targetId,
      lagDays: dep.lagDays ?? 0,
    });
    targetNode.predecessors.push({
      nodeId: dep.sourceId,
      lagDays: dep.lagDays ?? 0,
    });
  }

  // 4. Topological sort (Kahn's algorithm)
  const inDegree = new Map<number, number>();
  for (const [id, node] of nodes) {
    inDegree.set(id, node.predecessors.length);
  }

  const queue: number[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: number[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);
    const node = nodes.get(current)!;
    for (const succ of node.successors) {
      const newDeg = (inDegree.get(succ.nodeId) ?? 1) - 1;
      inDegree.set(succ.nodeId, newDeg);
      if (newDeg === 0) queue.push(succ.nodeId);
    }
  }

  // If topoOrder doesn't contain all nodes, there's a cycle — collect cycled node IDs
  const cycles: number[] = [];
  if (topoOrder.length < nodes.size) {
    for (const id of nodes.keys()) {
      if (!topoOrder.includes(id)) cycles.push(id);
    }
  }

  // 5. Forward pass: compute earliest start/finish
  for (const id of topoOrder) {
    const node = nodes.get(id)!;
    // ES = max(EF of all predecessors + lag)
    let es = 0;
    for (const pred of node.predecessors) {
      const predNode = nodes.get(pred.nodeId);
      if (predNode) {
        es = Math.max(es, predNode.earliestFinish + pred.lagDays);
      }
    }
    node.earliestStart = es;
    node.earliestFinish = es + node.duration;
  }

  // Find project duration (max earliest finish)
  let maxEF = 0;
  for (const node of nodes.values()) {
    maxEF = Math.max(maxEF, node.earliestFinish);
  }

  // 6. Backward pass: compute latest start/finish
  // Initialize all to maxEF
  for (const node of nodes.values()) {
    node.latestFinish = maxEF;
    node.latestStart = maxEF - node.duration;
  }

  // Traverse in reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const node = nodes.get(topoOrder[i])!;
    // LF = min(LS of all successors - lag)
    for (const succ of node.successors) {
      const succNode = nodes.get(succ.nodeId);
      if (succNode) {
        node.latestFinish = Math.min(
          node.latestFinish,
          succNode.latestStart - succ.lagDays,
        );
      }
    }
    node.latestStart = node.latestFinish - node.duration;
  }

  // 7. Float = latest start - earliest start
  for (const node of nodes.values()) {
    node.float = Math.round(node.latestStart - node.earliestStart);
  }

  // Critical path = milestones where float = 0
  const criticalPath = topoOrder
    .map((id) => nodes.get(id)!)
    .filter((n) => n.float === 0)
    .map((n) => ({
      milestoneId: n.id,
      milestoneName: n.name,
      projectId: n.projectId,
      projectName: n.projectName,
      startDate: n.startDate,
      dueDate: n.dueDate,
      float: n.float,
      isCritical: true,
    }));

  // 8. Bottlenecks: milestones with the most downstream dependents
  // Count transitive dependents for each node
  const dependentCounts = new Map<number, number>();

  function countDependents(nodeId: number, visited: Set<number>): number {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const node = nodes.get(nodeId);
    if (!node) return 0;
    let count = 0;
    for (const succ of node.successors) {
      count += 1 + countDependents(succ.nodeId, visited);
    }
    return count;
  }

  for (const id of nodes.keys()) {
    dependentCounts.set(id, countDependents(id, new Set()));
  }

  // Top bottlenecks: nodes with the most dependents
  const bottlenecks = [...dependentCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => {
      const node = nodes.get(id)!;
      return {
        milestoneId: node.id,
        milestoneName: node.name,
        dependentCount: count,
      };
    });

  // Compute projected completion date
  const today = new Date();
  const completionDate = new Date(today);
  completionDate.setDate(completionDate.getDate() + maxEF);

  return {
    criticalPath,
    totalDuration: Math.round(maxEF),
    projectCompletionDate: completionDate.toISOString().split("T")[0],
    bottlenecks,
    cycles,
  };
}
