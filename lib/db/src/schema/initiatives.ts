import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  numeric,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const approvalActionEnum = pgEnum("approval_action", [
  "approved",
  "rejected",
]);

export const initiativeStatusEnum = pgEnum("initiative_status", [
  "draft",
  "active",
  "completed",
  "on_hold",
  "cancelled",
]);

export const priorityEnum = pgEnum("priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
]);

export const initiativesTable = pgTable("initiatives", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: initiativeStatusEnum("status").notNull().default("draft"),
  priority: priorityEnum("priority"),
  startDate: text("start_date"),
  targetDate: text("target_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .notNull()
    .references(() => initiativesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: milestoneStatusEnum("status").notNull().default("pending"),
  weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("10"),
  dueDate: text("due_date"),
  approvedById: text("approved_by_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const approvalsTable = pgTable("approvals", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestonesTable.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => usersTable.id),
  action: approvalActionEnum("action").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const uploadIntentsTable = pgTable("upload_intents", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestonesTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fileAttachmentsTable = pgTable("file_attachments", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestonesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  objectPath: text("object_path").notNull(),
  uploadedById: text("uploaded_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInitiativeSchema = createInsertSchema(initiativesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedById: true,
  approvedAt: true,
  rejectionReason: true,
});

export const insertFileAttachmentSchema = createInsertSchema(
  fileAttachmentsTable
).omit({ id: true, createdAt: true });

export const insertApprovalSchema = createInsertSchema(approvalsTable).omit({
  id: true,
  createdAt: true,
});

export type Initiative = typeof initiativesTable.$inferSelect;
export type InsertInitiative = z.infer<typeof insertInitiativeSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type FileAttachment = typeof fileAttachmentsTable.$inferSelect;
export type InsertFileAttachment = z.infer<typeof insertFileAttachmentSchema>;
export type Approval = typeof approvalsTable.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type UploadIntent = typeof uploadIntentsTable.$inferSelect;
