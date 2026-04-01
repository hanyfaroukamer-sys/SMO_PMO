import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoActivityLogTable,
} from "@workspace/db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { projectProgress } from "./spmo-calc";

// ─────────────────────────────────────────────────────────────
// Predictive Delay Engine
// Analyzes milestone completion velocity and predicts future delays.
// ─────────────────────────────────────────────────────────────

export interface DelayPrediction {
  projectId: number;
  projectName: string;
  currentProgress: number;
  velocityPerDay: number; // progress points per day
  projectedCompletionDate: string; // ISO date
  targetDate: string;
  predictedDelayDays: number; // positive = late, negative = early
  confidence: "high" | "medium" | "low"; // based on data points
  trend: "accelerating" | "steady" | "decelerating";
  riskLevel: "critical" | "high" | "medium" | "low";
  reason: string;
}

export async function computeDelayPredictions(): Promise<DelayPrediction[]> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // 1. Get all active projects (not completed or cancelled)
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(
      and(
        sql`${spmoProjectsTable.status} NOT IN ('completed', 'cancelled')`,
      ),
    );

  const results: DelayPrediction[] = [];

  for (const project of projects) {
    // 2. Get project progress
    const prog = await projectProgress(project.id);
    const currentProgress = prog.progress;

    // Already complete at 100%
    if (currentProgress >= 100) continue;

    // 3. Get activity log entries for milestone progress updates in last 90 days
    const activities = await db
      .select()
      .from(spmoActivityLogTable)
      .where(
        and(
          eq(spmoActivityLogTable.action, "updated"),
          eq(spmoActivityLogTable.entityType, "milestone"),
          gte(spmoActivityLogTable.createdAt, ninetyDaysAgo),
        ),
      )
      .orderBy(desc(spmoActivityLogTable.createdAt));

    // Get milestones for this project to filter activities
    const milestones = await db
      .select()
      .from(spmoMilestonesTable)
      .where(eq(spmoMilestonesTable.projectId, project.id));

    const milestoneIds = new Set(milestones.map((m) => m.id));

    // Filter activities to only this project's milestones
    const projectActivities = activities.filter((a) =>
      milestoneIds.has(a.entityId),
    );

    // 4. Calculate velocity from progress changes
    // Extract progress data points from activity details
    const dataPoints: { date: Date; progress: number }[] = [];
    for (const activity of projectActivities) {
      const details = activity.details as Record<string, unknown>;
      if (details && typeof details.progress === "number") {
        dataPoints.push({
          date: new Date(activity.createdAt),
          progress: details.progress as number,
        });
      }
    }

    // Add current state as a data point
    dataPoints.unshift({ date: now, progress: currentProgress });

    // Need at least 2 points to compute velocity
    if (dataPoints.length < 2) {
      // Use time-elapsed heuristic: velocity = progress / elapsed days
      const startDate = new Date(project.startDate);
      const elapsedDays = Math.max(1, (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const velocity = currentProgress / elapsedDays;

      if (velocity <= 0) continue;

      const remainingProgress = 100 - currentProgress;
      const daysToComplete = remainingProgress / velocity;
      const projectedDate = new Date(now);
      projectedDate.setDate(projectedDate.getDate() + daysToComplete);

      const targetDate = new Date(project.targetDate);
      const delayDays = Math.round(
        (projectedDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (delayDays <= 14) continue;

      results.push({
        projectId: project.id,
        projectName: project.name,
        currentProgress,
        velocityPerDay: Math.round(velocity * 100) / 100,
        projectedCompletionDate: projectedDate.toISOString().split("T")[0],
        targetDate: project.targetDate,
        predictedDelayDays: delayDays,
        confidence: "low",
        trend: "steady",
        riskLevel: delayDays > 90 ? "critical" : delayDays > 60 ? "high" : delayDays > 30 ? "medium" : "low",
        reason: `Insufficient data points. Based on elapsed time, project is progressing at ${velocity.toFixed(2)}% per day, projecting ${delayDays} day delay.`,
      });
      continue;
    }

    // Sort data points oldest first
    dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Overall velocity: progress change / time span
    const oldest = dataPoints[dataPoints.length - 1];
    const newest = dataPoints[0];
    const totalDays = Math.max(
      1,
      (newest.date.getTime() - oldest.date.getTime()) / (1000 * 60 * 60 * 24),
    );
    const totalProgressChange = newest.progress - oldest.progress;
    const velocityPerDay = Math.max(0, totalProgressChange / totalDays);

    // 5. Project forward
    if (velocityPerDay <= 0) {
      // No progress being made — infinite delay
      const targetDate = new Date(project.targetDate);
      const daysUntilTarget = Math.round(
        (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilTarget < 14 && currentProgress < 90) {
        results.push({
          projectId: project.id,
          projectName: project.name,
          currentProgress,
          velocityPerDay: 0,
          projectedCompletionDate: "N/A",
          targetDate: project.targetDate,
          predictedDelayDays: 999,
          confidence: dataPoints.length >= 5 ? "high" : dataPoints.length >= 3 ? "medium" : "low",
          trend: "decelerating",
          riskLevel: "critical",
          reason: `No progress detected in the last 90 days. Project at ${currentProgress}% with target date approaching.`,
        });
      }
      continue;
    }

    const remainingProgress = 100 - currentProgress;
    const daysToComplete = remainingProgress / velocityPerDay;
    const projectedCompletionDate = new Date(now);
    projectedCompletionDate.setDate(projectedCompletionDate.getDate() + daysToComplete);

    // 6. Compare to target
    const targetDate = new Date(project.targetDate);
    const delayDays = Math.round(
      (projectedCompletionDate.getTime() - targetDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    // 7. Confidence
    const confidence: "high" | "medium" | "low" =
      dataPoints.length >= 5 ? "high" : dataPoints.length >= 3 ? "medium" : "low";

    // 8. Trend: compare last 30-day velocity to 60-90 day velocity
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const recentPoints = dataPoints.filter((p) => p.date >= thirtyDaysAgo);
    const olderPoints = dataPoints.filter(
      (p) => p.date >= ninetyDaysAgo && p.date < sixtyDaysAgo,
    );

    let trend: "accelerating" | "steady" | "decelerating" = "steady";
    if (recentPoints.length >= 2 && olderPoints.length >= 2) {
      const recentFirst = recentPoints[0];
      const recentLast = recentPoints[recentPoints.length - 1];
      const recentDays = Math.max(
        1,
        (recentLast.date.getTime() - recentFirst.date.getTime()) / (1000 * 60 * 60 * 24),
      );
      const recentVelocity = (recentLast.progress - recentFirst.progress) / recentDays;

      const olderFirst = olderPoints[0];
      const olderLast = olderPoints[olderPoints.length - 1];
      const olderDays = Math.max(
        1,
        (olderLast.date.getTime() - olderFirst.date.getTime()) / (1000 * 60 * 60 * 24),
      );
      const olderVelocity = (olderLast.progress - olderFirst.progress) / olderDays;

      if (olderVelocity > 0) {
        const ratio = recentVelocity / olderVelocity;
        if (ratio > 1.2) trend = "accelerating";
        else if (ratio < 0.8) trend = "decelerating";
      }
    }

    // 9. Only return projects with >14 day predicted delay
    if (delayDays <= 14) continue;

    const riskLevel: "critical" | "high" | "medium" | "low" =
      delayDays > 90
        ? "critical"
        : delayDays > 60
          ? "high"
          : delayDays > 30
            ? "medium"
            : "low";

    results.push({
      projectId: project.id,
      projectName: project.name,
      currentProgress,
      velocityPerDay: Math.round(velocityPerDay * 100) / 100,
      projectedCompletionDate: projectedCompletionDate.toISOString().split("T")[0],
      targetDate: project.targetDate,
      predictedDelayDays: delayDays,
      confidence,
      trend,
      riskLevel,
      reason: `At current velocity of ${velocityPerDay.toFixed(2)}%/day (${trend}), project will complete ~${delayDays} days late. ${confidence} confidence based on ${dataPoints.length} data points.`,
    });
  }

  // Sort by delay descending (worst first)
  results.sort((a, b) => b.predictedDelayDays - a.predictedDelayDays);

  return results;
}
