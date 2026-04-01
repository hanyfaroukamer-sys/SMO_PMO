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
  cascadeImpact: { milestoneId: number; milestoneName: string; projectName: string; shiftDays: number; newDueDate: string }[];
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

  const beforeInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number }[] = [];
  for (const init of siblingInitiatives) {
    const projects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, init.id));
    const progItems: { value: number; weight: number }[] = [];
    for (const p of projects) {
      const pp = await projectProgress(p.id);
      progItems.push({ value: pp.progress, weight: p.budget ?? 0 });
    }
    beforeInitiativeProgress.push({
      initiativeId: init.id,
      initiativeName: init.name,
      progress: weightedAvg(progItems),
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
          cascadeImpact.push({
            milestoneId: targetMs.id,
            milestoneName: targetMs.name,
            projectName: parentProject?.name ?? "Unknown",
            shiftDays,
            newDueDate: addDays(targetMs.dueDate, shiftDays),
          });
        }
      }
    }

    summaryParts.push(
      `Delaying "${project.name}" by ${delayDays} days shifts its target date from ${project.targetDate} to ${addDays(project.targetDate, delayDays)}.`
    );
    if (cascadeImpact.length > 0) {
      summaryParts.push(
        `${cascadeImpact.length} downstream milestone(s) would be affected by the cascade.`
      );
    }
  }

  if (input.type === "cancel") {
    summaryParts.push(
      `Cancelling "${project.name}" removes its contribution from initiative "${initiative?.name ?? "N/A"}".`
    );
  }

  if (input.type === "budget_cut") {
    const reduction = input.budgetReduction ?? 0;
    if (reduction <= 0) {
      throw new Error("budgetReduction must be > 0 for a budget_cut scenario");
    }
    const newBudget = Math.max((project.budget ?? 0) - reduction, 0);
    summaryParts.push(
      `Cutting "${project.name}" budget by ${reduction.toLocaleString()} (from ${(project.budget ?? 0).toLocaleString()} to ${newBudget.toLocaleString()}) would impact EVM forecasts.`
    );
    if ((project.budgetSpent ?? 0) > newBudget) {
      summaryParts.push(
        `WARNING: Actual spend (${(project.budgetSpent ?? 0).toLocaleString()}) already exceeds the proposed new budget.`
      );
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
        if (input.type === "budget_cut") {
          const newBudget = Math.max((p.budget ?? 0) - (input.budgetReduction ?? 0), 0);
          progItems.push({ value: pp.progress, weight: newBudget });
        } else {
          // delay: progress stays the same, but weight unchanged
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

  // Recalculate pillar progress with modified initiative values
  const afterPillarProgress = beforePillarProgress.map((bp) => {
    if (pillar && bp.pillarId === pillar.id) {
      // Use our simulated initiative progress for this pillar
      const initValues = afterInitiativeProgress.map((ip) => ip.progress);
      const avg = initValues.length > 0
        ? round1(initValues.reduce((s, v) => s + v, 0) / initValues.length)
        : 0;
      return { ...bp, progress: avg };
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

  return {
    input,
    before,
    after: {
      programmeProgress: afterProgrammeProgress,
      affectedPillarProgress: afterPillarProgress,
      affectedInitiativeProgress: afterInitiativeProgress,
    },
    cascadeImpact,
    summary: summaryParts.join(" "),
  };
}
