import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoInitiativesTable,
} from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { projectProgress, computeStatus } from "./spmo-calc";

// ─────────────────────────────────────────────────────────────
// Earned Value Management (EVM) Engine
// Computes EVM metrics for every active project with a budget.
// ─────────────────────────────────────────────────────────────

export interface EvmMetrics {
  projectId: number;
  projectName: string;
  // Core EVM
  plannedValue: number;    // PV — budgeted cost of work scheduled
  earnedValue: number;     // EV — budgeted cost of work performed
  actualCost: number;      // AC — actual cost spent
  // Performance indices
  cpi: number;             // Cost Performance Index = EV/AC (>1 = under budget)
  spi: number;             // Schedule Performance Index = EV/PV (>1 = ahead)
  // Variances
  costVariance: number;    // CV = EV - AC
  scheduleVariance: number; // SV = EV - PV
  // Forecasts
  estimateAtCompletion: number;     // EAC = budget / CPI
  estimateToComplete: number;       // ETC = EAC - AC
  varianceAtCompletion: number;     // VAC = budget - EAC
  toCompletePerformanceIndex: number; // TCPI = (budget - EV) / (budget - AC)
  // Duration overrun
  durationOverrunPct: number;   // 0 if not overdue, e.g. 20 if 120% of planned duration elapsed
  // Status
  costStatus: "under_budget" | "on_budget" | "over_budget" | "not_started";
  scheduleStatus: "ahead" | "on_schedule" | "behind";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function deriveCostStatus(cpi: number): EvmMetrics["costStatus"] {
  if (cpi > 1.05) return "under_budget";
  if (cpi >= 0.95) return "on_budget";
  return "over_budget";
}

function deriveScheduleStatus(spi: number): EvmMetrics["scheduleStatus"] {
  if (spi > 1.05) return "ahead";
  if (spi >= 0.95) return "on_schedule";
  return "behind";
}

export async function computeEvmMetrics(): Promise<EvmMetrics[]> {
  // Get all active projects with budget > 0
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.status, "active"));

  const results: EvmMetrics[] = [];

  for (const project of projects) {
    const budget = project.budget ?? 0;
    if (budget <= 0) continue;

    const budgetSpent = project.budgetSpent ?? 0;

    // Calculate elapsed percentage
    const today = new Date();
    const start = project.startDate ? new Date(project.startDate) : null;
    const end = project.targetDate ? new Date(project.targetDate) : null;

    if (!start || !end) continue;

    const totalDays = Math.max((end.getTime() - start.getTime()) / 86_400_000, 1);
    const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86_400_000, 0);
    const elapsedPct = Math.min(elapsedDays / totalDays, 1.0); // cap at 100%

    // Get progress via the standard calculator
    const projProg = await projectProgress(project.id);
    const progressPct = projProg.progress / 100; // 0..1

    // Core EVM values
    const pv = budget * elapsedPct;     // Planned Value
    const ev = budget * progressPct;    // Earned Value
    const ac = budgetSpent;             // Actual Cost

    // Performance indices (guard against division by zero)
    const cpi = ac > 0 ? ev / ac : 1;
    const spi = pv > 0 ? ev / pv : 1;

    // Variances
    const cv = ev - ac;
    const sv = ev - pv;

    // Forecasts
    const eac = cpi !== 0 ? budget / cpi : budget;
    const etc = eac - ac;
    const vac = budget - eac;
    const remainingWork = budget - ev;
    const remainingBudget = budget - ac;
    const tcpi = remainingBudget > 0 ? remainingWork / remainingBudget : remainingWork > 0 ? 99.99 : 1;

    const durationOverrunPct = round2(Math.max(0, (elapsedDays / totalDays - 1) * 100));

    results.push({
      projectId: project.id,
      projectName: project.name,
      plannedValue: round2(pv),
      earnedValue: round2(ev),
      actualCost: round2(ac),
      cpi: round2(cpi),
      spi: round2(spi),
      costVariance: round2(cv),
      scheduleVariance: round2(sv),
      estimateAtCompletion: round2(eac),
      estimateToComplete: round2(Math.max(etc, 0)),
      varianceAtCompletion: round2(vac),
      toCompletePerformanceIndex: round2(tcpi),
      durationOverrunPct,
      costStatus: ac === 0 ? "not_started" : deriveCostStatus(cpi),
      scheduleStatus: deriveScheduleStatus(spi),
    });
  }

  return results;
}
