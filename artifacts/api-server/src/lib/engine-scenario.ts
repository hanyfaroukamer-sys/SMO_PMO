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
  cancelImpact?: {
    projectName: string;
    projectBudget: number;
    projectBudgetSpent: number;
    projectProgress: number;
    projectMilestoneCount: number;
    projectRiskCount: number;
    initiativeName: string;
    initiativeProgressBefore: number;
    initiativeProgressAfter: number;
    initiativeProjectCount: number;
    pillarName: string;
    pillarProgressBefore: number;
    pillarProgressAfter: number;
    programmeProgressBefore: number;
    programmeProgressAfter: number;
    budgetFreed: number;
    sunkenCost: number;
  };
  progressImpact?: {
    projectName: string;
    currentProgress: number;
    plannedProgressAtOriginalTarget: number;
    simulatedProgressAtOriginalTarget: number;
    progressGapAtTarget: number;
    originalTargetDate: string;
    newTargetDate: string;
    daysDelayed: number;
    milestoneBreakdown: {
      name: string;
      weight: number;
      dueDate: string | null;
      newDueDate: string | null;
      currentProgress: number;
      willBeCompleteByOriginalTarget: boolean;
      simulatedProgress: number;
    }[];
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
      `Current progress is ${currentProg}%. Milestones that won't complete by the original deadline will widen the progress gap.`,
    );
    if (cascadeImpact.length > 0) {
      summaryParts.push(
        `${cascadeImpact.length} downstream milestone(s) would be pushed by ${delayDays}+ days.`
      );
    }
  }

  if (input.type === "cancel") {
    // Compute rich cancellation impact
    const projStats = await projectProgress(input.projectId);
    const projMilestones = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, input.projectId));
    const projRisks = await db.select().from(spmoProjectsTable); // we'll count risks below
    const riskCount = (await db.select().from(spmoProjectsTable)).length; // placeholder — get actual
    const openRisks = await (async () => {
      try {
        const { spmoRisksTable } = await import("@workspace/db");
        const risks = await db.select().from(spmoRisksTable).where(and(eq(spmoRisksTable.projectId, input.projectId), eq(spmoRisksTable.status, "open")));
        return risks.length;
      } catch { return 0; }
    })();

    const initProgressBefore = beforeInitiativeProgress.find((i) => i.initiativeId === initiative?.id);
    const initProjectCount = initiative
      ? (await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, initiative.id))).length
      : 0;

    const pillarBefore = beforePillarProgress.find((p) => p.pillarId === pillar?.id);

    summaryParts.push(
      `Cancelling "${project.name}" removes it from initiative "${initiative?.name ?? "N/A"}" (${initProjectCount} projects).`,
      `Budget impact: ${(project.budget ?? 0).toLocaleString()} allocated, ${(project.budgetSpent ?? 0).toLocaleString()} already spent (sunken cost).`,
      `Project was at ${projStats.progress}% progress with ${projMilestones.length} milestones and ${openRisks} open risks.`,
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

  // Pre-compute simulated progress for delay scenarios (milestone-level analysis)
  let simulatedDelayProgress: number | null = null;
  if (input.type === "delay" && input.delayDays) {
    const projMs = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, input.projectId));
    const origTargetTime = new Date(project.targetDate).getTime();
    const totalStoredW = projMs.reduce((s, m) => s + (m.weight ?? 0), 0);
    const allHaveW = projMs.every((m) => (m.weight ?? 0) > 0) && Math.abs(totalStoredW - 100) <= 5;
    const totalEff = projMs.reduce((s, m) => s + (m.effortDays ?? 0), 0);
    const getW = (m: typeof projMs[0]) => {
      if (allHaveW) return (m.weight ?? 0) / totalStoredW * 100;
      if (totalEff > 0) return ((m.effortDays ?? 0) / totalEff) * 100;
      return projMs.length > 0 ? 100 / projMs.length : 0;
    };
    let simWeightedSum = 0, totW = 0;
    for (const ms of projMs) {
      const w = getW(ms);
      totW += w;
      const msDueTime = ms.dueDate ? new Date(ms.dueDate).getTime() : origTargetTime;
      const msNewDueTime = msDueTime + input.delayDays * 86_400_000;
      const isCompleted = ms.status === "approved" || (ms.progress ?? 0) >= 100;
      let simProg: number;
      if (isCompleted) { simProg = 100; }
      else if (msNewDueTime <= origTargetTime) { simProg = 100; }
      else {
        const msStart = ms.startDate ? new Date(ms.startDate).getTime() : msDueTime - 30 * 86_400_000;
        const msDur = Math.max(msNewDueTime - msStart, 86_400_000);
        const timeToOrig = Math.max(origTargetTime - msStart, 0);
        simProg = Math.max(ms.progress ?? 0, Math.min(timeToOrig / msDur, 1) * 100);
      }
      simWeightedSum += (simProg / 100) * w;
    }
    simulatedDelayProgress = totW > 0 ? round1((simWeightedSum / totW) * 100) : 0;
  }

  // 5. Compute "after" state
  // For delay scenarios: use the "before" values as baseline and only adjust
  // the initiative that contains the delayed project. This avoids weighting
  // method discrepancies between calcProgrammeProgress and our local recalc.
  let afterInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number }[];
  let afterPillarProgress: typeof beforePillarProgress;
  let afterProgrammeProgress: number;

  if (input.type === "delay" && simulatedDelayProgress !== null && initiative) {
    // Only recalculate the affected initiative
    const initProjects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, initiative.id));
    const progItems: { value: number; weight: number }[] = [];
    for (const p of initProjects) {
      if (p.id === input.projectId) {
        progItems.push({ value: simulatedDelayProgress, weight: p.budget ?? 0 });
      } else {
        const pp = await projectProgress(p.id);
        progItems.push({ value: pp.progress, weight: p.budget ?? 0 });
      }
    }
    const newInitProgress = weightedAvg(progItems);

    // Use the same initiative progress for "before" baseline (recalculated with same method)
    const origProgItems: { value: number; weight: number }[] = [];
    for (const p of initProjects) {
      const pp = await projectProgress(p.id);
      origProgItems.push({ value: pp.progress, weight: p.budget ?? 0 });
    }
    const origInitProgress = weightedAvg(origProgItems);
    const initDelta = newInitProgress - origInitProgress;

    // Apply delta to the before values (preserves consistent weighting)
    afterInitiativeProgress = beforeInitiativeProgress.map((bi) => ({
      initiativeId: bi.initiativeId,
      initiativeName: bi.initiativeName,
      progress: bi.initiativeId === initiative.id ? round1(bi.progress + initDelta) : bi.progress,
    }));

    // Pillar: apply the init delta weighted by this initiative's share
    const pillarInitiatives = beforeInitiativeProgress.filter((i) => {
      const init = siblingInitiatives.find((si) => si.id === i.initiativeId);
      return init != null;
    });
    const initShare = pillarInitiatives.length > 0 ? 1 / pillarInitiatives.length : 1;
    const pillarDelta = initDelta * initShare;

    afterPillarProgress = beforePillarProgress.map((bp) =>
      bp.pillarId === pillar?.id ? { ...bp, progress: round1(bp.progress + pillarDelta) } : bp
    );

    // Programme: apply pillar delta weighted by pillar share
    const pillarShare = beforePillarProgress.length > 0 ? 1 / beforePillarProgress.length : 1;
    afterProgrammeProgress = round1(programmeProgress + pillarDelta * pillarShare);
  } else {
    // Cancel / budget_cut: full recalculation
    const afterInitProgress: { initiativeId: number; initiativeName: string; progress: number }[] = [];

    for (const init of siblingInitiatives) {
      const projects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, init.id));
      const progItems: { value: number; weight: number }[] = [];

      for (const p of projects) {
        if (p.id === input.projectId) {
          if (input.type === "cancel") { continue; }
          const pp = await projectProgress(p.id);
          if (input.type === "budget_cut" && input.adjustWeight) {
            const newBudget = Math.max((p.budget ?? 0) - (input.budgetReduction ?? 0), 0);
            progItems.push({ value: pp.progress, weight: newBudget });
          } else {
            progItems.push({ value: pp.progress, weight: p.budget ?? 0 });
          }
        } else {
          const pp = await projectProgress(p.id);
          progItems.push({ value: pp.progress, weight: p.budget ?? 0 });
        }
      }

      afterInitProgress.push({
        initiativeId: init.id,
        initiativeName: init.name,
        progress: weightedAvg(progItems),
      });
    }

    afterInitiativeProgress = afterInitProgress;

    // Recalculate pillar progress
    afterPillarProgress = beforePillarProgress.map((bp) => {
      if (pillar && bp.pillarId === pillar.id) {
        const initItems = afterInitiativeProgress.map((ip) => {
          const budgetWeight = beforeInitiativeProgress.find((bip) => bip.initiativeId === ip.initiativeId)?.budget ?? 0;
          return { value: ip.progress, weight: budgetWeight };
        });
        return { ...bp, progress: weightedAvg(initItems) };
      }
      return bp;
    });

    afterProgrammeProgress = afterPillarProgress.length > 0
      ? round1(afterPillarProgress.reduce((s, p) => s + p.progress, 0) / afterPillarProgress.length)
      : 0;
  }

  const progressDelta = round1(afterProgrammeProgress - programmeProgress);
  if (progressDelta !== 0) {
    summaryParts.push(
      `Programme progress would shift from ${programmeProgress}% to ${afterProgrammeProgress}% (${progressDelta > 0 ? "+" : ""}${progressDelta}pp).`
    );
  } else {
    summaryParts.push(`Programme-level progress would remain at ${programmeProgress}%.`);
  }

  // Build cancelImpact for cancel scenarios
  let cancelImpact: ScenarioResult["cancelImpact"];
  if (input.type === "cancel") {
    const projStats = await projectProgress(input.projectId);
    const projMilestones = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, input.projectId));
    const { spmoRisksTable } = await import("@workspace/db");
    let openRisks = 0;
    try { openRisks = (await db.select().from(spmoRisksTable).where(and(eq(spmoRisksTable.projectId, input.projectId), eq(spmoRisksTable.status, "open")))).length; } catch {}

    const initBefore = beforeInitiativeProgress.find((i) => i.initiativeId === initiative?.id);
    const initAfter = afterInitiativeProgress.find((i) => i.initiativeId === initiative?.id);
    const initProjectCount = initiative
      ? (await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, initiative.id))).length
      : 0;
    const pillarBefore = beforePillarProgress.find((p) => p.pillarId === pillar?.id);
    const pillarAfter = afterPillarProgress.find((p) => p.pillarId === pillar?.id);

    cancelImpact = {
      projectName: project.name,
      projectBudget: project.budget ?? 0,
      projectBudgetSpent: project.budgetSpent ?? 0,
      projectProgress: projStats.progress,
      projectMilestoneCount: projMilestones.length,
      projectRiskCount: openRisks,
      initiativeName: initiative?.name ?? "N/A",
      initiativeProgressBefore: round1(initBefore?.progress ?? 0),
      initiativeProgressAfter: round1(initAfter?.progress ?? 0),
      initiativeProjectCount: initProjectCount,
      pillarName: pillar?.name ?? "N/A",
      pillarProgressBefore: round1(pillarBefore?.progress ?? 0),
      pillarProgressAfter: round1(pillarAfter?.progress ?? 0),
      programmeProgressBefore: round1(programmeProgress),
      programmeProgressAfter: round1(afterProgrammeProgress),
      budgetFreed: Math.max((project.budget ?? 0) - (project.budgetSpent ?? 0), 0),
      sunkenCost: project.budgetSpent ?? 0,
    };
  }

  // Build progressImpact for delay scenarios
  // Simulate milestone-by-milestone: at the ORIGINAL target date,
  // which milestones will be complete and which won't?
  let progressImpact: ScenarioResult["progressImpact"];
  if (input.type === "delay" && input.delayDays) {
    const pp = await projectProgress(input.projectId);
    const newTarget = addDays(project.targetDate, input.delayDays);
    const origTargetTime = new Date(project.targetDate).getTime();

    // Get all milestones for this project
    const projectMs = await db.select().from(spmoMilestonesTable)
      .where(eq(spmoMilestonesTable.projectId, input.projectId));

    // Compute weights (same cascade as spmo-calc: weight > effortDays > equal)
    const totalStoredWeight = projectMs.reduce((s, m) => s + (m.weight ?? 0), 0);
    const allHaveWeight = projectMs.every((m) => (m.weight ?? 0) > 0) && Math.abs(totalStoredWeight - 100) <= 5;
    const totalEffort = projectMs.reduce((s, m) => s + (m.effortDays ?? 0), 0);

    const getWeight = (m: typeof projectMs[0]) => {
      if (allHaveWeight) return (m.weight ?? 0) / totalStoredWeight * 100;
      if (totalEffort > 0) return ((m.effortDays ?? 0) / totalEffort) * 100;
      return projectMs.length > 0 ? 100 / projectMs.length : 0;
    };

    // For each milestone, determine:
    // 1. PLANNED: was it supposed to be done by original target? (dueDate <= originalTarget)
    // 2. SIMULATED: with delay, will it actually be done by original target?
    //    - Already approved/completed milestones: YES (100%)
    //    - dueDate + delayDays <= originalTarget: YES (assume it finishes on shifted date)
    //    - dueDate + delayDays > originalTarget: NO — estimate partial progress
    const milestoneBreakdown: NonNullable<ScenarioResult["progressImpact"]>["milestoneBreakdown"] = [];
    let plannedWeightedSum = 0;
    let simulatedWeightedSum = 0;
    let totalWeight = 0;

    for (const ms of projectMs) {
      const w = getWeight(ms);
      totalWeight += w;
      const msDueTime = ms.dueDate ? new Date(ms.dueDate).getTime() : origTargetTime;
      const msNewDueTime = msDueTime + input.delayDays * 86_400_000;
      const isCompleted = ms.status === "approved" || (ms.progress ?? 0) >= 100;

      // PLANNED: by original target, this milestone should be complete if dueDate <= originalTarget
      const shouldBeCompleteByTarget = msDueTime <= origTargetTime;
      const plannedProgress = shouldBeCompleteByTarget ? 100 : 0;
      plannedWeightedSum += (plannedProgress / 100) * w;

      // SIMULATED: with delay, what will this milestone's progress be at original target?
      let simulatedMsProgress: number;
      if (isCompleted) {
        simulatedMsProgress = 100; // already done, delay doesn't undo work
      } else if (msNewDueTime <= origTargetTime) {
        // Shifted date still before original target — assume it'll complete
        simulatedMsProgress = 100;
      } else {
        // Shifted date is AFTER original target — milestone won't be done
        // Estimate: how far along will it be? Use time-based proportion
        const msStart = ms.startDate ? new Date(ms.startDate).getTime() : msDueTime - 30 * 86_400_000;
        const msDuration = Math.max(msNewDueTime - msStart, 86_400_000);
        const timeToOrigTarget = Math.max(origTargetTime - msStart, 0);
        const timeProportion = Math.min(timeToOrigTarget / msDuration, 1);
        // Take the max of current progress and time proportion
        simulatedMsProgress = round1(Math.max(ms.progress ?? 0, timeProportion * 100));
      }
      simulatedWeightedSum += (simulatedMsProgress / 100) * w;

      milestoneBreakdown.push({
        name: ms.name,
        weight: round1(w),
        dueDate: ms.dueDate,
        newDueDate: ms.dueDate ? addDays(ms.dueDate, input.delayDays) : null,
        currentProgress: ms.progress ?? 0,
        willBeCompleteByOriginalTarget: isCompleted || msNewDueTime <= origTargetTime,
        simulatedProgress: round1(simulatedMsProgress),
      });
    }

    const plannedAtOriginal = totalWeight > 0 ? round1((plannedWeightedSum / totalWeight) * 100) : 100;
    const simulatedAtOriginal = totalWeight > 0 ? round1((simulatedWeightedSum / totalWeight) * 100) : 0;
    const gap = round1(plannedAtOriginal - simulatedAtOriginal);

    progressImpact = {
      projectName: project.name,
      currentProgress: pp.progress,
      plannedProgressAtOriginalTarget: plannedAtOriginal,
      simulatedProgressAtOriginalTarget: simulatedAtOriginal,
      progressGapAtTarget: gap,
      originalTargetDate: project.targetDate,
      newTargetDate: newTarget,
      daysDelayed: input.delayDays,
      milestoneBreakdown,
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
    cancelImpact,
    progressImpact,
    cascadeImpact,
    financialImpact,
    summary: summaryParts.join(" "),
  };
}
