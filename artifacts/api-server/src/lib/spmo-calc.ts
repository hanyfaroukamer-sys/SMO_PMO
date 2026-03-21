import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoEvidenceTable,
  spmoProgrammeConfigTable,
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
// Weight = effortDays (falls back to equal weight if all 0)
// ─────────────────────────────────────────────────────────────
async function projectProgress(projectId: number): Promise<{
  progress: number;
  milestoneCount: number;
  approvedMilestones: number;
  pendingApprovals: number;
}> {
  const milestones = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.projectId, projectId));

  if (milestones.length === 0) {
    return { progress: 0, milestoneCount: 0, approvedMilestones: 0, pendingApprovals: 0 };
  }

  const items = milestones.map((m) => ({
    value: milestoneEffectiveProgress(m),
    weight: m.effortDays ?? 0,
  }));

  const approved = milestones.filter((m) => m.status === "approved").length;
  const pending = milestones.filter((m) => m.status === "submitted").length;

  return {
    progress: weightedAvg(items),
    milestoneCount: milestones.length,
    approvedMilestones: approved,
    pendingApprovals: pending,
  };
}

// ─────────────────────────────────────────────────────────────
// Initiative-level progress from its projects
// Weight = project.budget (falls back to equal weight if all 0)
// ─────────────────────────────────────────────────────────────
async function initiativeProgress(initiativeId: number): Promise<{
  progress: number;
  projectCount: number;
  approvedMilestones: number;
  totalMilestones: number;
}> {
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.initiativeId, initiativeId));

  if (projects.length === 0) {
    return { progress: 0, projectCount: 0, approvedMilestones: 0, totalMilestones: 0 };
  }

  const projectStats = await Promise.all(
    projects.map(async (p) => {
      const s = await projectProgress(p.id);
      return { value: s.progress, weight: p.budget ?? 0, ...s };
    })
  );

  const totalApproved = projectStats.reduce((s, p) => s + p.approvedMilestones, 0);
  const totalMilestones = projectStats.reduce((s, p) => s + p.milestoneCount, 0);

  return {
    progress: weightedAvg(projectStats),
    projectCount: projects.length,
    approvedMilestones: totalApproved,
    totalMilestones,
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

  const initiativeStats = await Promise.all(
    initiatives.map(async (i) => {
      const s = await initiativeProgress(i.id);
      return { value: s.progress, weight: i.budget ?? 0, ...s };
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
// HEALTH STATUS (On Track / At Risk / Delayed)
// ─────────────────────────────────────────────────────────────

export type HealthStatus = "on_track" | "at_risk" | "delayed";

export interface HealthThresholds {
  projectAtRiskThreshold: number;
  projectDelayedThreshold: number;
  milestoneAtRiskThreshold: number;
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
  projectAtRiskThreshold: 5,
  projectDelayedThreshold: 10,
  milestoneAtRiskThreshold: 5,
};

export async function getHealthThresholds(): Promise<HealthThresholds> {
  const [config] = await db.select().from(spmoProgrammeConfigTable).where(eq(spmoProgrammeConfigTable.id, 1));
  if (!config) return DEFAULT_THRESHOLDS;
  return {
    projectAtRiskThreshold: config.projectAtRiskThreshold ?? DEFAULT_THRESHOLDS.projectAtRiskThreshold,
    projectDelayedThreshold: config.projectDelayedThreshold ?? DEFAULT_THRESHOLDS.projectDelayedThreshold,
    milestoneAtRiskThreshold: config.milestoneAtRiskThreshold ?? DEFAULT_THRESHOLDS.milestoneAtRiskThreshold,
  };
}

/**
 * Returns what % complete something *should* be right now, based on start→end timeline.
 * Returns 0 if today ≤ start, 100 if today ≥ end.
 */
export function computePlannedProgress(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return ((now - start) / (end - start)) * 100;
}

/**
 * Determines health status for a project.
 * Delayed if actual lags planned by > projectDelayedThreshold %.
 * At Risk  if actual lags planned by > projectAtRiskThreshold %.
 */
export function computeProjectHealth(
  actualProgress: number,
  startDate: string,
  targetDate: string,
  thresholds: HealthThresholds
): HealthStatus {
  const planned = computePlannedProgress(startDate, targetDate);
  const deficit = planned - actualProgress;
  if (deficit > thresholds.projectDelayedThreshold) return "delayed";
  if (deficit > thresholds.projectAtRiskThreshold) return "at_risk";
  return "on_track";
}

/**
 * Determines health status for a milestone.
 * Delayed if due date has passed and milestone is not approved.
 * At Risk  if actual progress lags time-based planned by > milestoneAtRiskThreshold %.
 * Uses the project's startDate as the milestone's implicit start.
 */
export function computeMilestoneHealth(
  actualProgress: number,
  status: string,
  dueDate: string | null,
  projectStartDate: string,
  thresholds: HealthThresholds
): HealthStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate && status !== "approved") {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) return "delayed";
  }

  if (dueDate) {
    const planned = computePlannedProgress(projectStartDate, dueDate);
    const deficit = planned - actualProgress;
    if (deficit > thresholds.milestoneAtRiskThreshold) return "at_risk";
  }

  return "on_track";
}
