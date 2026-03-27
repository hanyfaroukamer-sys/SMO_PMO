/**
 * Email reminder system for project managers.
 * Generates reminder payloads for PMs whose milestones are approaching deadlines,
 * weekly reports are due, or tasks need attention.
 *
 * This module generates the reminder data — actual email sending requires
 * an SMTP/email service integration (SendGrid, AWS SES, etc.) configured
 * via EMAIL_* environment variables.
 */

import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoProgrammeConfigTable,
  spmoProjectWeeklyReportsTable,
  spmoActionsTable,
  spmoRisksTable,
} from "@workspace/db";
import { eq, and, ne, inArray, gte, lte } from "drizzle-orm";
import { usersTable } from "@workspace/db";
import { logger } from "./logger";

export interface ReminderEmail {
  to: string;
  toName: string;
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
 * Generate reminder emails for all project managers with upcoming deadlines.
 * Returns an array of email payloads ready to be sent.
 */
export async function generateReminders(baseUrl: string): Promise<ReminderEmail[]> {
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

  // Get all active projects with owners
  const activeProjects = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.status, "active"));

  // Get all users (for email addresses)
  const users = await db.select().from(usersTable);
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Group projects by owner
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

    // 1. Milestones due within X days
    const upcomingMilestones = await db.select().from(spmoMilestonesTable).where(
      and(
        inArray(spmoMilestonesTable.projectId, projectIds),
        ne(spmoMilestonesTable.status, "approved"),
        gte(spmoMilestonesTable.dueDate, todayStr),
        lte(spmoMilestonesTable.dueDate, aheadStr),
      )
    );

    if (upcomingMilestones.length > 0) {
      const projectNameMap = new Map(ownerProjects.map((p) => [p.id, p.name]));
      sections.push({
        title: `Milestones due in the next ${daysAhead} days`,
        items: upcomingMilestones.map((m) => ({
          text: `${m.name} (${projectNameMap.get(m.projectId) ?? "Project"}) — due ${m.dueDate} — ${m.progress}% complete`,
          link: `${baseUrl}/projects/${m.projectId}?tab=milestones`,
          priority: m.progress < 50 ? "critical" as const : "high" as const,
        })),
      });
    }

    // 2. Overdue milestones
    const overdueMilestones = await db.select().from(spmoMilestonesTable).where(
      and(
        inArray(spmoMilestonesTable.projectId, projectIds),
        ne(spmoMilestonesTable.status, "approved"),
        lte(spmoMilestonesTable.dueDate, todayStr),
      )
    );

    if (overdueMilestones.length > 0) {
      const projectNameMap = new Map(ownerProjects.map((p) => [p.id, p.name]));
      sections.push({
        title: "Overdue milestones requiring immediate attention",
        items: overdueMilestones.slice(0, 10).map((m) => ({
          text: `${m.name} (${projectNameMap.get(m.projectId) ?? "Project"}) — was due ${m.dueDate} — ${m.progress}%`,
          link: `${baseUrl}/projects/${m.projectId}?tab=milestones`,
          priority: "critical" as const,
        })),
      });
    }

    // 3. Weekly reports due
    const weekStart = getCurrentWeekStart(weeklyResetDay);
    const existingReports = await db.select({ projectId: spmoProjectWeeklyReportsTable.projectId }).from(spmoProjectWeeklyReportsTable).where(
      and(inArray(spmoProjectWeeklyReportsTable.projectId, projectIds), eq(spmoProjectWeeklyReportsTable.weekStart, weekStart))
    );
    const reportedIds = new Set(existingReports.map((r) => r.projectId));
    const missingReports = ownerProjects.filter((p) => !reportedIds.has(p.id));

    if (missingReports.length > 0) {
      sections.push({
        title: "Weekly reports due this week",
        items: missingReports.map((p) => ({
          text: `${p.name} — weekly report for week of ${weekStart} not yet submitted`,
          link: `${baseUrl}/projects/${p.id}?tab=reports`,
          priority: "medium" as const,
        })),
      });
    }

    // 4. Open action items assigned to this user
    const myActions = await db.select().from(spmoActionsTable).where(
      and(eq(spmoActionsTable.assigneeId, ownerId), inArray(spmoActionsTable.status, ["open", "in_progress"]))
    );
    const overdueActions = myActions.filter((a) => a.dueDate && a.dueDate < todayStr);
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

    // 5. High-score risks on their projects
    const highRisks = await db.select().from(spmoRisksTable).where(
      and(inArray(spmoRisksTable.projectId, projectIds), eq(spmoRisksTable.status, "open"), gte(spmoRisksTable.riskScore, riskThreshold))
    );
    if (highRisks.length > 0) {
      const projectNameMap = new Map(ownerProjects.map((p) => [p.id, p.name]));
      sections.push({
        title: "Active high-score risks",
        items: highRisks.slice(0, 5).map((r) => ({
          text: `${r.title} (${projectNameMap.get(r.projectId!) ?? "Project"}) — score ${r.riskScore}`,
          link: `${baseUrl}/projects/${r.projectId}?tab=risks`,
          priority: r.riskScore >= 16 ? "critical" as const : "high" as const,
        })),
      });
    }

    // Only send if there's something to remind about
    if (sections.length > 0) {
      const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0);
      reminders.push({
        to: user.email,
        toName: displayName,
        subject: `StrategyPMO: ${totalItems} item${totalItems > 1 ? "s" : ""} need your attention`,
        sections,
      });
    }
  }

  logger.info(`[email-reminders] Generated ${reminders.length} reminder emails for ${projectsByOwner.size} project owners`);
  return reminders;
}

/**
 * Format a reminder email as plain-text (for environments without HTML email).
 */
export function formatReminderText(reminder: ReminderEmail): string {
  const lines: string[] = [
    `Hi ${reminder.toName},`,
    "",
    "Here's your StrategyPMO task summary:",
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
  lines.push("Log in to view full details and take action.");
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
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityColors[item.priority]};margin-right:8px;"></span>
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
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0 0;">Weekly Task Reminder</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="color:#374151;font-size:14px;">Hi ${reminder.toName},</p>
        <p style="color:#6b7280;font-size:13px;">You have items requiring your attention:</p>
        ${sectionsHtml}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">This is an automated reminder from StrategyPMO. Log in to manage your tasks.</p>
      </div>
    </div>
  `;
}
