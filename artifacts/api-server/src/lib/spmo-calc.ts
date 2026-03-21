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
// Weight = effortDays (falls back to equal weight if all 0)
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
    value: milestoneEffectiveProgress(m),   // 99% cap
    weight: m.effortDays ?? 0,
  }));
  const rawItems = milestones.map((m) => ({
    value: m.progress ?? 0,                 // no cap
    weight: m.effortDays ?? 0,
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
}> {
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.initiativeId, initiativeId));

  if (projects.length === 0) {
    return { progress: 0, rawProgress: 0, projectCount: 0, approvedMilestones: 0, totalMilestones: 0, budgetSpent: 0 };
  }

  const projectStats = await Promise.all(
    projects.map(async (p) => {
      const s = await projectProgress(p.id);
      return { value: s.progress, rawValue: s.rawProgress, weight: p.budget ?? 0, ...s, budgetSpent: p.budgetSpent ?? 0 };
    })
  );

  const totalApproved = projectStats.reduce((s, p) => s + p.approvedMilestones, 0);
  const totalMilestones = projectStats.reduce((s, p) => s + p.milestoneCount, 0);
  const totalBudgetSpent = projectStats.reduce((s, p) => s + p.budgetSpent, 0);

  const rawItems = projectStats.map((p) => ({ value: p.rawValue, weight: p.weight }));

  return {
    progress: weightedAvg(projectStats),
    rawProgress: weightedAvg(rawItems),
    projectCount: projects.length,
    approvedMilestones: totalApproved,
    totalMilestones,
    budgetSpent: totalBudgetSpent,
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
// COMPUTED STATUS ENGINE
// Status is always derived — never manually entered for projects/initiatives.
//
//  completed : progress >= 100 (all milestones approved)
//  on_track  : schedule and budget within tolerances
//  at_risk   : behind schedule or over budget but recoverable
//  delayed   : materially behind or past end date
//
// Milestones keep manual status (pending/in_progress/submitted/approved/rejected).
// ─────────────────────────────────────────────────────────────

export type HealthStatus = "on_track" | "at_risk" | "delayed" | "completed";

export interface StatusResult {
  status: HealthStatus;
  reason: string;
  spi: number;      // schedule performance index (1.0 = on schedule)
  burnGap: number;  // budget burn % minus progress % (positive = overspending)
}

interface StatusThresholds {
  onTrackSpi: number;        // SPI >= this AND burnGap < burnTolerance → on_track
  atRiskSpi: number;         // SPI >= this (but below onTrackSpi) → at_risk
  earlyPct: number;          // elapsed % below this = early stage window
  burnTolerance: number;     // burn gap below this is acceptable
  approvalDeltaTrigger: number; // raw-gated gap above this = approval bottleneck
}

const PROJECT_THRESHOLDS: StatusThresholds = {
  onTrackSpi: 0.85,
  atRiskSpi: 0.65,
  earlyPct: 20,
  burnTolerance: 20,
  approvalDeltaTrigger: 3,
};

const INITIATIVE_THRESHOLDS: StatusThresholds = {
  onTrackSpi: 0.80,
  atRiskSpi: 0.55,
  earlyPct: 15,
  burnTolerance: 25,
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
  // Edge case: dates not set
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

  const round = (n: number) => Math.round(n * 100) / 100;

  // RULE 1: Completed
  if (actualProgress >= 100) {
    return { status: "completed", reason: "All milestones approved and complete.", spi: round(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 2: Not yet started
  if (elapsedPct <= 0) {
    return { status: "on_track", reason: `Not yet started. Begins ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`, spi: 1, burnGap: Math.round(burnGap) };
  }

  // RULE 3: Overdue — past end date
  if (elapsedPct > 100 && actualProgress < 100) {
    const overdueDays = Math.round(elapsedDays - totalDays);
    return {
      status: "delayed",
      reason: `Past end date by ${overdueDays}d at ${Math.round(actualProgress)}% complete.`,
      spi: round(spi),
      burnGap: Math.round(burnGap),
    };
  }

  // RULE 4: Near completion — let it finish
  if (actualProgress >= 90) {
    const bottleneckNote = isApprovalBottleneck ? ` Approval bottleneck suppressing ${Math.round(approvalDelta)}pts.` : "";
    return { status: "on_track", reason: `${Math.round(actualProgress)}% complete — approaching finish.${bottleneckNote}`, spi: round(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 5: Early stage tolerance
  if (elapsedPct < t.earlyPct) {
    if (spi < 0.3 && actualProgress < 5) {
      return {
        status: "at_risk",
        reason: `${Math.round(elapsedPct)}% of time elapsed but only ${Math.round(actualProgress)}% complete — slow mobilisation.`,
        spi: round(spi),
        burnGap: Math.round(burnGap),
      };
    }
    return { status: "on_track", reason: "Early stage — within normal mobilisation period.", spi: round(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 6: Normal execution — on-track
  if (spi >= t.onTrackSpi && burnGap < t.burnTolerance) {
    return { status: "on_track", reason: `SPI ${round(spi)} — schedule and budget aligned.`, spi: round(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 6 cont: at-risk band
  if (spi >= t.atRiskSpi) {
    let reason: string;
    if (burnGap >= t.burnTolerance) {
      reason = `Budget burn (${Math.round(burnPct)}%) exceeds progress (${Math.round(actualProgress)}%) by ${Math.round(burnGap)}pts.`;
    } else if (isApprovalBottleneck) {
      reason = `Approval bottleneck — ${Math.round(approvalDelta)}pts of progress pending sign-off. SPI ${round(spi)}.`;
    } else {
      reason = `SPI ${round(spi)} — behind schedule. Expected ${Math.round(elapsedPct)}%, achieved ${Math.round(actualProgress)}%.`;
    }
    return { status: "at_risk", reason, spi: round(spi), burnGap: Math.round(burnGap) };
  }

  // RULE 7: Materially delayed
  let reason: string;
  if (isApprovalBottleneck) {
    reason = `SPI ${round(spi)} with approval bottleneck — ${Math.round(approvalDelta)}pts suppressed by pending approvals.`;
  } else if (burnGap >= 30) {
    reason = `Critical: SPI ${round(spi)} and budget overburn of ${Math.round(burnGap)}pts.`;
  } else {
    reason = `SPI ${round(spi)} — expected ${Math.round(elapsedPct)}% at this point, achieved ${Math.round(actualProgress)}%.`;
  }
  return { status: "delayed", reason, spi: round(spi), burnGap: Math.round(burnGap) };
}

/** Compute project status using SPI + burn gap + approval bottleneck detection */
export function computeStatus(
  actualProgress: number,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  budgetAllocated: number,
  budgetSpent: number,
  rawProgress?: number,
): StatusResult {
  return computeStatusCore(actualProgress, startDate, endDate, budgetAllocated, budgetSpent, rawProgress, PROJECT_THRESHOLDS);
}

/** Same as computeStatus but with looser thresholds for initiatives */
export function computeInitiativeStatus(
  actualProgress: number,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  budgetAllocated: number,
  budgetSpent: number,
  rawProgress?: number,
): StatusResult {
  return computeStatusCore(actualProgress, startDate, endDate, budgetAllocated, budgetSpent, rawProgress, INITIATIVE_THRESHOLDS);
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
