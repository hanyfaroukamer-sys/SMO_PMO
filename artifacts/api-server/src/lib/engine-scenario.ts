import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoInitiativesTable,
  spmoPillarsTable,
  spmoMilestonesTable,
  spmoDependenciesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  calcProgrammeProgress,
  projectProgress,
  computeStatus,
} from "./spmo-calc";
import { computeEvmMetrics } from "./engine-evm";

// ─────────────────────────────────────────────────────────────
// Scenario Simulation Engine
// Read-only "what if" analysis — never modifies the database.
// ─────────────────────────────────────────────────────────────

export interface ScenarioInput {
  type: "delay" | "cancel" | "budget_cut";
  projectId: number;
  delayDays?: number;
  budgetReduction?: number;
  adjustWeight?: boolean; // For budget_cut: also reduce project weight proportionally
}

export interface ScenarioResult {
  input: ScenarioInput;
  before: {
    programmeProgress: number;
    affectedPillarProgress: { pillarId: number; pillarName: string; progress: number }[];
    affectedInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number }[];
  };
  after: {
    programmeProgress: number;
    affectedPillarProgress: { pillarId: number; pillarName: string; progress: number }[];
    affectedInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number }[];
  };
  progressImpact?: {
    projectName: string;
    currentProgress: number;
    plannedProgressByNow: number;
    plannedProgressAfterDelay: number;
    progressGap: number;
    originalTargetDate: string;
    newTargetDate: string;
    daysDelayed: number;
  };
  cascadeImpact: { milestoneId: number; milestoneName: string; projectName: string; shiftDays: number; newDueDate: string; currentProgress: number; plannedProgress: number }[];
  financialImpact?: {
    originalBudget: number;
    newBudget: number;
    actualSpent: number;
    overSpent: boolean;
    originalCpi: number;
    newCpi: number;
    originalEac: number;
    newEac: number;
  };
  summary: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Simulate progress for a project with a shifted target date (read-only). */
function simulateProgressWithDelay(
  currentProgress: number,
  startDate: string,
  originalTargetDate: string,
  delayDays: number,
): number {
  const today = new Date();
  const start = new Date(startDate);
  const newEnd = new Date(addDays(originalTargetDate, delayDays));
  const newTotalDays = Math.max((newEnd.getTime() - start.getTime()) / 86_400_000, 1);
  const elapsed = Math.max((today.getTime() - start.getTime()) / 86_400_000, 0);
  const newElapsedPct = Math.min(elapsed / newTotalDays, 1.5);

  // The progress itself doesn't change — what changes is what progress
  // "should" be (planned), so the SPI shifts. Return the progress as-is.
  return currentProgress;
}

/** Calculate planned progress % based on timeline (linear interpolation from start to target). */
function calcPlannedProgress(startDate: string | null, targetDate: string | null, atDate?: Date): number {
  if (!startDate || !targetDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(targetDate).getTime();
  const now = (atDate ?? new Date()).getTime();
  if (end <= start) return 100;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 1000) / 10;
}

/** Weighted average helper for in-memory recalc. */
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

// ─────────────────────────────────────────────────────────────
// Main simulation
// ─────────────────────────────────────────────────────────────

