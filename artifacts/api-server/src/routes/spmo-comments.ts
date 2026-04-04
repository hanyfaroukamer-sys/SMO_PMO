import type { IRouter } from "express";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  spmoCommentsTable,
  spmoNotificationsTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoRisksTable,
  spmoKpisTable,
  spmoInitiativesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, getAuthUser, getUserDisplayName, parseId } from "./spmo";

export function registerCommentRoutes(router: IRouter) {
  // ─────────────────────────────────────────────────────────────
  // COMMENTS & DISCUSSION THREADS
  // ─────────────────────────────────────────────────────────────

  router.get("/spmo/comments", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const entityType = req.query.entityType as string;
    const entityId = req.query.entityId ? Number(req.query.entityId) : null;
    if (!entityType || !entityId) { res.status(400).json({ error: "entityType and entityId required" }); return; }
    const rows = await db.select().from(spmoCommentsTable).where(and(eq(spmoCommentsTable.entityType, entityType as "project" | "milestone" | "risk" | "kpi" | "initiative"), eq(spmoCommentsTable.entityId, entityId))).orderBy(asc(spmoCommentsTable.createdAt));
    res.json({ comments: rows });
  });

  router.post("/spmo/comments", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const user = getAuthUser(req);
    const body = z.object({
      entityType: z.enum(["project", "milestone", "risk", "kpi", "initiative"]),
      entityId: z.number(),
      parentId: z.number().nullable().optional(),
      body: z.string().min(1),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error }); return; }

    // Verify entity exists
    const entityTable = { project: spmoProjectsTable, milestone: spmoMilestonesTable, risk: spmoRisksTable, kpi: spmoKpisTable, initiative: spmoInitiativesTable }[body.data.entityType];
    if (entityTable) {
      const [exists] = await db.select({ id: (entityTable as { id: typeof spmoProjectsTable.id }).id }).from(entityTable).where(eq((entityTable as { id: typeof spmoProjectsTable.id }).id, body.data.entityId)).limit(1);
      if (!exists) { res.status(404).json({ error: `${body.data.entityType} with id ${body.data.entityId} not found` }); return; }
    }

    const [row] = await db.insert(spmoCommentsTable).values({
      ...body.data,
      authorId: userId,
      authorName: getUserDisplayName(user),
    }).returning();

    // Create notification for relevant owner + resolve entity context
    let notifyUserId: string | null = null;
    let entityName = "";
    let entityLink = "";
    let projectIdForLink: number | null = null;
    if (body.data.entityType === "project") {
      const [proj] = await db.select({ ownerId: spmoProjectsTable.ownerId, name: spmoProjectsTable.name }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, body.data.entityId)).limit(1);
      if (proj) { notifyUserId = proj.ownerId; entityName = proj.name; entityLink = `/projects/${body.data.entityId}?tab=discussion`; }
    } else if (body.data.entityType === "milestone") {
      const [ms] = await db.select({ projectId: spmoMilestonesTable.projectId, name: spmoMilestonesTable.name }).from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, body.data.entityId)).limit(1);
      if (ms) {
        const [proj] = await db.select({ ownerId: spmoProjectsTable.ownerId }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, ms.projectId)).limit(1);
        notifyUserId = proj?.ownerId ?? null; entityName = ms.name; entityLink = `/projects/${ms.projectId}?tab=milestones`;
      }
    } else if (body.data.entityType === "risk") {
      const [risk] = await db.select({ projectId: spmoRisksTable.projectId, title: spmoRisksTable.title }).from(spmoRisksTable).where(eq(spmoRisksTable.id, body.data.entityId)).limit(1);
      if (risk?.projectId) {
        const [proj] = await db.select({ ownerId: spmoProjectsTable.ownerId }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, risk.projectId)).limit(1);
        notifyUserId = proj?.ownerId ?? null; entityName = risk.title; entityLink = `/projects/${risk.projectId}?tab=risks`;
      }
    }
    if (notifyUserId && notifyUserId !== userId) {
      await db.insert(spmoNotificationsTable).values({
        userId: notifyUserId, type: "comment",
        title: `New comment on ${entityName}`,
        body: body.data.body.slice(0, 200),
        link: entityLink,
        entityType: body.data.entityType, entityId: body.data.entityId,
      });
    }

    // Parse @mentions in comment body and create "mention" notifications
    // Format 1: @[User Name](userId) — from dropdown selection
    // Format 2: @FirstName LastName — plain text fallback (lookup by name)
    const mentionedUserIds = new Set<string>();

    // Format 1: structured mentions
    const structuredRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    let sm;
    while ((sm = structuredRegex.exec(body.data.body)) !== null) {
      if (sm[2]) mentionedUserIds.add(sm[2]);
    }

    // Format 2: plain @Name mentions (e.g. "@John Smith" or "@john")
    // Strip out structured mentions first to avoid double-matching
    const strippedBody = body.data.body.replace(/@\[[^\]]+\]\([^)]+\)/g, "");
    const plainMentionRegex = /@(\w[\w\s]{1,40}?)(?=\s{2}|[.,;!?\n]|$)/g;
    let pm;
    while ((pm = plainMentionRegex.exec(strippedBody)) !== null) {
      const mentionName = pm[1].trim().toLowerCase();
      if (mentionName.length < 2) continue;
      // Look up user by name
      const matchedUsers = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
        .from(usersTable);
      const found = matchedUsers.find(u => {
        const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim().toLowerCase();
        const first = (u.firstName ?? "").toLowerCase();
        const last = (u.lastName ?? "").toLowerCase();
        return fullName === mentionName || first === mentionName || last === mentionName;
      });
      if (found) mentionedUserIds.add(found.id);
    }

    // Create notifications + send emails for all mentioned users
    for (const mentionedUserId of mentionedUserIds) {
      if (mentionedUserId === userId) continue; // don't notify yourself

      await db.insert(spmoNotificationsTable).values({
        userId: mentionedUserId,
        type: "mention",
        title: `${getUserDisplayName(user) ?? "Someone"} mentioned you in a discussion`,
        body: body.data.body.slice(0, 200),
        link: entityLink || null,
        entityType: body.data.entityType,
        entityId: body.data.entityId,
      });

      // Send email notification to the mentioned user
      try {
        const [mentionedUser] = await db.select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable).where(eq(usersTable.id, mentionedUserId)).limit(1);
        if (mentionedUser?.email) {
          const authorName = getUserDisplayName(user) ?? "A team member";
          const entityLabel = entityName || body.data.entityType;
          const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
          const fullLink = entityLink ? `${baseUrl}/strategy-pmo${entityLink}` : baseUrl;
          const subject = `${authorName} mentioned you in ${entityLabel}`;
          // Render @[Name](id) as just "Name" in the email body
          const cleanBody = body.data.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
          const htmlBody = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
              <div style="background: #0F172A; color: #F8FAFC; padding: 20px 24px; border-radius: 12px 12px 0 0;">
                <h2 style="margin: 0; font-size: 16px;">💬 You were mentioned in a discussion</h2>
              </div>
              <div style="border: 1px solid #E2E8F0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
                <p style="margin: 0 0 12px;"><strong>${authorName}</strong> mentioned you in <strong>${entityLabel}</strong>:</p>
                <blockquote style="margin: 12px 0; padding: 12px 16px; background: #F8FAFC; border-left: 3px solid #2563EB; border-radius: 4px; color: #334155; font-size: 14px;">
                  ${cleanBody.slice(0, 300).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                </blockquote>
                <a href="${fullLink}" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #2563EB; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  View Discussion →
                </a>
                <p style="margin: 20px 0 0; font-size: 12px; color: #94A3B8;">
                  You received this because you were @mentioned. Reply on the platform.
                </p>
              </div>
            </div>`;
          const textBody = `${authorName} mentioned you in ${entityLabel}:\n\n"${cleanBody.slice(0, 300)}"\n\nView: ${fullLink}`;

          // Send email — transport auto-detected (Resend > SendGrid > SMTP > console log)
          const { sendMentionEmail } = await import("../lib/mention-email.js");
          await sendMentionEmail({
            to: mentionedUser.email,
            subject,
            html: htmlBody,
            text: textBody,
          }).catch((err: unknown) => {
            req.log.warn({ err, to: mentionedUser.email }, "Failed to send mention email (non-fatal)");
          });
        }
      } catch (emailErr) {
        req.log.warn({ err: emailErr, mentionedUserId }, "Failed to send mention email (non-fatal)");
      }
    }

    res.status(201).json(row);
  });

  router.delete("/spmo/comments/:id", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const id = parseId(req, res);
    if (!id) return;
    const [comment] = await db.select({ authorId: spmoCommentsTable.authorId }).from(spmoCommentsTable).where(eq(spmoCommentsTable.id, id)).limit(1);
    if (!comment) { res.status(404).json({ error: "Not found" }); return; }
    const user = getAuthUser(req);
    if (comment.authorId !== userId && user?.role !== "admin") { res.status(403).json({ error: "Can only delete your own comments" }); return; }
    await db.delete(spmoCommentsTable).where(eq(spmoCommentsTable.id, id));
    res.json({ ok: true });
  });
}
