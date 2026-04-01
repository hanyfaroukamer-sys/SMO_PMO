import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoActivityLogTable,
  spmoProjectWeeklyReportsTable,
  spmoRisksTable,
  spmoDepartmentsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, notInArray } from "drizzle-orm";
import { projectProgress, computeStatus } from "./spmo-calc";

// ─────────────────────────────────────────────────────────────
// Programme-Wide Weekly Digest Engine
// Generates a programme-level weekly progress report covering
// ALL projects — designed for executives and PMO directors.
// ─────────────────────────────────────────────────────────────

export interface ProjectWeeklyDigest {
  projectId: number;
  projectName: string;
  projectCode: string | null;
  departmentName: string | null;
  ownerName: string | null;

  // Progress
  currentProgress: number;
  progressLastWeek: number;
  progressDelta: number;
  velocityPerDay: number;

  // Status
  healthStatus: string;
  computedStatus: { status: string; reason: string } | null;

  // Milestones this week
  milestonesCompleted: { id: number; name: string }[];
  milestonesSubmitted: { id: number; name: string }[];
  milestonesOverdue: { id: number; name: string; daysOverdue: number }[];
  milestonesDueSoon: { id: number; name: string; daysLeft: number }[];

  // Budget
  budget: number;
  spent: number;
  spentPct: number;

  // Risks
  activeRiskCount: number;
  highRiskCount: number;
  newRisksThisWeek: number;

  // Weekly report status
  weeklyReportSubmitted: boolean;
  weeklyReportAchievements: string | null;
  weeklyReportNextSteps: string | null;

  // Flags
  flags: string[];
}

export interface ProgrammeWeeklyDigest {
  generatedAt: string;
  weekLabel: string;

  // Programme-level summary
  programmeProgress: number;
  programmeProgressDelta: number;
  totalProjects: number;
  activeProjects: number;

  // Aggregates
  milestonesCompletedThisWeek: number;
  milestonesSubmittedThisWeek: number;
  totalOverdueMilestones: number;
  projectsWithNoProgress: number;
  projectsAtRisk: number;
  projectsDelayed: number;

  // Budget summary
  totalBudget: number;
  totalSpent: number;

  // Per-project detail
  projects: ProjectWeeklyDigest[];