export async function simulateScenario(input: ScenarioInput): Promise<ScenarioResult> {
  // 1. Get the target project
  const [project] = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.id, input.projectId));

  if (!project) {
    throw new Error(`Project ${input.projectId} not found`);
  }

  // 2. Get initiative and pillar for this project
  const [initiative] = await db
    .select()
    .from(spmoInitiativesTable)
    .where(eq(spmoInitiativesTable.id, project.initiativeId));

  const [pillar] = initiative
    ? await db.select().from(spmoPillarsTable).where(eq(spmoPillarsTable.id, initiative.pillarId))
    : [undefined];

  // 3. Get current state (before)
  const { programmeProgress, pillarSummaries } = await calcProgrammeProgress();

  const beforePillarProgress = pillarSummaries.map((ps) => ({
    pillarId: ps.pillar.id,
    pillarName: ps.pillar.name,
    progress: ps.progress,
  }));

  // Get initiative-level progress for the affected pillar
  const siblingInitiatives = initiative
    ? await db.select().from(spmoInitiativesTable).where(eq(spmoInitiativesTable.pillarId, initiative.pillarId))
    : [];

  const beforeInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number; budget: number }[] = [];
  for (const init of siblingInitiatives) {
    const projects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, init.id));
    const progItems: { value: number; weight: number }[] = [];
    let initBudget = 0;
    for (const p of projects) {
      const pp = await projectProgress(p.id);
      progItems.push({ value: pp.progress, weight: p.budget ?? 0 });
      initBudget += p.budget ?? 0;
    }
    beforeInitiativeProgress.push({
      initiativeId: init.id,
      initiativeName: init.name,
      progress: weightedAvg(progItems),
      budget: initBudget,
    });
  }

  const before = {
    programmeProgress,
    affectedPillarProgress: beforePillarProgress,
    affectedInitiativeProgress: beforeInitiativeProgress,
  };

  // 4. Run scenario-specific simulation
  let cascadeImpact: ScenarioResult["cascadeImpact"] = [];
  let summaryParts: string[] = [];

  if (input.type === "delay") {
    const delayDays = input.delayDays ?? 0;
    if (delayDays <= 0) {
      throw new Error("delayDays must be > 0 for a delay scenario");
    }

    // Find downstream dependencies from this project's milestones
    const projectMilestones = await db
      .select()
      .from(spmoMilestonesTable)
      .where(eq(spmoMilestonesTable.projectId, input.projectId));

    const milestoneIds = projectMilestones.map((m) => m.id);

    // Find dependencies where this project or its milestones are the source
    const dependencies = milestoneIds.length > 0
      ? await db
          .select()
          .from(spmoDependenciesTable)
          .where(
            inArray(spmoDependenciesTable.sourceId, [
              ...milestoneIds,
              input.projectId,
            ])
          )
      : [];

    // Compute progress impact for the delayed project
    const projectStats = await projectProgress(project.id);
    const currentProg = projectStats.progress;
    const plannedByNow = calcPlannedProgress(project.startDate, project.targetDate);
    const newTargetDate = addDays(project.targetDate, delayDays);
    const plannedAfterDelay = calcPlannedProgress(project.startDate, newTargetDate);
    const progressGap = round1(plannedByNow - currentProg);

    // Cascade: shift dependent milestones
    for (const dep of dependencies) {
      if (dep.targetType === "milestone") {
        const [targetMs] = await db
          .select()
          .from(spmoMilestonesTable)
          .where(eq(spmoMilestonesTable.id, dep.targetId));

        if (targetMs && targetMs.dueDate) {
          const [parentProject] = await db
            .select()
            .from(spmoProjectsTable)
            .where(eq(spmoProjectsTable.id, targetMs.projectId));

          const shiftDays = delayDays + (dep.lagDays ?? 0);
          const msPlannedProg = calcPlannedProgress(targetMs.startDate, targetMs.dueDate);
          cascadeImpact.push({
            milestoneId: targetMs.id,
            milestoneName: targetMs.name,
            projectName: parentProject?.name ?? "Unknown",
            shiftDays,
            newDueDate: addDays(targetMs.dueDate, shiftDays),
            currentProgress: targetMs.progress ?? 0,
            plannedProgress: msPlannedProg,
          });
        }
      }
    }

    summaryParts.push(
      `Delaying "${project.name}" by ${delayDays} days shifts its target date from ${project.targetDate} to ${newTargetDate}.`,
      `Current progress is ${currentProg}% vs planned ${plannedByNow}% (gap: ${progressGap}%).`,
      `After delay, planned progress recalibrates to ${plannedAfterDelay}% on the new timeline.`,
    );
    if (cascadeImpact.length > 0) {
      summaryParts.push(
        `${cascadeImpact.length} downstream milestone(s) would be pushed by ${delayDays}+ days.`
      );
    }
  }

  if (input.type === "cancel") {
    summaryParts.push(
      `Cancelling "${project.name}" removes its contribution from initiative "${initiative?.name ?? "N/A"}".`
    );
  }

  let financialImpact: ScenarioResult["financialImpact"];

  if (input.type === "budget_cut") {
    const reduction = Math.min(input.budgetReduction ?? 0, project.budget ?? 0);
    if (reduction <= 0) {
      throw new Error("budgetReduction must be > 0 for a budget_cut scenario");
    }
    const originalBudget = project.budget ?? 0;
    const newBudget = Math.max(originalBudget - reduction, 0);
    const actualSpent = project.budgetSpent ?? 0;
    const overSpent = actualSpent > newBudget;

    // Compute EVM impact
    const pp = await projectProgress(project.id);
    const ev = originalBudget * (pp.progress / 100);
    const originalCpi = actualSpent > 0 ? ev / actualSpent : 1;
    const newCpi = actualSpent > 0 ? (newBudget * (pp.progress / 100)) / actualSpent : 1;
    const originalEac = originalCpi > 0 ? originalBudget / originalCpi : originalBudget;
    const newEac = newCpi > 0 ? newBudget / newCpi : newBudget;

    financialImpact = { originalBudget, newBudget, actualSpent, overSpent, originalCpi: Math.round(originalCpi * 100) / 100, newCpi: Math.round(newCpi * 100) / 100, originalEac: Math.round(originalEac), newEac: Math.round(newEac) };

    const fmtM = (n: number) => n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M` : `SAR ${n.toLocaleString()}`;
    summaryParts.push(`Cutting "${project.name}" budget from ${fmtM(originalBudget)} to ${fmtM(newBudget)} (reduction: ${fmtM(reduction)}).`);
    summaryParts.push(`CPI would shift from ${financialImpact.originalCpi} to ${financialImpact.newCpi}. EAC from ${fmtM(originalEac)} to ${fmtM(newEac)}.`);
    if (overSpent) {
      summaryParts.push(`⚠ CRITICAL: Actual spend (${fmtM(actualSpent)}) already exceeds the proposed new budget.`);
    }
    if (input.adjustWeight) {
      summaryParts.push(`Strategic weight adjusted proportionally — project's contribution to initiative progress will decrease.`);
    } else {
      summaryParts.push(`Progress remains unchanged — budget does not affect milestone completion. Strategic weight kept as-is.`);
    }
  }

  // 5. Compute "after" state by simulating modified values in memory
  const afterInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number }[] = [];

  for (const init of siblingInitiatives) {
    const projects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, init.id));
    const progItems: { value: number; weight: number }[] = [];

    for (const p of projects) {
      // For the target project, apply scenario modifications
      if (p.id === input.projectId) {
        if (input.type === "cancel") {
          // Skip this project entirely
          continue;
        }
        const pp = await projectProgress(p.id);
        if (input.type === "budget_cut" && input.adjustWeight) {
          // User chose to also scale down the project's strategic weight
          const newBudget = Math.max((p.budget ?? 0) - (input.budgetReduction ?? 0), 0);
          progItems.push({ value: pp.progress, weight: newBudget });
        } else {
          // Default: keep weight unchanged (budget doesn't change work done)
          progItems.push({ value: pp.progress, weight: p.budget ?? 0 });
        }
      } else {
        const pp = await projectProgress(p.id);
        progItems.push({ value: pp.progress, weight: p.budget ?? 0 });
      }
    }

    afterInitiativeProgress.push({
      initiativeId: init.id,
      initiativeName: init.name,
      progress: weightedAvg(progItems),
    });
  }

  // Recalculate pillar progress with modified initiative values (weighted by initiative budget)
  const afterPillarProgress = beforePillarProgress.map((bp) => {
    if (pillar && bp.pillarId === pillar.id) {
      // Use our simulated initiative progress for this pillar, weighted by budget
      const initItems = afterInitiativeProgress.map((ip) => {
        const budgetWeight = beforeInitiativeProgress.find((bip) => bip.initiativeId === ip.initiativeId)?.budget ?? 0;
        return { value: ip.progress, weight: budgetWeight };
      });
      return { ...bp, progress: weightedAvg(initItems) };
    }
    return bp;
  });

  // Recalculate programme progress
  const afterProgrammeProgress = afterPillarProgress.length > 0
    ? round1(afterPillarProgress.reduce((s, p) => s + p.progress, 0) / afterPillarProgress.length)
    : 0;

  const progressDelta = round1(afterProgrammeProgress - programmeProgress);
  if (progressDelta !== 0) {
    summaryParts.push(
      `Programme progress would shift from ${programmeProgress}% to ${afterProgrammeProgress}% (${progressDelta > 0 ? "+" : ""}${progressDelta}pp).`
    );
  } else {
    summaryParts.push(`Programme-level progress would remain at ${programmeProgress}%.`);
  }

  // Build progressImpact for delay scenarios
  let progressImpact: ScenarioResult["progressImpact"];
  if (input.type === "delay" && input.delayDays) {
    const pp = await projectProgress(input.projectId);
    const plannedByNow = calcPlannedProgress(project.startDate, project.targetDate);
    const newTarget = addDays(project.targetDate, input.delayDays);
    const plannedAfterDelay = calcPlannedProgress(project.startDate, newTarget);
    progressImpact = {
      projectName: project.name,
      currentProgress: pp.progress,
      plannedProgressByNow: round1(plannedByNow),
      plannedProgressAfterDelay: round1(plannedAfterDelay),
      progressGap: round1(plannedByNow - pp.progress),
      originalTargetDate: project.targetDate,
      newTargetDate: newTarget,
      daysDelayed: input.delayDays,
    };
  }

  return {
    input,
    before,
    after: {
      programmeProgress: afterProgrammeProgress,
      affectedPillarProgress: afterPillarProgress,
      affectedInitiativeProgress: afterInitiativeProgress,
    },
    progressImpact,
    cascadeImpact,
    financialImpact,
    summary: summaryParts.join(" "),
  };
}
