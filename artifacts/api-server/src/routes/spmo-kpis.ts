import { z } from "zod";
import type { IRouter } from "express";
import { eq, desc, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  spmoKpisTable,
  spmoKpiMeasurementsTable,
  spmoKpiEvidenceTable,
  spmoInitiativesTable,
  spmoNotificationsTable,
  usersTable,
} from "@workspace/db";
import {
  ListSpmoKpisQueryParams,
  CreateSpmoKpiBody,
  UpdateSpmoKpiParams,
  UpdateSpmoKpiBody,
  DeleteSpmoKpiParams,
} from "@workspace/api-zod";
import { logSpmoActivity } from "../lib/spmo-activity";

// ─────────────────────────────────────────────────────────────
// Helpers (re-declared locally to avoid circular imports)
// ─────────────────────────────────────────────────────────────

function getAuthUser(req: { user?: unknown }) {
  return req.user as
    | {
        id: string;
        email?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        role?: string | null;
      }
    | undefined;
}

function getUserDisplayName(user: ReturnType<typeof getAuthUser>): string | null {
  if (!user) return null;
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : user.email ?? null;
}

async function requireAuth(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
): Promise<string | null> {
  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  try {
    const [userRecord] = await db.select({ blocked: usersTable.blocked }).from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    if (userRecord?.blocked) {
      res.status(403).json({ error: "Your account has been blocked. Contact an administrator." });
      return null;
    }
  } catch {
    // If check fails, allow through (don't block on DB errors)
  }
  return user.id;
}

function requireAdmin(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
): boolean {
  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

async function requireRole(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
  ...allowedRoles: string[]
): Promise<string | null> {
  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (!user.role || !allowedRoles.includes(user.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return null;
  }
  try {
    const [userRecord] = await db.select({ blocked: usersTable.blocked }).from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    if (userRecord?.blocked) {
      res.status(403).json({ error: "Your account has been blocked. Contact an administrator." });
      return null;
    }
  } catch {
    // If check fails, allow through (don't block on DB errors)
  }
  return user.id;
}

function parseId(req: { params: Record<string, string> }, res: any, paramName = "id"): number | null {
  const id = Number(req.params[paramName]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: `Invalid ${paramName}` });
    return null;
  }
  return id;
}

// ─────────────────────────────────────────────────────────────
// Register all KPI routes on the given router
// ─────────────────────────────────────────────────────────────

