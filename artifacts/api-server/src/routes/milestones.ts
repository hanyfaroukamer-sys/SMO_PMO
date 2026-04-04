import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  milestonesTable,
  initiativesTable,
  fileAttachmentsTable,
  approvalsTable,
  uploadIntentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ---------- Helpers ----------

async function getMilestoneOrFail(id: number) {
  const [m] = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.id, id));
  return m ?? null;
}

async function getInitiativeOwner(initiativeId: number) {
  const [i] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, initiativeId));
  return i ?? null;
}

// ---------- List milestones for initiative ----------

router.get("/initiatives/:id/milestones", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const initiativeId = parseInt(req.params.id);
  if (isNaN(initiativeId)) {
    res.status(400).json({ error: "Invalid initiative ID" });
    return;
  }

  try {
    const milestones = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.initiativeId, initiativeId))
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

    res.json({ milestones: milestonesWithAttachments });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list milestones" });
  }
});

// ---------- Create milestone ----------

const createMilestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).default(10),
  dueDate: z.string().optional(),
});

router.post("/initiatives/:id/milestones", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const role = req.user.role;
  if (role !== "admin" && role !== "project-manager") {
    res.status(403).json({ error: "Only project managers and admins can create milestones" });
    return;
  }

  const initiativeId = parseInt(req.params.id);
  if (isNaN(initiativeId)) {
    res.status(400).json({ error: "Invalid initiative ID" });
    return;
  }

  const initiative = await getInitiativeOwner(initiativeId);
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  if (role !== "admin" && initiative.ownerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden — you are not the initiative owner" });
    return;
  }

  const parsed = createMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [created] = await db
      .insert(milestonesTable)
      .values({
        ...parsed.data,
        initiativeId,
        weight: Number(parsed.data.weight),
      })
      .returning();

    res.status(201).json({ ...created, weight: Number(created.weight) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create milestone" });
  }
});

// ---------- Update milestone ----------

const updateMilestoneSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).optional(),
  dueDate: z.string().optional().nullable(),
});

router.put("/milestones/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone ID" });
    return;
  }

  const milestone = await getMilestoneOrFail(id);
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const initiative = await getInitiativeOwner(milestone.initiativeId);
  const role = req.user.role;

  if (role !== "admin" && initiative?.ownerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = updateMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    if (parsed.data.weight !== undefined) {
      updateData.weight = String(parsed.data.weight);
    }

    const [updated] = await db
      .update(milestonesTable)
      .set(updateData)
      .where(eq(milestonesTable.id, id))
      .returning();

    res.json({ ...updated, weight: Number(updated.weight) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update milestone" });
  }
});

// ---------- Delete milestone ----------

router.delete("/milestones/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone ID" });
    return;
  }

  const milestone = await getMilestoneOrFail(id);
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const initiative = await getInitiativeOwner(milestone.initiativeId);
  const role = req.user.role;

  if (role !== "admin" && initiative?.ownerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    await db.delete(milestonesTable).where(eq(milestonesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete milestone" });
  }
});

// ---------- Submit milestone for approval ----------

router.post("/milestones/:id/submit", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone ID" });
    return;
  }

  const milestone = await getMilestoneOrFail(id);
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const initiative = await getInitiativeOwner(milestone.initiativeId);
  const role = req.user.role;

  if (role !== "admin" && initiative?.ownerId !== req.user.id) {
    res.status(403).json({ error: "Only the initiative owner can submit milestones for approval" });
    return;
  }

  if (milestone.status === "approved") {
    res.status(400).json({ error: "Milestone is already approved" });
    return;
  }

  // Guard: milestone must be at 100% progress before submitting
  if (((milestone as any).progress ?? 0) < 100) {
    res.status(400).json({ error: "Milestone progress must be 100% before submitting for approval" });
    return;
  }

  // Guard: at least one evidence file must be attached
  const evidenceCount = await db
    .select()
    .from(fileAttachmentsTable)
    .where(eq(fileAttachmentsTable.milestoneId, id));
  if (evidenceCount.length === 0) {
    res.status(400).json({ error: "At least one evidence file must be uploaded before submitting for approval" });
    return;
  }

  try {
    const [updated] = await db
      .update(milestonesTable)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(milestonesTable.id, id))
      .returning();

    res.json({ ...updated, weight: Number(updated.weight) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to submit milestone" });
  }
});

