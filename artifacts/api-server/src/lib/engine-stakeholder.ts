import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoActivityLogTable,
  spmoProjectWeeklyReportsTable,
  spmoDepartmentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// Stakeholder Intelligence Engine
// Tracks who is blocking what — approval bottlenecks, missing
// reports, overdue departments, and inactive project managers.
// ─────────────────────────────────────────────────────────────

export interface StakeholderAlert {
  type:
    | "approval_bottleneck"
    | "missing_report"
    | "department_overdue"
    | "inactive_pm";
  severity: "critical" | "high" | "medium";
  personName: string | null;
  personEmail: string | null;
  personRole: string | null;
  details: string;
  entityType: string; // project, milestone, department
  entityId: number;
  entityName: string;
  daysPending: number;
  actionRequired: string;
  escalateTo?: string | null;
}

export async function computeStakeholderAlerts(): Promise<StakeholderAlert[]> {
  const now = new Date();
  const alerts: StakeholderAlert[] = [];

  // ─────────────────────────────────────────────
  // 1. APPROVAL BOTTLENECKS
  // Milestones stuck in "submitted" status for > 7 days
  // ─────────────────────────────────────────────
  const submittedMilestones = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.status, "submitted"));

  for (const milestone of submittedMilestones) {
    let submittedDate: Date | null = null;

    // Use submittedAt timestamp if available
    if (milestone.submittedAt) {
      submittedDate = new Date(milestone.submittedAt);
    } else {
      // Fall back to activity log
      const submitActivity = await db
        .select()
        .from(spmoActivityLogTable)
        .where(
          and(
            eq(spmoActivityLogTable.action, "submitted"),
            eq(spmoActivityLogTable.entityType, "milestone"),
            eq(spmoActivityLogTable.entityId, milestone.id),
          ),
        )
        .orderBy(desc(spmoActivityLogTable.createdAt))
        .limit(1);

      if (submitActivity.length > 0) {
        submittedDate = new Date(submitActivity[0].createdAt);
      }
    }

    if (!submittedDate) continue;

    const daysPending = Math.floor(
      (now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysPending <= 7) continue;

    // Get the project for context
    const project = await db
      .select()
      .from(spmoProjectsTable)
      .where(eq(spmoProjectsTable.id, milestone.projectId))
      .limit(1);

    const projectName = project[0]?.name ?? "Unknown Project";

    // Find the project owner name for escalation
    let projectOwnerName: string | null = project[0]?.ownerName ?? null;
    if (!projectOwnerName && project[0]?.ownerId) {
      const projectOwner = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, project[0].ownerId))
        .limit(1);
      if (projectOwner.length > 0) {
        projectOwnerName = projectOwner[0].firstName
          ? `${projectOwner[0].firstName} ${projectOwner[0].lastName ?? ""}`.trim()
          : projectOwner[0].email;
      }
    }

    // Find approvers (admins or approvers)
    const approvers = await db
      .select()
      .from(usersTable)
      .where(sql`${usersTable.role} IN ('admin', 'approver')`);

    const approverNames = approvers.map((a) => a.firstName ? `${a.firstName} ${a.lastName ?? ""}`.trim() : a.email).join(", ");

    const severity: "critical" | "high" | "medium" =
      daysPending > 21 ? "critical" : daysPending > 14 ? "high" : "medium";

    const escalateNote = projectOwnerName
      ? ` Escalate to ${projectOwnerName} if not resolved.`
      : "";

    alerts.push({
      type: "approval_bottleneck",
      severity,
      personName: approverNames || null,
      personEmail: approvers[0]?.email ?? null,
      personRole: "approver",
      details: `Milestone "${milestone.name}" on project "${projectName}" has been awaiting approval for ${daysPending} days (submitted ${submittedDate.toISOString().split("T")[0]}).`,
      entityType: "milestone",
      entityId: milestone.id,
      entityName: milestone.name,
      daysPending,
      actionRequired: `Review and approve/reject milestone "${milestone.name}".${escalateNote}`,
      escalateTo: projectOwnerName ?? null,
    });
  }

  // ─────────────────────────────────────────────
  // 2. MISSING WEEKLY REPORTS
  // Active projects with no weekly report this week
  // ─────────────────────────────────────────────
  const activeProjects = await db
    .select()
    .from(spmoProjectsTable)
    .where(
      sql`${spmoProjectsTable.status} NOT IN ('completed', 'cancelled')`,
    );

  // Calculate the start of the current week (Monday)
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  // Get all weekly reports for this week
  const thisWeekReports = await db
    .select()
    .from(spmoProjectWeeklyReportsTable)
    .where(gte(spmoProjectWeeklyReportsTable.weekStart, weekStartStr));

  const reportedProjectIds = new Set(thisWeekReports.map((r) => r.projectId));

  for (const project of activeProjects) {
    if (reportedProjectIds.has(project.id)) continue;

    // Days since Monday
    const daysSinceWeekStart = Math.floor(
      (now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Only flag if it's Wednesday or later (give some grace)
    if (daysSinceWeekStart < 2) continue;

    // Find the project owner
    let ownerName: string | null = project.ownerName ?? null;
    let ownerEmail: string | null = null;
    if (project.ownerId) {
      const owner = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, project.ownerId))
        .limit(1);

      if (owner.length > 0) {
        ownerName = ownerName ?? (owner[0].firstName ? `${owner[0].firstName} ${owner[0].lastName ?? ""}`.trim() : null);
        ownerEmail = owner[0].email ?? null;
      }
    }

    alerts.push({
      type: "missing_report",
      severity: daysSinceWeekStart >= 5 ? "high" : "medium",
      personName: ownerName,
      personEmail: ownerEmail,
      personRole: "project-manager",
      details: `No weekly report submitted for "${project.name}" this week (week of ${weekStartStr}).`,
      entityType: "project",
      entityId: project.id,
      entityName: project.name,
      daysPending: daysSinceWeekStart,
      actionRequired: `Submit weekly progress report for "${project.name}".`,
    });
  }

  // ─────────────────────────────────────────────
  // 3. DEPARTMENT OVERDUE
  // Departments with 3+ overdue milestones
  // ─────────────────────────────────────────────
  const todayStr = now.toISOString().split("T")[0];

  // Get all milestones that are overdue (dueDate < today, not approved)
  const overdueMilestones = await db
    .select({
      milestoneId: spmoMilestonesTable.id,
      milestoneName: spmoMilestonesTable.name,
      dueDate: spmoMilestonesTable.dueDate,
      projectId: spmoMilestonesTable.projectId,
    })
    .from(spmoMilestonesTable)
    .where(
      and(
        lte(spmoMilestonesTable.dueDate, todayStr),
        sql`${spmoMilestonesTable.status} NOT IN ('approved')`,
        sql`${spmoMilestonesTable.progress} < 100`,
      ),
    );

  // Map milestones to departments through projects
  const projectIds = [...new Set(overdueMilestones.map((m) => m.projectId))];
  const projectDeptMap = new Map<number, number | null>();

  if (projectIds.length > 0) {
    const projectsWithDept = await db
      .select({
        id: spmoProjectsTable.id,
        departmentId: spmoProjectsTable.departmentId,
      })
      .from(spmoProjectsTable)
      .where(inArray(spmoProjectsTable.id, projectIds));

    for (const p of projectsWithDept) {
      projectDeptMap.set(p.id, p.departmentId);
    }
  }

  // Count overdue milestones per department
  const deptOverdueCount = new Map<number, number>();
  for (const m of overdueMilestones) {
    const deptId = projectDeptMap.get(m.projectId);
    if (deptId != null) {
      deptOverdueCount.set(deptId, (deptOverdueCount.get(deptId) ?? 0) + 1);
    }
  }

  // Flag departments with 3+ overdue
  for (const [deptId, count] of deptOverdueCount) {
    if (count < 3) continue;

    const dept = await db
      .select()
      .from(spmoDepartmentsTable)
      .where(eq(spmoDepartmentsTable.id, deptId))
      .limit(1);

    if (dept.length === 0) continue;

    const severity: "critical" | "high" | "medium" =
      count >= 10 ? "critical" : count >= 5 ? "high" : "medium";

    alerts.push({
      type: "department_overdue",
      severity,
      personName: dept[0].headName ?? null,
      personEmail: dept[0].headEmail ?? null,
      personRole: "department-head",
      details: `Department "${dept[0].name}" has ${count} overdue milestones across its projects.`,
      entityType: "department",
      entityId: deptId,
      entityName: dept[0].name,
      daysPending: count, // using count as a proxy for urgency
      actionRequired: `Review and address ${count} overdue milestones in department "${dept[0].name}".`,
    });
  }

  // ─────────────────────────────────────────────
  // 4. INACTIVE PMs
  // Project owners with no milestone progress updates in 21+ days
  // ─────────────────────────────────────────────
  const twentyOneDaysAgo = new Date(now);
  twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);

  // Group active projects by owner
  const ownerProjects = new Map<string, typeof activeProjects>();
  for (const p of activeProjects) {
    if (!p.ownerId) continue;
    const existing = ownerProjects.get(p.ownerId) ?? [];
    existing.push(p);
    ownerProjects.set(p.ownerId, existing);
  }

  for (const [ownerId, projects] of ownerProjects) {
    // Get milestone IDs belonging to this PM's active projects only
    const activeMilestones = await db
      .select({ id: spmoMilestonesTable.id })
      .from(spmoMilestonesTable)
      .where(
        inArray(
          spmoMilestonesTable.projectId,
          projects.map((p) => p.id),
        ),
      );
    const activeMilestoneIds = activeMilestones.map((m) => m.id);

    // Skip PMs who have no milestones on active projects
    if (activeMilestoneIds.length === 0) continue;

    // Check if this PM has any recent activity on active-project milestones
    const recentActivity = await db
      .select()
      .from(spmoActivityLogTable)
      .where(
        and(
          eq(spmoActivityLogTable.actorId, ownerId),
          eq(spmoActivityLogTable.entityType, "milestone"),
          inArray(spmoActivityLogTable.entityId, activeMilestoneIds),
          gte(spmoActivityLogTable.createdAt, twentyOneDaysAgo),
        ),
      )
      .limit(1);

    if (recentActivity.length > 0) continue;

    // Find the last activity date on active-project milestones
    const lastActivity = await db
      .select()
      .from(spmoActivityLogTable)
      .where(
        and(
          eq(spmoActivityLogTable.actorId, ownerId),
          eq(spmoActivityLogTable.entityType, "milestone"),
          inArray(spmoActivityLogTable.entityId, activeMilestoneIds),
        ),
      )
      .orderBy(desc(spmoActivityLogTable.createdAt))
      .limit(1);

    const lastDate = lastActivity.length > 0
      ? new Date(lastActivity[0].createdAt)
      : null;

    const daysSinceUpdate = lastDate
      ? Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Get owner info
    const owner = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, ownerId))
      .limit(1);

    const ownerName = owner.length > 0
      ? (owner[0].firstName ? `${owner[0].firstName} ${owner[0].lastName ?? ""}`.trim() : owner[0].email)
      : projects[0]?.ownerName ?? null;
    const ownerEmail = owner.length > 0 ? (owner[0].email ?? null) : null;

    const projectNames = projects.map((p) => p.name).join(", ");
    const severity: "critical" | "high" | "medium" =
      daysSinceUpdate > 45 ? "critical" : daysSinceUpdate > 30 ? "high" : "medium";

    alerts.push({
      type: "inactive_pm",
      severity,
      personName: ownerName,
      personEmail: ownerEmail,
      personRole: "project-manager",
      details: `PM "${ownerName}" has not updated any milestone progress in ${daysSinceUpdate} days. Manages: ${projectNames}.`,
      entityType: "project",
      entityId: projects[0].id,
      entityName: projects[0].name,
      daysPending: daysSinceUpdate,
      actionRequired: `Follow up with "${ownerName}" to confirm project status and update milestone progress.`,
    });
  }

  // Sort by severity (critical first) then by daysPending desc
  const severityOrder = { critical: 0, high: 1, medium: 2 };
  alerts.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.daysPending - a.daysPending;
  });

  return alerts;
}