export function registerKpiRoutes(router: IRouter): void {
  // ─────────────────────────────────────────────────────────────
  // KPIs
  // ─────────────────────────────────────────────────────────────
  router.get("/spmo/kpis", async (req, res): Promise<void> => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const qp = ListSpmoKpisQueryParams.safeParse(req.query);
    if (!qp.success) {
      res.status(400).json({ error: qp.error.message });
      return;
    }

    let rows = await db.select().from(spmoKpisTable).orderBy(asc(spmoKpisTable.createdAt));

    if (qp.data.type) {
      rows = rows.filter((k) => k.type === qp.data.type);
    }
    if (qp.data.projectId) {
      rows = rows.filter((k) => k.projectId === qp.data.projectId);
    }

    res.json({ kpis: rows });
  });

  router.post("/spmo/kpis", async (req, res): Promise<void> => {
    const userId = await requireRole(req, res, "admin", "project-manager");
    if (!userId) return;

    const parsed = CreateSpmoKpiBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const values = { ...parsed.data };
    if (values.type === "operational" && values.initiativeId) {
      const [initiative] = await db
        .select()
        .from(spmoInitiativesTable)
        .where(eq(spmoInitiativesTable.id, values.initiativeId));
      if (initiative) {
        values.ownerId = initiative.ownerId;
        values.ownerName = initiative.ownerName ?? undefined;
      }
    }

    const [kpi] = await db.insert(spmoKpisTable).values(values).returning();
    const user = getAuthUser(req);
    await logSpmoActivity(userId, getUserDisplayName(user), "created", "kpi", kpi.id, kpi.name);
    res.status(201).json(kpi);
  });

  router.put("/spmo/kpis/:id", async (req, res): Promise<void> => {
    const userId = await requireRole(req, res, "admin", "project-manager");
    if (!userId) return;

    const params = UpdateSpmoKpiParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateSpmoKpiBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updateValues = { ...parsed.data };
    if (updateValues.initiativeId) {
      const [initiative] = await db
        .select()
        .from(spmoInitiativesTable)
        .where(eq(spmoInitiativesTable.id, updateValues.initiativeId));
      if (initiative) {
        updateValues.ownerId = initiative.ownerId;
        updateValues.ownerName = initiative.ownerName ?? undefined;
      }
    }

    const [oldKpi] = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.id, params.data.id)).limit(1);

    // Auto-track velocity: when actual changes, snapshot old actual → prevActual
    if (updateValues.actual !== undefined) {
      const [existing] = await db
        .select({ actual: spmoKpisTable.actual })
        .from(spmoKpisTable)
        .where(eq(spmoKpisTable.id, params.data.id));
      if (existing && existing.actual !== updateValues.actual) {
        updateValues.prevActual = existing.actual;
        updateValues.prevActualDt = new Date().toISOString().split("T")[0];
      }
    }

    const [kpi] = await db
      .update(spmoKpisTable)
      .set(updateValues)
      .where(eq(spmoKpisTable.id, params.data.id))
      .returning();

    if (!kpi) {
      res.status(404).json({ error: "KPI not found" });
      return;
    }

    const user = getAuthUser(req);
    const kpiChanges: Record<string, { from: unknown; to: unknown }> = {};
    if (oldKpi) {
      for (const f of ["name", "target", "actual", "baseline", "status", "unit", "description"] as const) {
        const ov = (oldKpi as Record<string, unknown>)[f];
        const nv = (kpi as Record<string, unknown>)[f];
        if (ov !== nv && nv !== undefined) kpiChanges[f] = { from: ov, to: nv };
      }
    }
    await logSpmoActivity(userId, getUserDisplayName(user), "updated", "kpi", kpi.id, kpi.name, {
      link: "/kpis", changes: kpiChanges,
    });
    res.json(kpi);
  });

  router.delete("/spmo/kpis/:id", async (req, res): Promise<void> => {
    const userId = await requireRole(req, res, "admin", "project-manager");
    if (!userId) return;

    const params = DeleteSpmoKpiParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [kpi] = await db.delete(spmoKpisTable).where(eq(spmoKpisTable.id, params.data.id)).returning();
    if (!kpi) {
      res.status(404).json({ error: "KPI not found" });
      return;
    }

    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────────
  // KPI MEASUREMENTS
  // ─────────────────────────────────────────────────────────────

  router.get("/spmo/kpis/:id/measurements", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const kpiId = parseId(req, res);
    if (!kpiId) return;
    const rows = await db.select().from(spmoKpiMeasurementsTable).where(eq(spmoKpiMeasurementsTable.kpiId, kpiId)).orderBy(desc(spmoKpiMeasurementsTable.measuredAt));
    res.json({ measurements: rows });
  });

  router.post("/spmo/kpis/:id/measurements", async (req, res) => {
    const userId = await requireRole(req, res, "admin", "project-manager");
    if (!userId) return;
    const kpiId = parseId(req, res);
    if (!kpiId) return;
    const user = getAuthUser(req);
    const body = z.object({
      measuredAt: z.string(),
      value: z.number(),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error }); return; }
    const [row] = await db.insert(spmoKpiMeasurementsTable).values({
      kpiId,
      measuredAt: body.data.measuredAt,
      value: body.data.value,
      notes: body.data.notes,
      recordedById: userId,
      recordedByName: getUserDisplayName(user) ?? undefined,
    }).returning();
    const measureYear = new Date(body.data.measuredAt).getFullYear();
    const yearField: Record<string, unknown> = {};
    if (measureYear === 2026) yearField.actual2026 = body.data.value;
    else if (measureYear === 2027) yearField.actual2027 = body.data.value;
    else if (measureYear === 2028) yearField.actual2028 = body.data.value;
    else if (measureYear === 2029) yearField.actual2029 = body.data.value;
    await db.update(spmoKpisTable).set({ prevActual: spmoKpisTable.actual, prevActualDt: new Date().toISOString().split("T")[0], actual: body.data.value, ...yearField, updatedAt: new Date() }).where(eq(spmoKpisTable.id, kpiId));
    res.status(201).json(row);
  });

  router.delete("/spmo/kpis/:kpiId/measurements/:id", async (req, res) => {
    const userId = await requireRole(req, res, "admin", "project-manager");
    if (!userId) return;
    const id = parseId(req, res);
    if (!id) return;
    const [row] = await db.delete(spmoKpiMeasurementsTable).where(eq(spmoKpiMeasurementsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────────
  // KPI EVIDENCE
  // ─────────────────────────────────────────────────────────────

  // Upload KPI evidence
  router.post("/spmo/kpis/:id/evidence", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const kpiId = parseId(req, res);
    if (!kpiId) return;
    const user = getAuthUser(req);

    // Validate KPI exists
    const [kpi] = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.id, kpiId)).limit(1);
    if (!kpi) { res.status(404).json({ error: "KPI not found" }); return; }

    // Check: user must be KPI owner or admin
    if (kpi.ownerId !== userId && user?.role !== "admin") {
      res.status(403).json({ error: "Only the KPI owner or an admin can upload evidence" });
      return;
    }

    const body = z.object({
      fileName: z.string().min(1),
      contentType: z.string().optional(),
      objectPath: z.string().min(1),
      description: z.string().optional(),
      aiScore: z.number().optional(),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error }); return; }

    const [row] = await db.insert(spmoKpiEvidenceTable).values({
      kpiId,
      fileName: body.data.fileName,
      contentType: body.data.contentType,
      objectPath: body.data.objectPath,
      description: body.data.description,
      uploadedById: userId,
      uploadedByName: getUserDisplayName(user) ?? undefined,
      aiScore: body.data.aiScore,
    }).returning();

    // Update KPI evidenceStatus to submitted
    await db.update(spmoKpisTable).set({
      evidenceStatus: "submitted",
      evidenceSubmittedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(spmoKpisTable.id, kpiId));

    // Create notification for all admins
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(spmoNotificationsTable).values({
        userId: admin.id,
        type: "alert",
        title: `KPI evidence submitted for "${kpi.name}"`,
        body: `${getUserDisplayName(user) ?? "A user"} uploaded evidence for KPI "${kpi.name}".`,
        link: `/kpis`,
        entityType: "kpi",
        entityId: kpiId,
      });
    }

    await logSpmoActivity(userId, getUserDisplayName(user), "uploaded_evidence", "kpi", kpiId, kpi.name, { fileName: body.data.fileName });

    res.status(201).json(row);
  });

  // List KPI evidence
  router.get("/spmo/kpis/:id/evidence", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const kpiId = parseId(req, res);
    if (!kpiId) return;

    const rows = await db.select().from(spmoKpiEvidenceTable).where(eq(spmoKpiEvidenceTable.kpiId, kpiId)).orderBy(desc(spmoKpiEvidenceTable.createdAt));
    res.json({ evidence: rows });
  });

  // Approve KPI evidence
  router.post("/spmo/kpis/:id/evidence/approve", async (req, res) => {
    const userId = await requireRole(req, res, "admin", "approver");
    if (!userId) return;
    const kpiId = parseId(req, res);
    if (!kpiId) return;
    const user = getAuthUser(req);

    const [kpi] = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.id, kpiId)).limit(1);
    if (!kpi) { res.status(404).json({ error: "KPI not found" }); return; }

    await db.update(spmoKpisTable).set({
      evidenceStatus: "approved",
      evidenceReviewedAt: new Date(),
      evidenceReviewedBy: getUserDisplayName(user),
      updatedAt: new Date(),
    }).where(eq(spmoKpisTable.id, kpiId));

    // Notify KPI owner
    if (kpi.ownerId) {
      await db.insert(spmoNotificationsTable).values({
        userId: kpi.ownerId,
        type: "approval",
        title: "Your KPI evidence was approved",
        body: `Evidence for KPI "${kpi.name}" has been approved by ${getUserDisplayName(user) ?? "an admin"}.`,
        link: `/kpis`,
        entityType: "kpi",
        entityId: kpiId,
      });
    }

    await logSpmoActivity(userId, getUserDisplayName(user), "approved", "kpi", kpiId, kpi.name);

    res.json({ success: true });
  });

  // Reject KPI evidence
  router.post("/spmo/kpis/:id/evidence/reject", async (req, res) => {
    const userId = await requireRole(req, res, "admin", "approver");
    if (!userId) return;
    const kpiId = parseId(req, res);
    if (!kpiId) return;
    const user = getAuthUser(req);

    const body = z.object({
      reason: z.string().min(1, "Rejection reason is required"),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error }); return; }

    const [kpi] = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.id, kpiId)).limit(1);
    if (!kpi) { res.status(404).json({ error: "KPI not found" }); return; }

    await db.update(spmoKpisTable).set({
      evidenceStatus: "rejected",
      evidenceReviewedAt: new Date(),
      evidenceReviewedBy: getUserDisplayName(user),
      evidenceRejectionReason: body.data.reason,
      updatedAt: new Date(),
    }).where(eq(spmoKpisTable.id, kpiId));

    // Notify KPI owner
    if (kpi.ownerId) {
      await db.insert(spmoNotificationsTable).values({
        userId: kpi.ownerId,
        type: "alert",
        title: "Your KPI evidence was rejected",
        body: `Evidence for KPI "${kpi.name}" was rejected: ${body.data.reason}`,
        link: `/kpis`,
        entityType: "kpi",
        entityId: kpiId,
      });

      // Send email to KPI owner
      try {
        const [ownerUser] = await db.select({ email: usersTable.email, firstName: usersTable.firstName }).from(usersTable).where(eq(usersTable.id, kpi.ownerId)).limit(1);
        if (ownerUser?.email) {
          const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
          const safeKpiName = escapeHtml(kpi.name);
          const safeAdminName = escapeHtml(getUserDisplayName(user) ?? "an admin");
          const safeReason = escapeHtml(body.data.reason);
          const { sendMentionEmail } = await import("../lib/mention-email.js");
          await sendMentionEmail({
            to: ownerUser.email,
            subject: `KPI Evidence Rejected: ${safeKpiName}`,
            text: `Your evidence for KPI "${kpi.name}" was rejected by ${getUserDisplayName(user) ?? "an admin"}.\n\nReason: ${body.data.reason}\n\nPlease review and resubmit.`,
            html: `<p>Your evidence for KPI "<strong>${safeKpiName}</strong>" was rejected by ${safeAdminName}.</p><p><strong>Reason:</strong> ${safeReason}</p><p>Please review and resubmit.</p>`,
          });
        }
      } catch (emailErr) {
        req.log?.warn?.({ err: emailErr }, "Failed to send KPI evidence rejection email");
      }
    }

    await logSpmoActivity(userId, getUserDisplayName(user), "rejected", "kpi", kpiId, kpi.name, { reason: body.data.reason });

    res.json({ success: true });
  });

  // Assign KPI owner
  router.put("/spmo/kpis/:id/owner", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const kpiId = parseId(req, res);
    if (!kpiId) return;
    const user = getAuthUser(req);

    const body = z.object({
      ownerId: z.string().min(1),
      ownerName: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error }); return; }

    const [kpi] = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.id, kpiId)).limit(1);
    if (!kpi) { res.status(404).json({ error: "KPI not found" }); return; }

    await db.update(spmoKpisTable).set({
      ownerId: body.data.ownerId,
      ownerName: body.data.ownerName,
      updatedAt: new Date(),
    }).where(eq(spmoKpisTable.id, kpiId));

    // Notify new owner
    await db.insert(spmoNotificationsTable).values({
      userId: body.data.ownerId,
      type: "assignment",
      title: `You've been assigned as owner of KPI "${kpi.name}"`,
      body: `${getUserDisplayName(user) ?? "An admin"} assigned you as the owner of KPI "${kpi.name}".`,
      link: `/kpis`,
      entityType: "kpi",
      entityId: kpiId,
    });

    await logSpmoActivity(user?.id ?? "system", getUserDisplayName(user), "updated", "kpi", kpiId, kpi.name, { action: "owner_assigned", newOwnerId: body.data.ownerId, newOwnerName: body.data.ownerName });

    res.json({ success: true });
  });
}
