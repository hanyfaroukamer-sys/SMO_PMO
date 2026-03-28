import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoEvidenceTable,
  type SpmoPillar,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// 99% Gate Rule
// A milestone contributes its reported progress except:
// if progress >= 100 AND status !== 'approved', cap at 99.
// ─────────────────────────────────────────────────────────────
export function milestoneEffectiveProgress(milestone: {
  progress: number;
  status: string;
}): number {
  if (milestone.status === "approved") return milestone.progress;
  if (milestone.progress >= 100) return 99;
  return milestone.progress;
}

// Weighted average of items. Falls back to simple average if all weights are 0.
function weightedAvg(items: { value: number; weight: number }[]): number {
  if (items.length === 0) return 0;
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight === 0) {
    const sum = items.reduce((s, i) => s + i.value, 0);
    return Math.round((sum / items.length) * 10) / 10;
  }
  const weighted = items.reduce((s, i) => s + i.value * i.weight, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

// Simple average
function simpleAvg(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((s, v) => s + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

// ─────────────────────────────────────────────────────────────
// Project-level progress from its milestones
// Weight = weight field (activity weight), falls back to effortDays, then equal weight
// Returns both gated progress (99% cap) and raw progress (no cap)
// ─────────────────────────────────────────────────────────────
async function projectProgress(projectId: number): Promise<{
  progress: number;
  rawProgress: number;
  milestoneCount: number;
  approvedMilestones: number;
  pendingApprovals: number;
}> {
  const milestones = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.projectId, projectId));

  if (milestones.length === 0) {
    return { progress: 0, rawProgress: 0, milestoneCount: 0, approvedMilestones: 0, pendingApprovals: 0 };
  }

  const gatedItems = milestones.map((m) => ({
    value: milestoneEffectiveProgress(m),
    weight: m.weight ?? m.effortDays ?? 0,
  }));
  const rawItems = milestones.map((m) => ({
    value: m.progress ?? 0,
    weight: m.weight ?? m.effortDays ?? 0,
  }));

  const approved = milestones.filter((m) => m.status === "approved").length;
  const pending = milestones.filter((m) => m.status === "submitted").length;

  return {
    progress: weightedAvg(gatedItems),
    rawProgress: weightedAvg(rawItems),
    milestoneCount: milestones.length,
    approvedMilestones: approved,
    pendingApprovals: pending,
  };
}

// ─────────────────────────────────────────────────────────────
// Initiative-level progress from its projects
// Weight = project.budget (falls back to equal weight if all 0)
// Returns gated + raw progress and aggregated budget spent
// ─────────────────────────────────────────────────────────────
async function initiativeProgress(initiativeId: number): Promise<{
  progress: number;
  rawProgress: number;
  projectCount: number;
  approvedMilestones: number;
  totalMilestones: number;
  budgetSpent: number;
  childProjects: ChildProjectSummary[];
}> {
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.initiativeId, initiativeId));

  if (projects.length === 0) {
    return { progress: 0, rawProgress: 0, projectCount: 0, approvedMilestones: 0, totalMilestones: 0, budgetSpent: 0, childProjects: [] };
  }

  // ── Weight cascade (highest priority first) ──────────────────
  // 1. Admin-edited weights (any project.weight > 0 means admin set them)
  // 2. All projects have budget → budget-weighted
  // 3. effortDays across milestones
  // 4. Equal weight (weightedAvg handles all-zero)
  const adminWeightsSet = projects.some((p) => (p.weight ?? 0) > 0);
  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const allHaveBudget = !adminWeightsSet && projects.every((p) => (p.budget ?? 0) > 0);

  let useEffortDays = false;
  let effortByProject: Map<number, number> | null = null;
  if (!adminWeightsSet && !allHaveBudget) {
    const allProjectIds = projects.map((p) => p.id);
    const allMilestones = allProjectIds.length > 0
      ? await db.select({ projectId: spmoMilestonesTable.projectId, effortDays: spmoMilestonesTable.effortDays }).from(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, allProjectIds))
      : [];
    effortByProject = new Map<number, number>();
    for (const m of allMilestones) {
      effortByProject.set(m.projectId, (effortByProject.get(m.projectId) ?? 0) + (m.effortDays ?? 0));
    }
    const totalEffort = [...effortByProject.values()].reduce((s, v) => s + v, 0);
    useEffortDays = totalEffort > 0;
  }

  const weightSource: "admin" | "budget" | "effort" | "equal" =
    adminWeightsSet ? "admin" : allHaveBudget ? "budget" : useEffortDays ? "effort" : "equal";

  const projectStats = await Promise.all(
    projects.map(async (p) => {
      const s = await projectProgress(p.id);
      const projStatus = computeStatus(s.progress, p.startDate, p.targetDate, p.budget, p.budgetSpent, s.rawProgress);

      let projectWeight: number;
      if (adminWeightsSet) {
        projectWeight = p.weight ?? 0;
      } else if (allHaveBudget) {
        projectWeight = p.budget ?? 0;
      } else if (useEffortDays && effortByProject) {
        projectWeight = effortByProject.get(p.id) ?? 0;
      } else {
        projectWeight = 0;
      }

      // Compute display weight as percentage
      const totalWeight = adminWeightsSet
        ? projects.reduce((s2, pp) => s2 + (pp.weight ?? 0), 0)
        : allHaveBudget ? totalBudget
        : useEffortDays ? [...effortByProject!.values()].reduce((s2, v) => s2 + v, 0)
        : projects.length;
      const displayWeight = totalWeight > 0 ? (projectWeight / totalWeight) * 100 : (100 / projects.length);

      return { value: s.progress, rawValue: s.rawProgress, weight: projectWeight, ...s, budgetSpent: p.budgetSpent ?? 0, projStatus, name: p.name, projectCode: p.projectCode ?? null, budgetWeight: Math.round(displayWeight * 10) / 10 };
    })
  );

  const totalApproved = projectStats.reduce((s, p) => s + p.approvedMilestones, 0);
  const totalMilestones = projectStats.reduce((s, p) => s + p.milestoneCount, 0);
  const totalBudgetSpent = projectStats.reduce((s, p) => s + p.budgetSpent, 0);
  const rawItems = projectStats.map((p) => ({ value: p.rawValue, weight: p.weight }));

  const childProjects: ChildProjectSummary[] = projectStats.map((p) => ({
    name: p.name,
    projectCode: p.projectCode,
    computedStatus: p.projStatus,
    progress: p.progress,
    weight: p.budgetWeight,
  }));

  return {
    progress: weightedAvg(projectStats),
    rawProgress: weightedAvg(rawItems),
    projectCount: projects.length,
    approvedMilestones: totalApproved,
    totalMilestones,
    budgetSpent: totalBudgetSpent,
    childProjects,
    weightSource,
  };
}

