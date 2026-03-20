import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  initiativesTable,
  milestonesTable,
  fileAttachmentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ---------- Helpers ----------

function calcProgress(
  milestones: Array<{ status: string; weight: string | number }>
): number {
  if (!milestones || milestones.length === 0) return 0;
  const totalWeight = milestones.reduce(
    (sum, m) => sum + Number(m.weight),
    0
  );
  if (totalWeight === 0) return 0;
  const approvedWeight = milestones
    .filter((m) => m.status === "approved")
    .reduce((sum, m) => sum + Number(m.weight), 0);
  return Math.round((approvedWeight / totalWeight) * 100);
}

async function getInitiativeWithProgress(id: number) {
  const [initiative] = await db
    .select({
      initiative: initiativesTable,
      ownerFirstName: usersTable.firstName,
      ownerLastName: usersTable.lastName,
    })
    .from(initiativesTable)
    .leftJoin(usersTable, eq(initiativesTable.ownerId, usersTable.id))
    .where(eq(initiativesTable.id, id));

  if (!initiative) return null;

  const milestones = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.initiativeId, id));

  const progress = calcProgress(milestones);
  const approvedCount = milestones.filter((m) => m.status === "approved").length;
  const pendingCount = milestones.filter((m) => m.status === "submitted").length;

  return {
    ...initiative.initiative,
    ownerName: [initiative.ownerFirstName, initiative.ownerLastName]
      .filter(Boolean)
      .join(" ") || null,
    progress,
    milestoneCount: milestones.length,
    approvedCount,
    pendingCount,
  };
}

// ---------- List initiatives ----------

router.get("/initiatives", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const allInitiatives = await db
      .select({
        initiative: initiativesTable,
        ownerFirstName: usersTable.firstName,
        ownerLastName: usersTable.lastName,
      })
      .from(initiativesTable)
      .leftJoin(usersTable, eq(initiativesTable.ownerId, usersTable.id))
      .orderBy(initiativesTable.createdAt);

    const results = await Promise.all(
      allInitiatives.map(async (row) => {
        const milestones = await db
          .select()
          .from(milestonesTable)
          .where(eq(milestonesTable.initiativeId, row.initiative.id));

        const progress = calcProgress(milestones);
        return {
          ...row.initiative,
          ownerName: [row.ownerFirstName, row.ownerLastName]
            .filter(Boolean)
            .join(" ") || null,
          progress,
          milestoneCount: milestones.length,
          approvedCount: milestones.filter((m) => m.status === "approved").length,
          pendingCount: milestones.filter((m) => m.status === "submitted").length,
        };
      })
    );

    res.json({ initiatives: results });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list initiatives" });
  }
});

// ---------- Create initiative ----------

const createInitiativeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "completed", "on_hold", "cancelled"]).default("draft"),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
});

router.post("/initiatives", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const role = req.user.role;
  if (role !== "admin" && role !== "project-manager") {
    res.status(403).json({ error: "Only project managers and admins can create initiatives" });
    return;
  }

  const parsed = createInitiativeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [created] = await db
      .insert(initiativesTable)
      .values({
        ...parsed.data,
        ownerId: req.user.id,
      })
      .returning();

    const ownerName = [req.user.firstName, req.user.lastName]
      .filter(Boolean)
      .join(" ") || null;

    res.status(201).json({ ...created, ownerName });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create initiative" });
  }
});

// ---------- Get initiative detail ----------

router.get("/initiatives/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid initiative ID" });
    return;
  }

  try {
    const initiative = await getInitiativeWithProgress(id);
    if (!initiative) {
      res.status(404).json({ error: "Initiative not found" });
      return;
    }

    const milestones = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.initiativeId, id))
      .orderBy(milestonesTable.createdAt);

    const milestonesWithAttachments = await Promise.all(
      milestones.map(async (m) => {
        const attachments = await db
          .select({
            attachment: fileAttachmentsTable,
            uploaderFirstName: usersTable.firstName,
            uploaderLastName: usersTable.lastName,
          })
          .from(fileAttachmentsTable)
          .leftJoin(usersTable, eq(fileAttachmentsTable.uploadedById, usersTable.id))
          .where(eq(fileAttachmentsTable.milestoneId, m.id));

        const approver = m.approvedById
          ? await db
              .select()
              .from(usersTable)
              .where(eq(usersTable.id, m.approvedById))
              .then((r) => r[0])
          : null;

        return {
          ...m,
          weight: Number(m.weight),
          approvedByName: approver
            ? [approver.firstName, approver.lastName].filter(Boolean).join(" ")
            : null,
          attachments: attachments.map((a) => ({
            ...a.attachment,
            uploadedByName: [a.uploaderFirstName, a.uploaderLastName]
              .filter(Boolean)
              .join(" ") || null,
          })),
        };
      })
    );

    res.json({ ...initiative, milestones: milestonesWithAttachments });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get initiative" });
  }
});

// ---------- Update initiative ----------

const updateInitiativeSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "completed", "on_hold", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
  startDate: z.string().optional().nullable(),
  targetDate: z.string().optional().nullable(),
});

router.put("/initiatives/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid initiative ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  const role = req.user.role;
  if (role !== "admin" && existing.ownerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = updateInitiativeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [updated] = await db
      .update(initiativesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(initiativesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update initiative" });
  }
});

// ---------- Delete initiative ----------

router.delete("/initiatives/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid initiative ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  const role = req.user.role;
  if (role !== "admin" && existing.ownerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    await db.delete(initiativesTable).where(eq(initiativesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete initiative" });
  }
});

export default router;
