import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  boolean,
  jsonb,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─────────────────────────────────────────────
// PILLARS
// ─────────────────────────────────────────────
export const spmoPillarsTable = pgTable("spmo_pillars", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  weight: real("weight").notNull().default(0),
  color: text("color").notNull().default("#3B82F6"),
  iconName: text("icon_name").notNull().default("LayoutGrid"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoPillarSchema = createInsertSchema(spmoPillarsTable).omit(
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);
export type InsertSpmoPillar = z.infer<typeof insertSpmoPillarSchema>;
export type SpmoPillar = typeof spmoPillarsTable.$inferSelect;

// ─────────────────────────────────────────────
// INITIATIVES (Level 2: under a Pillar)
// ─────────────────────────────────────────────
export const spmoInitiativesTable = pgTable("spmo_initiatives", {
  id: serial("id").primaryKey(),
  pillarId: integer("pillar_id")
    .notNull()
    .references(() => spmoPillarsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name"),
  startDate: date("start_date").notNull(),
  targetDate: date("target_date").notNull(),
  weight: real("weight").notNull().default(0),
  budget: real("budget").notNull().default(0),
  status: text("status", {
    enum: ["active", "on_hold", "completed", "cancelled"],
  })
    .notNull()
    .default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoInitiativeSchema = createInsertSchema(
  spmoInitiativesTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoInitiative = z.infer<typeof insertSpmoInitiativeSchema>;
export type SpmoInitiative = typeof spmoInitiativesTable.$inferSelect;

// ─────────────────────────────────────────────
// DEPARTMENTS (cross-cutting ownership tag)
// ─────────────────────────────────────────────
export const spmoDepartmentsTable = pgTable("spmo_departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#3B82F6"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoDepartmentSchema = createInsertSchema(
  spmoDepartmentsTable
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpmoDepartment = z.infer<typeof insertSpmoDepartmentSchema>;
export type SpmoDepartment = typeof spmoDepartmentsTable.$inferSelect;

// ─────────────────────────────────────────────
// PROJECTS (Level 3: under an Initiative)
// ─────────────────────────────────────────────
export const spmoProjectsTable = pgTable("spmo_projects", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .notNull()
    .references(() => spmoInitiativesTable.id, { onDelete: "cascade" }),
  departmentId: integer("department_id")
    .references(() => spmoDepartmentsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name"),
  startDate: date("start_date").notNull(),
  targetDate: date("target_date").notNull(),
  weight: real("weight").notNull().default(0),
  budget: real("budget").notNull().default(0),
  budgetSpent: real("budget_spent").notNull().default(0),
  status: text("status", {
    enum: ["active", "on_hold", "completed", "cancelled"],
  })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoProjectSchema = createInsertSchema(
  spmoProjectsTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoProject = z.infer<typeof insertSpmoProjectSchema>;
export type SpmoProject = typeof spmoProjectsTable.$inferSelect;

// ─────────────────────────────────────────────
// MILESTONES (Level 4: under a Project)
// ─────────────────────────────────────────────
export const spmoMilestonesTable = pgTable("spmo_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  weight: real("weight").notNull().default(0),
  effortDays: real("effort_days"),
  progress: real("progress").notNull().default(0),
  status: text("status", {
    enum: ["pending", "in_progress", "submitted", "approved", "rejected"],
  })
    .notNull()
    .default("pending"),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedById: text("approved_by_id"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedById: text("rejected_by_id"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoMilestoneSchema = createInsertSchema(
  spmoMilestonesTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoMilestone = z.infer<typeof insertSpmoMilestoneSchema>;
export type SpmoMilestone = typeof spmoMilestonesTable.$inferSelect;

// ─────────────────────────────────────────────
// EVIDENCE (attached to a Milestone)
// ─────────────────────────────────────────────
export const spmoEvidenceTable = pgTable("spmo_evidence", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => spmoMilestonesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  objectPath: text("object_path").notNull(),
  uploadedById: text("uploaded_by_id").notNull(),
  uploadedByName: text("uploaded_by_name"),
  description: text("description"),
  aiValidated: boolean("ai_validated").notNull().default(false),
  aiScore: real("ai_score"),
  aiReasoning: text("ai_reasoning"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSpmoEvidenceSchema = createInsertSchema(
  spmoEvidenceTable
).omit({
  id: true,
  createdAt: true,
});
export type InsertSpmoEvidence = z.infer<typeof insertSpmoEvidenceSchema>;
export type SpmoEvidence = typeof spmoEvidenceTable.$inferSelect;

// ─────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────
export const spmoKpisTable = pgTable("spmo_kpis", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["strategic", "operational"] })
    .notNull()
    .default("strategic"),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit").notNull().default(""),
  baseline: real("baseline").notNull().default(0),
  target: real("target").notNull().default(0),
  actual: real("actual").notNull().default(0),
  projectId: integer("project_id"),
  pillarId: integer("pillar_id"),
  status: text("status", { enum: ["on_track", "at_risk", "off_track"] })
    .notNull()
    .default("on_track"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoKpiSchema = createInsertSchema(spmoKpisTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoKpi = z.infer<typeof insertSpmoKpiSchema>;
export type SpmoKpi = typeof spmoKpisTable.$inferSelect;

// ─────────────────────────────────────────────
// RISKS
// ─────────────────────────────────────────────
export const spmoRisksTable = pgTable("spmo_risks", {
  id: serial("id").primaryKey(),
  pillarId: integer("pillar_id"),
  projectId: integer("project_id"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  probability: text("probability", {
    enum: ["low", "medium", "high", "critical"],
  })
    .notNull()
    .default("medium"),
  impact: text("impact", {
    enum: ["low", "medium", "high", "critical"],
  })
    .notNull()
    .default("medium"),
  riskScore: integer("risk_score").notNull().default(4),
  owner: text("owner"),
  status: text("status", {
    enum: ["open", "mitigated", "accepted", "closed"],
  })
    .notNull()
    .default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoRiskSchema = createInsertSchema(spmoRisksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoRisk = z.infer<typeof insertSpmoRiskSchema>;
export type SpmoRisk = typeof spmoRisksTable.$inferSelect;

// ─────────────────────────────────────────────
// RISK MITIGATIONS
// ─────────────────────────────────────────────
export const spmoMitigationsTable = pgTable("spmo_mitigations", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id")
    .notNull()
    .references(() => spmoRisksTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: text("status", { enum: ["planned", "in_progress", "completed"] })
    .notNull()
    .default("planned"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSpmoMitigationSchema = createInsertSchema(
  spmoMitigationsTable
).omit({
  id: true,
  createdAt: true,
});
export type InsertSpmoMitigation = z.infer<typeof insertSpmoMitigationSchema>;
export type SpmoMitigation = typeof spmoMitigationsTable.$inferSelect;

// ─────────────────────────────────────────────
// BUDGET ENTRIES
// ─────────────────────────────────────────────
export const spmoBudgetTable = pgTable("spmo_budget_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  pillarId: integer("pillar_id"),
  category: text("category").notNull(),
  description: text("description"),
  allocated: real("allocated").notNull().default(0),
  spent: real("spent").notNull().default(0),
  currency: text("currency").notNull().default("SAR"),
  period: text("period").notNull(),
  fiscalYear: integer("fiscal_year"),
  fiscalQuarter: integer("fiscal_quarter"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoBudgetSchema = createInsertSchema(spmoBudgetTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoBudget = z.infer<typeof insertSpmoBudgetSchema>;
export type SpmoBudgetEntry = typeof spmoBudgetTable.$inferSelect;

// ─────────────────────────────────────────────
// PROCUREMENT
// ─────────────────────────────────────────────
export const spmoProcurementTable = pgTable("spmo_procurement", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
  title: text("title"),
  stage: text("stage", {
    enum: ["rfp_draft", "rfp_issued", "evaluation", "awarded", "completed"],
  })
    .notNull()
    .default("rfp_draft"),
  vendor: text("vendor"),
  contractValue: real("contract_value"),
  currency: text("currency").notNull().default("SAR"),
  notes: text("notes"),
  awardDate: date("award_date"),
  completionDate: date("completion_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoProcurementSchema = createInsertSchema(
  spmoProcurementTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoProcurement = z.infer<typeof insertSpmoProcurementSchema>;
export type SpmoProcurement = typeof spmoProcurementTable.$inferSelect;

// ─────────────────────────────────────────────
// PROGRAMME CONFIG (singleton row id=1)
// ─────────────────────────────────────────────
export const spmoProgrammeConfigTable = pgTable("spmo_programme_config", {
  id: integer("id").primaryKey().default(1),
  programmeName: text("programme_name").notNull().default("National Transformation Programme"),
  vision: text("vision"),
  mission: text("mission"),
  reportingCurrency: text("reporting_currency").notNull().default("SAR"),
  fiscalYearStart: integer("fiscal_year_start").notNull().default(1),
  projectAtRiskThreshold: integer("project_at_risk_threshold").notNull().default(5),
  projectDelayedThreshold: integer("project_delayed_threshold").notNull().default(10),
  milestoneAtRiskThreshold: integer("milestone_at_risk_threshold").notNull().default(5),
  weeklyResetDay: integer("weekly_reset_day").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSpmoProgrammeConfigSchema = createInsertSchema(
  spmoProgrammeConfigTable
).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoProgrammeConfig = z.infer<typeof insertSpmoProgrammeConfigSchema>;
export type SpmoProgrammeConfig = typeof spmoProgrammeConfigTable.$inferSelect;

// ─────────────────────────────────────────────
// ACTIVITY LOG
// ─────────────────────────────────────────────
export const spmoActivityLogTable = pgTable("spmo_activity_log", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name"),
  action: text("action", {
    enum: [
      "created",
      "updated",
      "deleted",
      "submitted",
      "approved",
      "rejected",
      "uploaded_evidence",
      "ran_ai_assessment",
    ],
  }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSpmoActivityLogSchema = createInsertSchema(
  spmoActivityLogTable
).omit({
  id: true,
  createdAt: true,
});
export type InsertSpmoActivityLog = z.infer<typeof insertSpmoActivityLogSchema>;
export type SpmoActivityLog = typeof spmoActivityLogTable.$inferSelect;

// ─────────────────────────────────────────────
// PROJECT WEEKLY REPORTS (reset on configured day)
// ─────────────────────────────────────────────
export const spmoProjectWeeklyReportsTable = pgTable(
  "spmo_project_weekly_reports",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    keyAchievements: text("key_achievements"),
    nextSteps: text("next_steps"),
    updatedById: text("updated_by_id"),
    updatedByName: text("updated_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uniq_project_week").on(t.projectId, t.weekStart)],
);

export const insertSpmoProjectWeeklyReportSchema = createInsertSchema(
  spmoProjectWeeklyReportsTable
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpmoProjectWeeklyReport = z.infer<typeof insertSpmoProjectWeeklyReportSchema>;
export type SpmoProjectWeeklyReport = typeof spmoProjectWeeklyReportsTable.$inferSelect;