// ─────────────────────────────────────────────────────────────
// Pillar-level progress from its initiatives
// Weight = initiative.budget (falls back to equal weight if all 0)
// ─────────────────────────────────────────────────────────────
async function pillarProgress(pillarId: number): Promise<{
  progress: number;
  initiativeCount: number;
  projectCount: number;
  milestoneCount: number;
  approvedMilestones: number;
  pendingApprovals: number;
}> {
  const initiatives = await db
    .select()
    .from(spmoInitiativesTable)
    .where(eq(spmoInitiativesTable.pillarId, pillarId));

  if (initiatives.length === 0) {
    return {
      progress: 0,
      initiativeCount: 0,
      projectCount: 0,
      milestoneCount: 0,
      approvedMilestones: 0,
      pendingApprovals: 0,
    };
  }

  // ── Weight cascade for initiatives (highest priority first) ──
  // 1. Admin-edited weights (any initiative.weight > 0)
  // 2. All initiatives have computed budget (sum of child projects) → budget-weighted
  // 3. effortDays across all child milestones
  // 4. Equal weight
  const adminInitWeightsSet = initiatives.some((i) => (i.weight ?? 0) > 0);

  const initBudgets = await Promise.all(
    initiatives.map(async (i) => {
      const childProjects = await db.select({ id: spmoProjectsTable.id, budget: spmoProjectsTable.budget }).from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, i.id));
      const budgetSum = childProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
      return { initId: i.id, budgetSum, projectIds: childProjects.map((p) => p.id) };
    })
  );
  const allInitHaveBudget = !adminInitWeightsSet && initBudgets.every((ib) => ib.budgetSum > 0);

  let initUseEffort = false;
  let effortByInit: Map<number, number> | null = null;
  if (!adminInitWeightsSet && !allInitHaveBudget) {
    effortByInit = new Map();
    const allProjIds = initBudgets.flatMap((ib) => ib.projectIds);
    if (allProjIds.length > 0) {
      const allMs = await db.select({ projectId: spmoMilestonesTable.projectId, effortDays: spmoMilestonesTable.effortDays }).from(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, allProjIds));
      const effortByProj = new Map<number, number>();
      for (const m of allMs) effortByProj.set(m.projectId, (effortByProj.get(m.projectId) ?? 0) + (m.effortDays ?? 0));
      for (const ib of initBudgets) {
        const effort = ib.projectIds.reduce((s, pid) => s + (effortByProj.get(pid) ?? 0), 0);
        effortByInit.set(ib.initId, effort);
      }
      initUseEffort = [...effortByInit.values()].reduce((s, v) => s + v, 0) > 0;
    }
  }

  const initiativeStats = await Promise.all(
    initiatives.map(async (i) => {
      const s = await initiativeProgress(i.id);
      const ib = initBudgets.find((b) => b.initId === i.id);
      let initWeight: number;
      if (adminInitWeightsSet) {
        initWeight = i.weight ?? 0;
      } else if (allInitHaveBudget) {
        initWeight = ib?.budgetSum ?? 0;
      } else if (initUseEffort && effortByInit) {
        initWeight = effortByInit.get(i.id) ?? 0;
      } else {
        initWeight = 0;
      }
      return { value: s.progress, weight: initWeight, ...s };
    })
  );

  const projectIds = initiatives.map((i) => i.id);
  const allProjects = await db
    .select()
    .from(spmoProjectsTable)
    .where(inArray(spmoProjectsTable.initiativeId, projectIds));

  let pendingApprovals = 0;
  if (allProjects.length > 0) {
    const projectIdList = allProjects.map((p) => p.id);
    const milestones = await db
      .select()
      .from(spmoMilestonesTable)
      .where(inArray(spmoMilestonesTable.projectId, projectIdList));
    pendingApprovals = milestones.filter((m) => m.status === "submitted").length;
  }

  const totalApproved = initiativeStats.reduce((s, i) => s + i.approvedMilestones, 0);
  const totalMilestones = initiativeStats.reduce((s, i) => s + i.totalMilestones, 0);
  const totalProjects = initiativeStats.reduce((s, i) => s + i.projectCount, 0);

  return {
    progress: weightedAvg(initiativeStats),
    initiativeCount: initiatives.length,
    projectCount: totalProjects,
    milestoneCount: totalMilestones,
    approvedMilestones: totalApproved,
    pendingApprovals,
  };
}

