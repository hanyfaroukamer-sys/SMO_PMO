/**
 * Email reminder system for project managers.
 *
 * Two types of reminders:
 * 1. General task reminders (milestones, actions, risks) — sent X days ahead
 * 2. Weekly report deadline reminders — sent on the deadline day at the
 *    configured hour if the PM has NOT submitted their weekly report
 */

import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoProgrammeConfigTable,
  spmoProjectWeeklyReportsTable,
  spmoActionsTable,
  spmoRisksTable,
  spmoDepartmentsTable,
} from "@workspace/db";
import { eq, and, ne, inArray, gte, lte } from "drizzle-orm";
import { usersTable } from "@workspace/db";
import { logger } from "./logger";

export interface ReminderEmail {
  to: string;
  toName: string;
  cc?: string[];
  subject: string;
  sections: {
    title: string;
    items: { text: string; link: string; priority: "critical" | "high" | "medium" }[];
  }[];
}

function getCurrentWeekStart(resetDay: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const daysAgo = (dow - resetDay + 7) % 7;
  const ws = new Date(today);
  ws.setDate(today.getDate() - daysAgo);
  return ws.toISOString().split("T")[0];
}

/**
 * Generate weekly report deadline reminders.
 * Called on the deadline day — sends to PMs who have NOT submitted their report.
 * Includes CC recipients configured by admin.
 */
export async function generateWeeklyReportReminders(baseUrl: string): Promise<ReminderEmail[]> {
  const [cfg] = await db.select().from(spmoProgrammeConfigTable).limit(1);
  const weeklyResetDay = cfg?.weeklyResetDay ?? 3;
  const deadlineHour = cfg?.weeklyReportDeadlineHour ?? 15;
  // Global CC from config
  const ccRaw = cfg?.weeklyReportCcEmails ?? "";
  const globalCc = ccRaw.split(",").map((e) => e.trim()).filter(Boolean);

  // Department head emails for per-project CC
  const departments = await db.select().from(spmoDepartmentsTable);
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  const weekStart = getCurrentWeekStart(weeklyResetDay);
  const now = new Date();
  const deadlineTime = `${String(deadlineHour).padStart(2, "0")}:00`;

  // Get all active projects with owners
  const activeProjects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.status, "active"));

  // Get existing weekly reports for this week
  const projectIds = activeProjects.map((p) => p.id);
  const existingReports = projectIds.length > 0
    ? await db.select({ projectId: spmoProjectWeeklyReportsTable.projectId }).from(spmoProjectWeeklyReportsTable)
        .where(and(inArray(spmoProjectWeeklyReportsTable.projectId, projectIds), eq(spmoProjectWeeklyReportsTable.weekStart, weekStart)))
    : [];
  const reportedIds = new Set(existingReports.map((r) => r.projectId));

  // Find projects missing reports
  const missingProjects = activeProjects.filter((p) => !reportedIds.has(p.id));
  if (missingProjects.length === 0) {
    logger.info("[email-reminders] All weekly reports submitted — no deadline reminders needed");
    return [];
  }

  // Group by owner
  const users = await db.select().from(usersTable);
  const userMap = new Map(users.map((u) => [u.id, u]));

  const byOwner = new Map<string, typeof missingProjects>();
  for (const p of missingProjects) {
    if (!p.ownerId) continue;
    const list = byOwner.get(p.ownerId) ?? [];
    list.push(p);
    byOwner.set(p.ownerId, list);
  }

  const reminders: ReminderEmail[] = [];

  for (const [ownerId, projects] of byOwner.entries()) {
    const user = userMap.get(ownerId);
    if (!user?.email) continue;

    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
    const projectList = projects.map((p) => `${p.projectCode ?? ""} ${p.name}`.trim());

    // Build CC list: global CC + department heads of the missing projects
    const deptHeadEmails = new Set<string>();
    for (const p of projects) {
      if (p.departmentId) {
        const dept = deptMap.get(p.departmentId);
        if (dept?.headEmail) deptHeadEmails.add(dept.headEmail);
      }
    }
    const ccList = [...new Set([...globalCc, ...deptHeadEmails])].filter(Boolean);

    reminders.push({
      to: user.email,
      toName: displayName,
      cc: ccList.length > 0 ? ccList : undefined,
      subject: `⚠ Weekly Report Overdue — ${projects.length} project${projects.length > 1 ? "s" : ""} missing updates`,
      sections: [
        {
          title: `Weekly report deadline passed (${deadlineTime}) — updates not received`,
          items: projects.map((p) => ({
            text: `${p.projectCode ?? ""} ${p.name}`.trim() + ` — Week of ${weekStart} · No report submitted`,
            link: `${baseUrl}/projects/${p.id}?tab=reports`,
            priority: "critical" as const,
          })),
        },
      ],
    });
  }

  logger.info(`[email-reminders] Generated ${reminders.length} weekly report deadline reminders (${missingProjects.length} projects overdue)`);
  return reminders;
}

