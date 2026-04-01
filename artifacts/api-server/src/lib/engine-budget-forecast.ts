import { db } from "@workspace/db";
import { spmoProjectsTable } from "@workspace/db";
import { and, sql } from "drizzle-orm";
import { projectProgress } from "./spmo-calc";

// ─────────────────────────────────────────────────────────────
// Budget Forecast Engine
// Projects budget burn rate to year-end and flags overruns/underspends.
// ─────────────────────────────────────────────────────────────

export interface BudgetForecast {
  projectId: number;
  projectName: string;
  totalBudget: number;
  spent: number;
  spentPct: number;
  progress: number;
  burnRate: number; // SAR per day over elapsed project time
  projectedTotalSpend: number; // at current burn rate
  projectedOverrun: number; // positive = over budget
  projectedUnderspend: number; // positive = under budget
  costPerformanceIndex: number; // EV/AC — >1 = under budget
  alert: "overrun" | "underspend" | "on-track";
  reason: string;
}

export async function computeBudgetForecasts(): Promise<BudgetForecast[]> {
  const now = new Date();

  // 1. Get all active projects with budget > 0
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(
      and(
        sql`${spmoProjectsTable.status} NOT IN ('completed', 'cancelled')`,
        sql`${spmoProjectsTable.budget} > 0`,
      ),
    );

  const results: BudgetForecast[] = [];

  for (const project of projects) {
    const budget = project.budget ?? 0;
    const spent = project.budgetSpent ?? 0;
    if (budget <= 0) continue;

    // 2. Calculate progress from projectProgress()
    const prog = await projectProgress(project.id);
    const progress = prog.progress;

    // 3. Burn rate = budgetSpent / elapsed days since project start
    const startDate = new Date(project.startDate);
    const targetDate = new Date(project.targetDate);
    const elapsedMs = now.getTime() - startDate.getTime();
    const elapsedDays = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24));
    const burnRate = spent / elapsedDays;

    // Remaining days until target
    const remainingMs = targetDate.getTime() - now.getTime();
    const remainingDays = Math.max(0, remainingMs / (1000 * 60 * 60 * 24));

    // 4. Project to end: projectedTotalSpend = spent + burnRate * remainingDays
    const projectedTotalSpend = spent + burnRate * remainingDays;

    // 5. CPI = (progress/100 * budget) / spent — earned value / actual cost
    const earnedValue = (progress / 100) * budget;
    const cpi = spent > 0 ? earnedValue / spent : progress > 0 ? 999 : 1;

    // Spent percentage
    const spentPct = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : 0;

    // Expected spend based on elapsed time proportion
    const totalDuration = Math.max(
      1,
      (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const timeElapsedRatio = Math.min(1, elapsedDays / totalDuration);
    const expectedSpend = budget * timeElapsedRatio;

    // 6. Determine alert
    let alert: "overrun" | "underspend" | "on-track" = "on-track";
    let reason = "";

    if (projectedTotalSpend > budget * 1.1) {
      // Projected to exceed budget by >10%
      alert = "overrun";
      const overrunPct = Math.round(
        ((projectedTotalSpend - budget) / budget) * 100,
      );
      reason = `At current burn rate of ${Math.round(burnRate).toLocaleString()} SAR/day, projected total spend is ${Math.round(projectedTotalSpend).toLocaleString()} SAR (${overrunPct}% over budget of ${Math.round(budget).toLocaleString()} SAR). CPI=${cpi.toFixed(2)}.`;
    } else if (spent < expectedSpend * 0.5 && progress > 50) {
      // Significantly underspending while progress is high
      alert = "underspend";
      reason = `Only ${spentPct}% of budget spent while progress is at ${progress}%. Expected spend at this point: ~${Math.round(expectedSpend).toLocaleString()} SAR, actual: ${Math.round(spent).toLocaleString()} SAR. Possible under-reporting of costs.`;
    }

    // 7. Only return projects with alerts (not on-track)
    if (alert === "on-track") continue;

    const projectedOverrun = Math.max(0, projectedTotalSpend - budget);
    const projectedUnderspend = Math.max(0, budget - projectedTotalSpend);

    results.push({
      projectId: project.id,
      projectName: project.name,
      totalBudget: budget,
      spent,
      spentPct,
      progress,
      burnRate: Math.round(burnRate * 100) / 100,
      projectedTotalSpend: Math.round(projectedTotalSpend),
      projectedOverrun: Math.round(projectedOverrun),
      projectedUnderspend: Math.round(projectedUnderspend),
      costPerformanceIndex: Math.round(cpi * 100) / 100,
      alert,
      reason,
    });
  }

  // Sort: overruns first (by projected overrun desc), then underspends
  results.sort((a, b) => {
    if (a.alert === "overrun" && b.alert !== "overrun") return -1;
    if (a.alert !== "overrun" && b.alert === "overrun") return 1;
    return b.projectedOverrun - a.projectedOverrun;
  });

  return results;
}