// ─────────────────────────────────────────────────────────────
// Programme-level progress = simple average across all pillars
// ─────────────────────────────────────────────────────────────
export async function calcProgrammeProgress(): Promise<{
  programmeProgress: number;
  pillarSummaries: Array<{
    pillar: SpmoPillar;
    progress: number;
    initiativeCount: number;
    projectCount: number;
    milestoneCount: number;
    approvedMilestones: number;
    pendingApprovals: number;
  }>;
}> {
  const pillars = await db
    .select()
    .from(spmoPillarsTable)
    .orderBy(spmoPillarsTable.sortOrder);

  const pillarStats = await Promise.all(
    pillars.map(async (p) => {
      const s = await pillarProgress(p.id);
      return { pillar: p, value: s.progress, ...s };
    })
  );

  const programmeProgress = simpleAvg(pillarStats.map((p) => p.value));

  return {
    programmeProgress,
    pillarSummaries: pillarStats.map(({ value, ...rest }) => ({
      ...rest,
      progress: value,
    })),
  };
}

// Convenience exports for individual level calcs
export { pillarProgress, initiativeProgress, projectProgress };

// Get milestone with evidence
export async function getMilestoneWithEvidence(milestoneId: number) {
  const [milestone] = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.id, milestoneId));

  if (!milestone) return null;

  const evidence = await db
    .select()
    .from(spmoEvidenceTable)
    .where(eq(spmoEvidenceTable.milestoneId, milestoneId));

  return { ...milestone, evidence };
}