// ---------- Approve milestone ----------

router.post("/milestones/:id/approve", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const role = req.user.role;
  if (role !== "admin" && role !== "approver") {
    res.status(403).json({ error: "Only approvers and admins can approve milestones" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone ID" });
    return;
  }

  const milestone = await getMilestoneOrFail(id);
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  if (milestone.status !== "submitted" && role !== "admin") {
    res.status(400).json({ error: "Milestone must be submitted before approval" });
    return;
  }

  try {
    const [updated] = await db
      .update(milestonesTable)
      .set({
        status: "approved",
        approvedById: req.user.id,
        approvedAt: new Date(),
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(milestonesTable.id, id))
      .returning();

    await db.insert(approvalsTable).values({
      milestoneId: id,
      reviewerId: req.user.id,
      action: "approved",
    });

    const approverName = [req.user.firstName, req.user.lastName]
      .filter(Boolean)
      .join(" ") || null;

    res.json({
      ...updated,
      weight: Number(updated.weight),
      approvedByName: approverName,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to approve milestone" });
  }
});

// ---------- Reject milestone ----------

const approvalRequestSchema = z.object({
  comment: z.string().optional(),
});

router.post("/milestones/:id/reject", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const role = req.user.role;
  if (role !== "admin" && role !== "approver") {
    res.status(403).json({ error: "Only approvers and admins can reject milestones" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone ID" });
    return;
  }

  const milestone = await getMilestoneOrFail(id);
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  if (milestone.status !== "submitted" && role !== "admin") {
    res.status(400).json({ error: "Milestone must be submitted before rejection" });
    return;
  }

  const parsed = approvalRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [updated] = await db
      .update(milestonesTable)
      .set({
        status: "rejected",
        rejectionReason: parsed.data.comment ?? null,
        approvedById: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(milestonesTable.id, id))
      .returning();

    await db.insert(approvalsTable).values({
      milestoneId: id,
      reviewerId: req.user.id,
      action: "rejected",
      comment: parsed.data.comment ?? null,
    });

    res.json({ ...updated, weight: Number(updated.weight) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to reject milestone" });
  }
});

// ---------- Add attachment ----------

const addAttachmentSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().optional(),
  objectPath: z.string().min(1),
});

router.post("/milestones/:id/attachments", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone ID" });
    return;
  }

  const milestone = await getMilestoneOrFail(id);
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const initiative = await getInitiativeOwner(milestone.initiativeId);
  const role = req.user.role;

  if (role !== "admin" && initiative?.ownerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden — only the initiative owner or an admin can add attachments" });
    return;
  }

  const parsed = addAttachmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { objectPath } = parsed.data;

  const [intent] = await db
    .select()
    .from(uploadIntentsTable)
    .where(
      and(
        eq(uploadIntentsTable.objectPath, objectPath),
        eq(uploadIntentsTable.userId, req.user.id),
        eq(uploadIntentsTable.milestoneId, id),
        gt(uploadIntentsTable.expiresAt, new Date()),
      )
    );

  if (!intent) {
    res.status(400).json({ error: "Invalid or expired upload intent for the provided objectPath" });
    return;
  }

  if (intent.usedAt) {
    res.status(400).json({ error: "Upload intent has already been used" });
    return;
  }

  try {
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: req.user.id,
      visibility: "private",
    });

    await db
      .update(uploadIntentsTable)
      .set({ usedAt: new Date() })
      .where(eq(uploadIntentsTable.id, intent.id));

    const [created] = await db
      .insert(fileAttachmentsTable)
      .values({
        milestoneId: id,
        uploadedById: req.user.id,
        ...parsed.data,
      })
      .returning();

    const uploaderName = [req.user.firstName, req.user.lastName]
      .filter(Boolean)
      .join(" ") || null;

    res.status(201).json({ ...created, uploadedByName: uploaderName });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to add attachment — ensure the file was uploaded before recording it" });
  }
});

export default router;