/**
 * Generate general task reminders (milestones, actions, risks).
 * Sent X days ahead of deadlines.
 */
export async function generateTaskReminders(baseUrl: string): Promise<ReminderEmail[]> {
  const [cfg] = await db.select().from(spmoProgrammeConfigTable).limit(1);
  const daysAhead = cfg?.reminderDaysAhead ?? 3;
  const weeklyResetDay = cfg?.weeklyResetDay ?? 3;
  const riskThreshold = cfg?.riskAlertThreshold ?? 9;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const aheadDate = new Date(today);
  aheadDate.setDate(aheadDate.getDate() + daysAhead);
  const aheadStr = aheadDate.toISOString().split("T")[0];

  const activeProjects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.status, "active"));
  const users = await db.select().from(usersTable);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const departments = await db.select().from(spmoDepartmentsTable);
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  const projectsByOwner = new Map<string, typeof activeProjects>();
  for (const p of activeProjects) {
    if (!p.ownerId) continue;
    const list = projectsByOwner.get(p.ownerId) ?? [];
    list.push(p);
    projectsByOwner.set(p.ownerId, list);
  }

  const reminders: ReminderEmail[] = [];

  for (const [ownerId, ownerProjects] of projectsByOwner.entries()) {
    const user = userMap.get(ownerId);
    if (!user?.email) continue;

    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
    const projectIds = ownerProjects.map((p) => p.id);
    const sections: ReminderEmail["sections"] = [];
    const projectNameMap = new Map(ownerProjects.map((p) => [p.id, p.name]));

    // Milestones due within X days
    if (projectIds.length > 0) {
      const upcoming = await db.select().from(spmoMilestonesTable).where(
        and(inArray(spmoMilestonesTable.projectId, projectIds), ne(spmoMilestonesTable.status, "approved"),
          gte(spmoMilestonesTable.dueDate, todayStr), lte(spmoMilestonesTable.dueDate, aheadStr))
      );
      if (upcoming.length > 0) {
        sections.push({
          title: `Milestones due in the next ${daysAhead} days`,
          items: upcoming.map((m) => ({
            text: `${m.name} (${projectNameMap.get(m.projectId) ?? "Project"}) — due ${m.dueDate} — ${m.progress}%`,
            link: `${baseUrl}/projects/${m.projectId}?tab=milestones`,
            priority: m.progress < 50 ? "critical" as const : "high" as const,
          })),
        });
      }

      // Overdue milestones
      const overdue = await db.select().from(spmoMilestonesTable).where(
        and(inArray(spmoMilestonesTable.projectId, projectIds), ne(spmoMilestonesTable.status, "approved"),
          lte(spmoMilestonesTable.dueDate, todayStr))
      );
      if (overdue.length > 0) {
        sections.push({
          title: "Overdue milestones",
          items: overdue.slice(0, 10).map((m) => ({
            text: `${m.name} (${projectNameMap.get(m.projectId) ?? "Project"}) — was due ${m.dueDate} — ${m.progress}%`,
            link: `${baseUrl}/projects/${m.projectId}?tab=milestones`,
            priority: "critical" as const,
          })),
        });
      }

      // High-score risks
      const highRisks = await db.select().from(spmoRisksTable).where(
        and(inArray(spmoRisksTable.projectId, projectIds), eq(spmoRisksTable.status, "open"), gte(spmoRisksTable.riskScore, riskThreshold))
      );
      if (highRisks.length > 0) {
        sections.push({
          title: "Active high-score risks",
          items: highRisks.slice(0, 5).map((r) => ({
            text: `${r.title} (${projectNameMap.get(r.projectId!) ?? "Project"}) — score ${r.riskScore}`,
            link: `${baseUrl}/projects/${r.projectId}?tab=risks`,
            priority: r.riskScore >= 16 ? "critical" as const : "high" as const,
          })),
        });
      }
    }

    // Overdue action items assigned to this user
    const overdueActions = await db.select().from(spmoActionsTable).where(
      and(eq(spmoActionsTable.assigneeId, ownerId), inArray(spmoActionsTable.status, ["open", "in_progress"]),
        lte(spmoActionsTable.dueDate, todayStr))
    );
    if (overdueActions.length > 0) {
      sections.push({
        title: "Overdue action items",
        items: overdueActions.slice(0, 5).map((a) => ({
          text: `${a.title} — was due ${a.dueDate}`,
          link: `${baseUrl}/projects/${a.projectId}?tab=risks`,
          priority: "critical" as const,
        })),
      });
    }

    if (sections.length > 0) {
      const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0);
      // CC department heads for all projects this PM owns
      const pmDeptHeads = new Set<string>();
      for (const p of ownerProjects) {
        if (p.departmentId) {
          const dept = deptMap.get(p.departmentId);
          if (dept?.headEmail) pmDeptHeads.add(dept.headEmail);
        }
      }
      reminders.push({
        to: user.email,
        toName: displayName,
        cc: pmDeptHeads.size > 0 ? [...pmDeptHeads] : undefined,
        subject: `StrategyPMO: ${totalItems} item${totalItems > 1 ? "s" : ""} need your attention`,
        sections,
      });
    }
  }

  logger.info(`[email-reminders] Generated ${reminders.length} task reminder emails`);
  return reminders;
}