// Risk score matrix: 1=low, 2=medium, 3=high, 4=critical
const RISK_LEVEL: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function computeRiskScore(probability: string, impact: string): number {
  return (RISK_LEVEL[probability] ?? 2) * (RISK_LEVEL[impact] ?? 2);
}

// ─────────────────────────────────────────────────────────────
// COMPUTED STATUS ENGINE v2 — Tightened thresholds, bias toward early warning.
// Status is always derived — never manually entered for projects/initiatives.
//
//  completed : progress >= 100
//  on_track  : SPI >= 0.90 AND burn gap < 15
//  at_risk   : SPI 0.70–0.90 OR budget overburn
//  delayed   : SPI < 0.70 OR past end date
//
// Milestones keep manual status (pending/in_progress/submitted/approved/rejected).
// ─────────────────────────────────────────────────────────────

export type HealthStatus = "on_track" | "at_risk" | "delayed" | "completed" | "not_started";

export interface StatusResult {
  status: HealthStatus;
  reason: string;
  spi: number;
  burnGap: number;
  delayedChildren?: string[];  // initiative-level: names of delayed child projects
}

export interface ChildProjectSummary {
  name: string;
  projectCode: string | null;
  computedStatus: StatusResult;
  progress: number;
  weight: number;  // budget-based weight 0-100
}

interface StatusThresholds {
  onTrackSpi: number;          // SPI >= this AND burnGap < burnTolerance → on_track
  atRiskSpi: number;           // SPI >= this (below onTrackSpi) → at_risk; below → delayed
  nearCompletionPct: number;   // progress >= this → on_track regardless of SPI
  earlyPct: number;            // elapsed % below this = early stage window
  earlyStallSpi: number;       // during early stage: SPI below this = stall warning
  earlyStallProgress: number;  // during early stage: progress below this = stall warning
  burnTolerance: number;       // burn gap below this is acceptable
  approvalDeltaTrigger: number;
}

// Projects and initiatives now share the same thresholds.
// Bias toward early warning — 10% behind on a 200M SAR project is a 20M problem.
const THRESHOLDS: StatusThresholds = {
  onTrackSpi: 0.90,
  atRiskSpi: 0.70,
  nearCompletionPct: 95,
  earlyPct: 15,
  earlyStallSpi: 0.2,
  earlyStallProgress: 3,
  burnTolerance: 15,
  approvalDeltaTrigger: 3,
};

