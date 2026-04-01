import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoActivityLogTable,
  spmoProjectWeeklyReportsTable,
  spmoRisksTable,
  spmoMitigationsTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { projectProgress } from "./spmo-calc";

// ─────────────────────────────────────────────────────────────
// Anomaly Detection Engine
// Continuous anomaly detection across all projects.
// Identifies suspicious patterns, stalled work, and data quality issues.
// ─────────────────────────────────────────────────────────────

export type AnomalyType =
  | "progress_spike"
  | "progress_stagnant"
  | "budget_burn_mismatch"
  | "duplicate_report"
  | "ghost_project"
  | "velocity_collapse"
  | "risk_ignored"
  | "approval_stale"
  | "weight_gaming"
  | "weekend_warrior";

export interface Anomaly {
  type: AnomalyType;
  severity: "critical" | "high" | "medium" | "low";
  projectId: number;
  projectName: string;
  entityType: string;
  entityId: number;
  entityName: string;
  detectedAt: string;
  description: string;
  evidence: string;
  suggestedAction: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

const severityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─────────────────────────────────────────────────────────────
// Main detector
// ─────────────────────────────────────────────────────────────

export async function detectAnomalies(): Promise<Anomaly[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const thirtyDaysAgo = daysAgo(30);
  const sixtyDaysAgo = daysAgo(60);
  const fourteenDaysAgo = daysAgo(14);

  // Load core data
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(sql`${spmoProjectsTable.status} NOT IN ('cancelled')`);

  const allMilestones = await db.select().from(spmoMilestonesTable);

  const activityLast60 = await db
    .select()
    .from(spmoActivityLogTable)
    .where(gte(spmoActivityLogTable.createdAt, sixtyDaysAgo))
    .orderBy(desc(spmoActivityLogTable.createdAt));

  const allRisks = await db.select().from(spmoRisksTable);

  const allMitigations = await db.select().from(spmoMitigationsTable);

  const weeklyReports = await db
    .select()
    .from(spmoProjectWeeklyReportsTable)
    .orderBy(desc(spmoProjectWeeklyReportsTable.createdAt));

  // Index milestones by project
  const milestonesByProject = new Map<number, typeof allMilestones>();
  for (const m of allMilestones) {
    const arr = milestonesByProject.get(m.projectId) ?? [];
    arr.push(m);
    milestonesByProject.set(m.projectId, arr);
  }

  // Index risks by project
  const risksByProject = new Map<number, typeof allRisks>();
  for (const r of allRisks) {
    if (r.projectId == null) continue;
    const arr = risksByProject.get(r.projectId) ?? [];
    arr.push(r);
    risksByProject.set(r.projectId, arr);
  }

  // Index mitigations by risk
  const mitigationsByRisk = new Map<number, typeof allMitigations>();
  for (const m of allMitigations) {
    const arr = mitigationsByRisk.get(m.riskId) ?? [];
    arr.push(m);
    mitigationsByRisk.set(m.riskId, arr);
  }

  // Index weekly reports by project (ordered by weekStart desc)
  const reportsByProject = new Map<number, typeof weeklyReports>();
  for (const r of weeklyReports) {
    const arr = reportsByProject.get(r.projectId) ?? [];
    arr.push(r);
    reportsByProject.set(r.projectId, arr);
  }

  const anomalies: Anomaly[] = [];

  for (const project of projects) {
    const milestones = milestonesByProject.get(project.id) ?? [];
    const milestoneIds = new Set(milestones.map((m) => m.id));
    const risks = risksByProject.get(project.id) ?? [];
    const reports = reportsByProject.get(project.id) ?? [];

    // Activity for this project's milestones
    const projectMilestoneActivity = activityLast60.filter(
      (a) => a.entityType === "milestone" && milestoneIds.has(a.entityId),
    );

    // Activity for this project entity directly
    const projectDirectActivity = activityLast60.filter(
      (a) => a.entityType === "project" && a.entityId === project.id,
    );

    const allProjectActivity = [...projectMilestoneActivity, ...projectDirectActivity];

    // Get current progress
    let currentProgress: number;
    try {
      const prog = await projectProgress(project.id);
      currentProgress = prog.progress;
    } catch {
      currentProgress = 0;
    }

    // ─── 1. progress_spike ───
    for (const activity of projectMilestoneActivity) {
      const details = activity.details as Record<string, unknown>;
      if (
        activity.action === "updated" &&
        details &&
        typeof details.progress === "number" &&
        typeof details.previousProgress === "number"
      ) {
        const jump = (details.progress as number) - (details.previousProgress as number);
        if (jump > 30) {
          const milestone = milestones.find((m) => m.id === activity.entityId);
          anomalies.push({
            type: "progress_spike",
            severity: "high",
            projectId: project.id,
            projectName: project.name,
            entityType: "milestone",
            entityId: activity.entityId,
            entityName: milestone?.name ?? activity.entityName,
            detectedAt: nowIso,
            description: `Progress jumped >30% in a single update`,
            evidence: `Progress jumped from ${details.previousProgress}% to ${details.progress}% on ${new Date(activity.createdAt).toISOString().split("T")[0]}`,
            suggestedAction: "Verify the progress update with supporting evidence",
          });
        }
      }
    }

    // ─── 2. progress_stagnant ───
    for (const m of milestones) {
      if (m.progress <= 0 || m.progress >= 100) continue;
      if (m.status === "approved") continue;

      const lastUpdate = projectMilestoneActivity.find(
        (a) => a.entityId === m.id && a.action === "updated",
      );
      const lastUpdateDate = lastUpdate
        ? new Date(lastUpdate.createdAt)
        : new Date(m.updatedAt);
      const staleDays = daysBetween(now, lastUpdateDate);

      if (staleDays >= 30) {
        anomalies.push({
          type: "progress_stagnant",
          severity: staleDays >= 45 ? "high" : "medium",
          projectId: project.id,
          projectName: project.name,
          entityType: "milestone",
          entityId: m.id,
          entityName: m.name,
          detectedAt: nowIso,
          description: `Milestone stuck at ${m.progress}% for ${staleDays} days`,
          evidence: `Last progress update was ${staleDays} days ago (${lastUpdateDate.toISOString().split("T")[0]}). Current progress: ${m.progress}%`,
          suggestedAction: "Follow up with the assignee to determine if the milestone is blocked",
        });
      }
    }

    // ─── 3. budget_burn_mismatch ───
    const budget = project.budget ?? 0;
    const spent = project.budgetSpent ?? 0;
    if (budget > 0 && project.status === "active") {
      const spentPct = (spent / budget) * 100;

      if (spentPct > 70 && currentProgress < 40) {
        anomalies.push({
          type: "budget_burn_mismatch",
          severity: "critical",
          projectId: project.id,
          projectName: project.name,
          entityType: "project",
          entityId: project.id,
          entityName: project.name,
          detectedAt: nowIso,
          description: `High budget consumption (${Math.round(spentPct)}%) with low progress (${currentProgress}%)`,
          evidence: `Budget: ${budget.toLocaleString()}, Spent: ${spent.toLocaleString()} (${Math.round(spentPct)}%), Progress: ${currentProgress}%`,
          suggestedAction: "Investigate cost overruns and potential scope issues",
        });
      } else if (spentPct < 20 && currentProgress > 60) {
        anomalies.push({
          type: "budget_burn_mismatch",
          severity: "medium",
          projectId: project.id,
          projectName: project.name,
          entityType: "project",
          entityId: project.id,
          entityName: project.name,
          detectedAt: nowIso,
          description: `Low budget consumption (${Math.round(spentPct)}%) with high progress (${currentProgress}%)`,
          evidence: `Budget: ${budget.toLocaleString()}, Spent: ${spent.toLocaleString()} (${Math.round(spentPct)}%), Progress: ${currentProgress}%`,
          suggestedAction: "Verify budget tracking is up to date — costs may not be recorded",
        });
      }
    }

    // ─── 4. duplicate_report ───
    if (reports.length >= 2) {
      const latest = reports[0];
      const previous = reports[1];
      const latestText = (latest.keyAchievements ?? "").trim().toLowerCase();
      const previousText = (previous.keyAchievements ?? "").trim().toLowerCase();

      if (
        latestText.length > 0 &&
        previousText.length > 0 &&
        latestText === previousText
      ) {
        anomalies.push({
          type: "duplicate_report",
          severity: "medium",
          projectId: project.id,
          projectName: project.name,
          entityType: "project",
          entityId: project.id,
          entityName: project.name,
          detectedAt: nowIso,
          description: `Weekly report achievements text is identical to previous week`,
          evidence: `Both weeks report: "${latestText.substring(0, 100)}${latestText.length > 100 ? "..." : ""}"`,
          suggestedAction: "Ask the project manager to provide specific updates for this week",
        });
      }
    }

    // ─── 5. ghost_project ───
    if (
      project.status === "active" &&
      budget > 0 &&
      currentProgress < 5
    ) {
      const recentProjectActivity = allProjectActivity.filter(
        (a) => a.createdAt >= thirtyDaysAgo,
      );
      if (recentProjectActivity.length === 0) {
        anomalies.push({
          type: "ghost_project",
          severity: "high",
          projectId: project.id,
          projectName: project.name,
          entityType: "project",
          entityId: project.id,
          entityName: project.name,
          detectedAt: nowIso,
          description: `Active project with budget allocated but no activity for 30+ days`,
          evidence: `Budget: ${budget.toLocaleString()}, Progress: ${currentProgress}%, No activity log entries in last 30 days`,
          suggestedAction: "Determine if this project has actually started or should be placed on hold",
        });
      }
    }

    // ─── 6. velocity_collapse ───
    // Compare last 30 days velocity to 30-60 days ago
    const last30Activity = projectMilestoneActivity.filter(
      (a) => a.createdAt >= thirtyDaysAgo,
    );
    const prev30Activity = projectMilestoneActivity.filter(
      (a) => a.createdAt < thirtyDaysAgo && a.createdAt >= sixtyDaysAgo,
    );

    if (prev30Activity.length >= 2 && project.status === "active") {
      // Calculate progress deltas for each period
      const extractProgressDeltas = (
        activities: typeof projectMilestoneActivity,
      ): number => {
        let totalDelta = 0;
        for (const a of activities) {
          if (a.action !== "updated") continue;
          const details = a.details as Record<string, unknown>;
          if (
            details &&
            typeof details.progress === "number" &&
            typeof details.previousProgress === "number"
          ) {
            totalDelta += (details.progress as number) - (details.previousProgress as number);
          }
        }
        return Math.max(totalDelta, 0);
      };

      const currentVelocity = extractProgressDeltas(last30Activity);
      const previousVelocity = extractProgressDeltas(prev30Activity);

      if (previousVelocity > 0 && currentVelocity < previousVelocity * 0.5) {
        const collapsePercent = Math.round(
          ((previousVelocity - currentVelocity) / previousVelocity) * 100,
        );
        anomalies.push({
          type: "velocity_collapse",
          severity: collapsePercent > 70 ? "high" : "medium",
          projectId: project.id,
          projectName: project.name,
          entityType: "project",
          entityId: project.id,
          entityName: project.name,
          detectedAt: nowIso,
          description: `Project velocity dropped ${collapsePercent}% compared to previous month`,
          evidence: `Previous 30-day progress delta: ${previousVelocity.toFixed(1)}%, Current 30-day delta: ${currentVelocity.toFixed(1)}%`,
          suggestedAction: "Investigate resource constraints or blockers causing the slowdown",
        });
      }
    }

    // ─── 7. risk_ignored ───
    for (const risk of risks) {
      if (risk.status !== "open") continue;
      if (risk.riskScore < 9) continue;

      const mitigations = mitigationsByRisk.get(risk.id) ?? [];
      const riskAge = daysBetween(now, new Date(risk.createdAt));

      if (mitigations.length === 0 && riskAge >= 14) {
        anomalies.push({
          type: "risk_ignored",
          severity: "high",
          projectId: project.id,
          projectName: project.name,
          entityType: "risk",
          entityId: risk.id,
          entityName: risk.title,
          detectedAt: nowIso,
          description: `High-severity risk with no mitigation plan for ${riskAge} days`,
          evidence: `Risk score: ${risk.riskScore}, Created: ${new Date(risk.createdAt).toISOString().split("T")[0]}, Mitigations: 0`,
          suggestedAction: "Create a mitigation plan for this high-severity risk immediately",
        });
      }
    }

    // ─── 8. approval_stale ───
    for (const m of milestones) {
      if (m.status !== "submitted" || !m.submittedAt) continue;

      const submittedDays = daysBetween(now, new Date(m.submittedAt));
      if (submittedDays > 14) {
        anomalies.push({
          type: "approval_stale",
          severity: "medium",
          projectId: project.id,
          projectName: project.name,
          entityType: "milestone",
          entityId: m.id,
          entityName: m.name,
          detectedAt: nowIso,
          description: `Milestone submitted for approval ${submittedDays} days ago with no action`,
          evidence: `Submitted on: ${new Date(m.submittedAt).toISOString().split("T")[0]}, Waiting: ${submittedDays} days`,
          suggestedAction: "Review and approve/reject this milestone to unblock the project",
        });
      }
    }

    // ─── 9. weight_gaming ───
    for (const m of milestones) {
      if (m.progress === 99 && m.status !== "approved") {
        anomalies.push({
          type: "weight_gaming",
          severity: "low",
          projectId: project.id,
          projectName: project.name,
          entityType: "milestone",
          entityId: m.id,
          entityName: m.name,
          detectedAt: nowIso,
          description: `Milestone progress set to exactly 99% — possible gaming of the 99% gate`,
          evidence: `Progress: 99%, Status: ${m.status}. The 99% gate caps milestones until approved.`,
          suggestedAction: "Verify if the milestone is genuinely at 99% or if it should be submitted for approval",
        });
      }
    }

    // ─── 10. weekend_warrior ───
    // Check recent 30 days of activity
    const last30All = allProjectActivity.filter(
      (a) => a.createdAt >= thirtyDaysAgo,
    );
    if (last30All.length >= 5) {
      const weekendCount = last30All.filter((a) =>
        isWeekend(new Date(a.createdAt)),
      ).length;
      const weekendPct = (weekendCount / last30All.length) * 100;

      if (weekendPct > 50) {
        anomalies.push({
          type: "weekend_warrior",
          severity: "low",
          projectId: project.id,
          projectName: project.name,
          entityType: "project",
          entityId: project.id,
          entityName: project.name,
          detectedAt: nowIso,
          description: `${Math.round(weekendPct)}% of recent updates were made on weekends`,
          evidence: `${weekendCount} of ${last30All.length} updates in the last 30 days were on Saturday/Sunday`,
          suggestedAction: "Check if updates are being batched — real-time tracking produces better data",
        });
      }
    }
  }

  // Sort: severity (critical first), then by detectedAt (newest first — all are "now" here)
  anomalies.sort((a, b) => {
    const sa = severityOrder[a.severity] ?? 3;
    const sb = severityOrder[b.severity] ?? 3;
    if (sa !== sb) return sa - sb;
    return b.detectedAt.localeCompare(a.detectedAt);
  });

  return anomalies;
}