  // Top highlights (auto-generated)
  highlights: string[];
  concerns: string[];
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

function weekLabel(now: Date): string {
  // Find the Monday of the current week
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `Week of ${monday.getDate()} ${months[monday.getMonth()]} ${monday.getFullYear()}`;
}

function weekStart(now: Date): string {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday.toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────
// Main generator
// ─────────────────────────────────────────────────────────────

export async function generateProgrammeWeeklyDigest(): Promise<ProgrammeWeeklyDigest> {
  const now = new Date();
  const sevenDaysAgo = daysAgo(7);
  const fourteenDaysAgo = daysAgo(14);
  const todayStr = now.toISOString().split("T")[0];
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysFromNowStr = sevenDaysFromNow.toISOString().split("T")[0];

  // 1. Get all non-cancelled projects with departments
  const projects = await db
    .select({
      id: spmoProjectsTable.id,
      name: spmoProjectsTable.name,
      projectCode: spmoProjectsTable.projectCode,
      ownerName: spmoProjectsTable.ownerName,
      status: spmoProjectsTable.status,
      startDate: spmoProjectsTable.startDate,
      targetDate: spmoProjectsTable.targetDate,
      budget: spmoProjectsTable.budget,
      budgetSpent: spmoProjectsTable.budgetSpent,
      departmentId: spmoProjectsTable.departmentId,
    })
    .from(spmoProjectsTable)
    .where(sql`${spmoProjectsTable.status} != 'cancelled'`);

  // Load departments map
  const departments = await db.select().from(spmoDepartmentsTable);
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  // Load all activity log entries from last 14 days (for progress lookback and flags)
  const recentActivity = await db
    .select()
    .from(spmoActivityLogTable)
    .where(gte(spmoActivityLogTable.createdAt, fourteenDaysAgo))
    .orderBy(desc(spmoActivityLogTable.createdAt));

  // Load all milestones
  const allMilestones = await db.select().from(spmoMilestonesTable);

  // Load all risks
  const allRisks = await db.select().from(spmoRisksTable);

  // Load weekly reports for this week
  const currentWeekStart = weekStart(now);
  const weeklyReports = await db
    .select()
    .from(spmoProjectWeeklyReportsTable)
    .where(eq(spmoProjectWeeklyReportsTable.weekStart, currentWeekStart));
  const reportsByProject = new Map(weeklyReports.map((r) => [r.projectId, r]));

  // Group milestones by project
  const milestonesByProject = new Map<number, typeof allMilestones>();
  for (const m of allMilestones) {
    const arr = milestonesByProject.get(m.projectId) ?? [];
    arr.push(m);
    milestonesByProject.set(m.projectId, arr);
  }

  // Group risks by project
  const risksByProject = new Map<number, typeof allRisks>();
  for (const r of allRisks) {
    if (r.projectId == null) continue;
    const arr = risksByProject.get(r.projectId) ?? [];
    arr.push(r);
    risksByProject.set(r.projectId, arr);
  }

  // Group recent activity by entity
  const activityByEntity = new Map<string, typeof recentActivity>();
  for (const a of recentActivity) {
    const key = `${a.entityType}:${a.entityId}`;
    const arr = activityByEntity.get(key) ?? [];
    arr.push(a);
    activityByEntity.set(key, arr);
  }

  // Load all activity for progress-lookback (may need entries older than 14 days)
  // We fetch the most recent activity per project's milestones before 7 days ago
  const olderActivity = await db
    .select()
    .from(spmoActivityLogTable)
    .where(
      and(
        eq(spmoActivityLogTable.entityType, "milestone"),
        lte(spmoActivityLogTable.createdAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(spmoActivityLogTable.createdAt));

  // Build per-project digests
  const projectDigests: ProjectWeeklyDigest[] = [];

  for (const project of projects) {
    const milestones = milestonesByProject.get(project.id) ?? [];
    const milestoneIds = new Set(milestones.map((m) => m.id));
    const risks = risksByProject.get(project.id) ?? [];
    const report = reportsByProject.get(project.id) ?? null;

    // 2. Current progress
    const prog = await projectProgress(project.id);
    const currentProgress = prog.progress;

    // 3. Progress 7 days ago from activity log
    // Find the most recent activity log entry before 7 days ago for this project's milestones
    const projectOlderActivities = olderActivity.filter(
      (a) => milestoneIds.has(a.entityId),
    );

    let progressLastWeek = currentProgress; // default: assume same
    if (projectOlderActivities.length > 0) {
      // Reconstruct approximate project progress from milestone states at that time
      // We use milestone progress values from activity details as best available data
      const milestoneProgressMap = new Map<number, number>();
      // For each milestone, find its progress value closest to 7 days ago
      for (const m of milestones) {
        const mActivities = projectOlderActivities.filter(
          (a) => a.entityId === m.id,
        );
        if (mActivities.length > 0) {
          const details = mActivities[0].details as Record<string, unknown>;
          if (details && typeof details.progress === "number") {
            milestoneProgressMap.set(m.id, details.progress);
          }
        }
      }
      // Compute weighted average like projectProgress does
      if (milestoneProgressMap.size > 0) {
        let totalWeight = 0;
        let weightedSum = 0;
        for (const m of milestones) {
          const mProgress = milestoneProgressMap.get(m.id) ?? m.progress;
          const w = m.weight || m.effortDays || 1;
          weightedSum += mProgress * w;
          totalWeight += w;
        }
        progressLastWeek =
          totalWeight > 0
            ? Math.round((weightedSum / totalWeight) * 10) / 10
            : 0;
      }
    }

    const progressDelta = Math.round((currentProgress - progressLastWeek) * 10) / 10;
    const velocityPerDay =
      progressDelta !== 0 ? Math.round((progressDelta / 7) * 100) / 100 : 0;

    // Status
    const statusResult = computeStatus(
      currentProgress,
      project.startDate,
      project.targetDate,
      project.budget,
      project.budgetSpent,
    );

    // 4. Milestones this week
    const completedThisWeek: { id: number; name: string }[] = [];
    const submittedNow: { id: number; name: string }[] = [];
    const overdue: { id: number; name: string; daysOverdue: number }[] = [];
    const dueSoon: { id: number; name: string; daysLeft: number }[] = [];

    // Check activity log for milestones approved this week
    for (const a of recentActivity) {
      if (
        a.action === "approved" &&
        a.entityType === "milestone" &&
        milestoneIds.has(a.entityId) &&
        a.createdAt >= sevenDaysAgo
      ) {
        const m = milestones.find((ms) => ms.id === a.entityId);
        if (m) {
          completedThisWeek.push({ id: m.id, name: m.name });
        }
      }
    }

    for (const m of milestones) {
      // Submitted
      if (m.status === "submitted") {
        submittedNow.push({ id: m.id, name: m.name });
      }

      // Overdue
      if (
        m.dueDate &&
        m.dueDate < todayStr &&
        m.status !== "approved"
      ) {
        const daysOver = daysBetween(now, new Date(m.dueDate));
        if (daysOver > 0) {
          overdue.push({ id: m.id, name: m.name, daysOverdue: daysOver });
        }
      }

      // Due soon (next 7 days)
      if (
        m.dueDate &&
        m.dueDate >= todayStr &&
        m.dueDate <= sevenDaysFromNowStr &&
        m.status !== "approved"
      ) {
        const dLeft = daysBetween(new Date(m.dueDate), now);
        dueSoon.push({ id: m.id, name: m.name, daysLeft: Math.max(dLeft, 0) });
      }
    }

    // Deduplicate completed
    const completedIds = new Set<number>();
    const dedupedCompleted = completedThisWeek.filter((c) => {
      if (completedIds.has(c.id)) return false;
      completedIds.add(c.id);
      return true;
    });

    // 5. Risks
    const activeRisks = risks.filter((r) => r.status === "open");
    const highRisks = activeRisks.filter(
      (r) =>
        r.probability === "high" ||
        r.probability === "critical" ||
        r.impact === "high" ||
        r.impact === "critical" ||
        r.riskScore >= 9,
    );
    const newRisksThisWeek = risks.filter(
      (r) => r.createdAt >= sevenDaysAgo,
    ).length;

    // Budget
    const budget = project.budget ?? 0;
    const spent = project.budgetSpent ?? 0;
    const spentPct = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : 0;

    // 6. Weekly report
    const weeklyReportSubmitted = report != null;
    const weeklyReportAchievements = report?.keyAchievements ?? null;
    const weeklyReportNextSteps = report?.nextSteps ?? null;

    // 7. Flags
    const flags: string[] = [];

    if (progressDelta === 0 && currentProgress > 0 && currentProgress < 100) {
      flags.push("No progress this week");
    }

    if (spentPct > 90) {
      flags.push(`Budget >${Math.round(spentPct)}% spent`);
    }

    if (overdue.length > 0) {
      flags.push(`${overdue.length} overdue milestone${overdue.length > 1 ? "s" : ""}`);
    }

    // Weekly report missing if not submitted by Wednesday
    const dayOfWeek = now.getDay(); // 0=Sun, 3=Wed
    if (!weeklyReportSubmitted && dayOfWeek >= 3 && project.status === "active") {
      flags.push("Weekly report missing");
    }

    // No updates in 14+ days
    const projectActivities = recentActivity.filter(
      (a) =>
        (a.entityType === "project" && a.entityId === project.id) ||
        (a.entityType === "milestone" && milestoneIds.has(a.entityId)),
    );
    if (
      projectActivities.length === 0 &&
      project.status === "active" &&
      currentProgress > 0 &&
      currentProgress < 100
    ) {
      flags.push("No updates in 14+ days");
    }

    projectDigests.push({
      projectId: project.id,
      projectName: project.name,
      projectCode: project.projectCode ?? null,
      departmentName: project.departmentId ? deptMap.get(project.departmentId) ?? null : null,
      ownerName: project.ownerName ?? null,
      currentProgress,
      progressLastWeek,
      progressDelta,
      velocityPerDay,
      healthStatus: statusResult.status,
      computedStatus: { status: statusResult.status, reason: statusResult.reason },
      milestonesCompleted: dedupedCompleted,
      milestonesSubmitted: submittedNow,
      milestonesOverdue: overdue,
      milestonesDueSoon: dueSoon,
      budget,
      spent,
      spentPct,
      activeRiskCount: activeRisks.length,
      highRiskCount: highRisks.length,
      newRisksThisWeek,
      weeklyReportSubmitted,
      weeklyReportAchievements,
      weeklyReportNextSteps,
      flags,
    });
  }

  // 9. Sort: delayed first, then at_risk, then by progressDelta ascending
  const statusOrder: Record<string, number> = {
    delayed: 0,
    at_risk: 1,
    not_started: 2,
    on_track: 3,
    completed: 4,
  };
  projectDigests.sort((a, b) => {
    const sa = statusOrder[a.healthStatus] ?? 3;
    const sb = statusOrder[b.healthStatus] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.progressDelta - b.progressDelta;
  });

  // Programme-level aggregates
  const activeProjects = projectDigests.filter(
    (p) => p.healthStatus !== "completed",
  );
  const totalBudget = projectDigests.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projectDigests.reduce((s, p) => s + p.spent, 0);
  const totalProgressSum = projectDigests.reduce((s, p) => s + p.currentProgress, 0);
  const programmeProgress =
    projectDigests.length > 0
      ? Math.round((totalProgressSum / projectDigests.length) * 10) / 10
      : 0;
  const totalProgressDeltaSum = projectDigests.reduce((s, p) => s + p.progressDelta, 0);
  const programmeProgressDelta =
    projectDigests.length > 0
      ? Math.round((totalProgressDeltaSum / projectDigests.length) * 10) / 10
      : 0;

  const milestonesCompletedThisWeek = projectDigests.reduce(
    (s, p) => s + p.milestonesCompleted.length,
    0,
  );
  const milestonesSubmittedThisWeek = projectDigests.reduce(
    (s, p) => s + p.milestonesSubmitted.length,
    0,
  );
  const totalOverdueMilestones = projectDigests.reduce(
    (s, p) => s + p.milestonesOverdue.length,
    0,
  );
  const projectsWithNoProgress = projectDigests.filter(
    (p) =>
      p.progressDelta === 0 &&
      p.currentProgress > 0 &&
      p.currentProgress < 100,
  ).length;
  const projectsAtRisk = projectDigests.filter(
    (p) => p.healthStatus === "at_risk",
  ).length;
  const projectsDelayed = projectDigests.filter(
    (p) => p.healthStatus === "delayed",
  ).length;

  // 8. Generate highlights and concerns
  const highlights: string[] = [];
  const concerns: string[] = [];

  if (milestonesCompletedThisWeek > 0) {
    highlights.push(
      `${milestonesCompletedThisWeek} milestone${milestonesCompletedThisWeek > 1 ? "s" : ""} completed this week`,
    );
  }
  if (milestonesSubmittedThisWeek > 0) {
    highlights.push(
      `${milestonesSubmittedThisWeek} milestone${milestonesSubmittedThisWeek > 1 ? "s" : ""} submitted for approval`,
    );
  }
  if (programmeProgressDelta > 0) {
    highlights.push(
      `Programme progressed +${programmeProgressDelta}% this week`,
    );
  }

  if (projectsWithNoProgress > 0) {
    concerns.push(
      `${projectsWithNoProgress} project${projectsWithNoProgress > 1 ? "s" : ""} made zero progress this week`,
    );
  }
  if (projectsDelayed > 0) {
    concerns.push(
      `${projectsDelayed} project${projectsDelayed > 1 ? "s" : ""} delayed`,
    );
  }
  if (totalOverdueMilestones > 0) {
    concerns.push(
      `${totalOverdueMilestones} overdue milestone${totalOverdueMilestones > 1 ? "s" : ""} across programme`,
    );
  }

  // Flag specific projects with budget concerns
  for (const p of projectDigests) {
    if (p.spentPct > 90 && p.currentProgress < 100) {
      concerns.push(
        `${p.projectCode ?? p.projectName} budget at ${p.spentPct}%`,
      );
    }
    if (
      p.flags.includes("No updates in 14+ days") &&
      p.currentProgress > 0
    ) {
      concerns.push(
        `${p.projectCode ?? p.projectName} no updates in 14+ days`,
      );
    }
  }

  return {
    generatedAt: now.toISOString(),
    weekLabel: weekLabel(now),
    programmeProgress,
    programmeProgressDelta,
    totalProjects: projectDigests.length,
    activeProjects: activeProjects.length,
    milestonesCompletedThisWeek,
    milestonesSubmittedThisWeek,
    totalOverdueMilestones,
    projectsWithNoProgress,
    projectsAtRisk,
    projectsDelayed,
    totalBudget,
    totalSpent,
    projects: projectDigests,
    highlights,
    concerns,
  };
}