function computeStatusCore(
  actualProgress: number,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  budgetAllocated: number,
  budgetSpent: number,
  rawProgress: number | undefined,
  t: StatusThresholds,
): StatusResult {
  if (!startDate || !endDate) {
    return { status: "on_track", reason: "Dates not set.", spi: 1, burnGap: 0 };
  }

  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  const totalDays = Math.max((end.getTime() - start.getTime()) / 86_400_000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86_400_000, 0);
  const elapsedPct = Math.min((elapsedDays / totalDays) * 100, 150);

  const spi = elapsedPct > 0 ? actualProgress / elapsedPct : 1;
  const burnPct = budgetAllocated > 0 ? (budgetSpent / budgetAllocated) * 100 : 0;
  const burnGap = budgetAllocated > 0 ? burnPct - actualProgress : 0;

  const approvalDelta = rawProgress !== undefined ? rawProgress - actualProgress : 0;
  const isApprovalBottleneck = approvalDelta > t.approvalDeltaTrigger;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  // RULE 1: Completed
  if (actualProgress >= 100) {
    return { status: "completed", reason: "All milestones approved and complete.", spi: r2(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 2: Not yet started
  if (elapsedPct <= 0) {
    return { status: "not_started", reason: `Not yet started. Begins ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`, spi: 1, burnGap: Math.round(burnGap) };
  }

  // RULE 3: Near completion (≥95%) — let it finish even if past end date
  if (actualProgress >= t.nearCompletionPct) {
    const bottleneckNote = isApprovalBottleneck ? ` Approval bottleneck suppressing ${Math.round(approvalDelta)}pts.` : "";
    return { status: "on_track", reason: `${Math.round(actualProgress)}% — final stretch.${bottleneckNote}`, spi: r2(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 4: Overdue — past end date with incomplete work
  if (elapsedPct > 100 && actualProgress < 100) {
    const overdueDays = Math.round(elapsedDays - totalDays);
    return {
      status: "delayed",
      reason: `Overdue by ${overdueDays}d at ${Math.round(actualProgress)}% complete.`,
      spi: r2(spi),
      burnGap: Math.round(burnGap),
    };
  }

  // RULE 5: Early stage (<15% elapsed) — limited tolerance for stalls
  if (elapsedPct < t.earlyPct) {
    if (spi < t.earlyStallSpi && actualProgress < t.earlyStallProgress) {
      return {
        status: "at_risk",
        reason: `Mobilisation stalled: ${Math.round(elapsedPct)}% elapsed, only ${Math.round(actualProgress)}% complete.`,
        spi: r2(spi),
        burnGap: Math.round(burnGap),
      };
    }
    return { status: "on_track", reason: "Early stage.", spi: r2(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 6: On Track — SPI ≥ 0.90 AND burn gap < 15
  if (spi >= t.onTrackSpi && burnGap < t.burnTolerance) {
    return { status: "on_track", reason: `On schedule — ${Math.round(actualProgress)}% complete, ${Math.round(elapsedPct)}% of time elapsed.`, spi: r2(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 7: At Risk — SPI 0.70–0.90 or budget issue
  if (spi >= t.atRiskSpi) {
    let reason: string;
    if (burnGap >= t.burnTolerance) {
      reason = `Budget concern: ${Math.round(burnPct)}% spent vs ${Math.round(actualProgress)}% progress (+${Math.round(burnGap)}pt gap).`;
    } else if (isApprovalBottleneck) {
      reason = `Approval bottleneck: ${Math.round(approvalDelta)}pt blocked — progress may be understated.`;
    } else {
      reason = `Slightly behind: expected ~${Math.round(elapsedPct)}% complete, actual ${Math.round(actualProgress)}%.`;
    }
    return { status: "at_risk", reason, spi: r2(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 8: Delayed — SPI < 0.70
  let reason: string;
  if (burnGap >= 25) {
    reason = `Critical: budget overburn ${Math.round(burnGap)}pt and ${Math.round(elapsedPct - actualProgress)}pt behind schedule. Intervention required.`;
  } else if (isApprovalBottleneck && spi >= 0.55) {
    reason = `${Math.round(approvalDelta)}pt blocked by approval bottleneck — delivery at risk.`;
  } else {
    reason = `${Math.round(elapsedPct - actualProgress)}pt behind schedule (expected ~${Math.round(elapsedPct)}%, actual ${Math.round(actualProgress)}%). Recovery unlikely without replanning.`;
  }
  return { status: "delayed", reason, spi: r2(spi), burnGap: Math.round(burnGap) };
}

/** Compute project status — SPI-based with burn gap and approval bottleneck detection. */
export function computeStatus(
  actualProgress: number,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  budgetAllocated: number,
  budgetSpent: number,
  rawProgress?: number,
): StatusResult {
  return computeStatusCore(actualProgress, startDate, endDate, budgetAllocated, budgetSpent, rawProgress, THRESHOLDS);
}

/**
 * Compute initiative status — same thresholds as projects, plus child-project escalation:
 *   • Any delayed child   → initiative minimum at-risk
 *   • >50% budget weight delayed → initiative delayed
 *   • Names delayed/at-risk projects in the reason string
 */
export function computeInitiativeStatus(
  actualProgress: number,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  budgetAllocated: number,
  budgetSpent: number,
  rawProgress: number | undefined,
  childProjects: ChildProjectSummary[],
): StatusResult {
  const result: StatusResult = { ...computeStatusCore(actualProgress, startDate, endDate, budgetAllocated, budgetSpent, rawProgress, THRESHOLDS) };

  const delayed = [...childProjects.filter(p => p.computedStatus.status === "delayed")]
    .sort((a, b) => a.computedStatus.spi - b.computedStatus.spi);
  const atRisk = [...childProjects.filter(p => p.computedStatus.status === "at_risk")]
    .sort((a, b) => a.computedStatus.spi - b.computedStatus.spi);

  // ESCALATION 1: Any delayed child → initiative minimum at-risk
  if (delayed.length > 0 && (result.status === "on_track" || result.status === "not_started")) {
    result.status = "at_risk";
    result.reason = `Contains ${delayed.length} delayed project${delayed.length > 1 ? "s" : ""}.`;
  }

  // ESCALATION 2: All child projects delayed → initiative delayed
  const activeProjCount = childProjects.filter(p => p.computedStatus.status !== "completed").length;
  if (delayed.length > 0 && delayed.length === activeProjCount && result.status !== "delayed" && result.status !== "completed") {
    result.status = "delayed";
    result.reason = `All ${delayed.length} active project${delayed.length > 1 ? "s" : ""} under this initiative are delayed.`;
  }

  // ESCALATION 3: >50% of budget weight in delayed projects → initiative delayed
  const delayedWeight = delayed.reduce((s, p) => s + p.weight, 0);
  if (delayedWeight > 50 && result.status !== "delayed" && result.status !== "completed") {
    result.status = "delayed";
    result.reason = `${Math.round(delayedWeight)}% of budget weight in delayed projects.`;
  }

  // APPEND: Name the problematic projects
  if (result.status === "delayed" || result.status === "at_risk") {
    const parts: string[] = [];
    if (delayed.length > 0) {
      parts.push("Delayed: " + delayed.map(p =>
        `${p.name} (${Math.round(p.weight)}% wt)`
      ).join(", "));
    }
    if (atRisk.length > 0) {
      parts.push("At risk: " + atRisk.map(p =>
        `${p.name}`
      ).join(", "));
    }
    if (parts.length > 0) {
      result.reason += " | " + parts.join(". ");
    }
    result.delayedChildren = delayed.map(p => p.projectCode ? `${p.projectCode}: ${p.name}` : p.name);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Milestone health — still date-based (milestones are manual-status entities)
// ─────────────────────────────────────────────────────────────

/** Window (calendar days) before due date when milestone flips to "at_risk" */
const MILESTONE_AT_RISK_DAYS = 7;

export function computeMilestoneHealth(
  status: string,
  dueDate: string | null | undefined,
): HealthStatus {
  if (status === "approved") return "completed";
  if (!dueDate) return "on_track";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dueDate);
  end.setHours(0, 0, 0, 0);

  if (end < today) return "delayed";
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft <= MILESTONE_AT_RISK_DAYS) return "at_risk";
  return "on_track";
}