/**
 * Format a reminder email as plain-text.
 */
export function formatReminderText(reminder: ReminderEmail): string {
  const lines: string[] = [
    `Hi ${reminder.toName},`,
    "",
  ];
  for (const section of reminder.sections) {
    lines.push(`--- ${section.title.toUpperCase()} ---`);
    for (const item of section.items) {
      const badge = item.priority === "critical" ? "[!!]" : item.priority === "high" ? "[!]" : "[ ]";
      lines.push(`${badge} ${item.text}`);
      lines.push(`    → ${item.link}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("This is an automated reminder from StrategyPMO.");
  return lines.join("\n");
}

/**
 * Format a reminder email as HTML.
 */
export function formatReminderHtml(reminder: ReminderEmail): string {
  const priorityColors = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6" };

  const sectionsHtml = reminder.sections.map((section) => {
    const itemsHtml = section.items.map((item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityColors[item.priority]};margin-right:8px;vertical-align:middle;"></span>
          ${item.text}
          <br><a href="${item.link}" style="color:#2563eb;font-size:12px;text-decoration:none;">View details →</a>
        </td>
      </tr>
    `).join("");
    return `
      <h3 style="color:#1f2937;font-size:14px;margin:20px 0 8px;border-left:3px solid #2563eb;padding-left:8px;">${section.title}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151;">${itemsHtml}</table>
    `;
  }).join("");

  return `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;font-size:20px;margin:0;">StrategyPMO</h1>
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0 0;">${reminder.subject}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="color:#374151;font-size:14px;">Hi ${reminder.toName},</p>
        ${sectionsHtml}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">This is an automated reminder from StrategyPMO.</p>
      </div>
    </div>
  `;
}
