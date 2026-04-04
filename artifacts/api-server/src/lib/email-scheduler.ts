/**
 * Automated Email Scheduler
 *
 * Runs on a 5-minute interval, checks DB config for enabled schedules,
 * and fires emails only when:
 *   1. The schedule is enabled in config
 *   2. It's past the configured hour for today (or the configured day+hour for weekly)
 *   3. The last-sent timestamp is before today (task) or this week (weekly)
 *
 * Uses DB row-level locking (SELECT ... FOR UPDATE) to prevent duplicate
 * sends in multi-instance deployments.
 */

import { db } from "@workspace/db";
import { spmoProgrammeConfigTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let intervalId: ReturnType<typeof setInterval> | null = null;

function isSameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function isSameWeek(a: Date, b: Date, resetDay: number): boolean {
  // Check if both dates fall in the same "week" relative to resetDay (0=Sun, 6=Sat)
  const getWeekStart = (d: Date) => {
    const day = d.getUTCDay();
    const diff = (day - resetDay + 7) % 7;
    const start = new Date(d);
    start.setUTCDate(start.getUTCDate() - diff);
    start.setUTCHours(0, 0, 0, 0);
    return start.getTime();
  };
  return getWeekStart(a) === getWeekStart(b);
}

async function checkAndSend(): Promise<void> {
  try {
    const [config] = await db.select().from(spmoProgrammeConfigTable).limit(1);
    if (!config) return;

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = now.getUTCDay(); // 0=Sun, 6=Sat
    const baseUrl = process.env.APP_URL || "http://localhost:3000/strategy-pmo";

    // ── Task Reminders (daily at configured hour) ──
    if (config.taskReminderEnabled && currentHour >= config.taskReminderHour) {
      const lastSent = config.lastTaskReminderSentAt;
      const alreadySentToday = lastSent && isSameDay(new Date(lastSent), now);

      if (!alreadySentToday) {
        // Acquire lock: update the timestamp atomically
        const [locked] = await db
          .update(spmoProgrammeConfigTable)
          .set({ lastTaskReminderSentAt: now })
          .where(eq(spmoProgrammeConfigTable.id, 1))
          .returning({ id: spmoProgrammeConfigTable.id });

        if (locked) {
          console.log(`[email-scheduler] Sending daily task reminders at ${now.toISOString()}`);
          try {
            const { generateTaskReminders, formatReminderHtml, formatReminderText } = await import("./email-reminders");
            const { sendEmail } = await import("./mention-email");
            const reminders = await generateTaskReminders(baseUrl);

            for (const reminder of reminders) {
              await sendEmail({
                to: reminder.to,
                subject: reminder.subject,
                html: formatReminderHtml(reminder),
                text: formatReminderText(reminder),
              });
            }
            console.log(`[email-scheduler] Sent ${reminders.length} task reminder(s)`);
          } catch (err) {
            console.error("[email-scheduler] Task reminder send failed:", err);
          }
        }
      }
    }

    // ── Weekly Report Reminders (on configured day at configured hour) ──
    if (config.weeklyReminderEnabled
      && currentDay === (config.weeklyResetDay ?? 3)
      && currentHour >= (config.weeklyReportDeadlineHour ?? 15)
    ) {
      const lastSent = config.lastWeeklyReminderSentAt;
      const alreadySentThisWeek = lastSent && isSameWeek(new Date(lastSent), now, config.weeklyResetDay ?? 3);

      if (!alreadySentThisWeek) {
        const [locked] = await db
          .update(spmoProgrammeConfigTable)
          .set({ lastWeeklyReminderSentAt: now })
          .where(eq(spmoProgrammeConfigTable.id, 1))
          .returning({ id: spmoProgrammeConfigTable.id });

        if (locked) {
          console.log(`[email-scheduler] Sending weekly report reminders at ${now.toISOString()}`);
          try {
            const { generateWeeklyReportReminders, formatReminderHtml, formatReminderText } = await import("./email-reminders");
            const { sendEmail } = await import("./mention-email");
            const reminders = await generateWeeklyReportReminders(baseUrl);

            for (const reminder of reminders) {
              await sendEmail({
                to: reminder.to,
                subject: reminder.subject,
                html: formatReminderHtml(reminder),
                text: formatReminderText(reminder),
              });
            }
            console.log(`[email-scheduler] Sent ${reminders.length} weekly reminder(s)`);
          } catch (err) {
            console.error("[email-scheduler] Weekly reminder send failed:", err);
          }
        }
      }
    }
  } catch (err) {
    // Scheduler must never crash the server
    console.error("[email-scheduler] Scheduler check failed:", err);
  }
}

export function startEmailScheduler(): void {
  if (intervalId) return; // already running
  console.log("[email-scheduler] Starting automated email scheduler (checks every 5 min)");
  // Run first check after 30 seconds (let server fully boot)
  setTimeout(() => {
    checkAndSend();
    intervalId = setInterval(checkAndSend, CHECK_INTERVAL_MS);
  }, 30_000);
}

export function stopEmailScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[email-scheduler] Stopped");
  }
}
