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
  index,
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
  pillarType: text("pillar_type", { enum: ["pillar", "enabler"] }).notNull().default("pillar"),
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
  initiativeCode: text("initiative_code").unique(),
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
}, (t) => [
  index("idx_initiatives_pillar_id").on(t.pillarId),
]);

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
  headName: text("head_name"),
  headEmail: text("head_email"),
  taskReminderCcUserId: text("task_reminder_cc_user_id"),
  taskReminderCcName: text("task_reminder_cc_name"),
  weeklyOverdueCcUserId: text("weekly_overdue_cc_user_id"),
  weeklyOverdueCcName: text("weekly_overdue_cc_name"),
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
  depStatus: text("dep_status", { enum: ["blocked", "ready"] }).notNull().default("ready"),
  projectCode: text("project_code").unique(),
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
  budgetCapex: real("budget_capex").notNull().default(0),
  budgetOpex: real("budget_opex").notNull().default(0),
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
}, (t) => [
  index("idx_projects_initiative_id").on(t.initiativeId),
  index("idx_projects_department_id").on(t.departmentId),
]);

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
  depStatus: text("dep_status", { enum: ["blocked", "ready"] }).notNull().default("ready"),
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
  phaseGate: text("phase_gate", { enum: ["planning", "tendering", "closure"] }),
  assigneeId: text("assignee_id"),
  assigneeName: text("assignee_name"),
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
}, (t) => [
  index("idx_milestones_project_id").on(t.projectId),
]);

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
}, (t) => [
  index("idx_evidence_milestone_id").on(t.milestoneId),
]);

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
  projectId: integer("project_id").references(() => spmoProjectsTable.id, { onDelete: "set null" }),
  pillarId: integer("pillar_id").references(() => spmoPillarsTable.id, { onDelete: "set null" }),
  initiativeId: integer("initiative_id").references(
    () => spmoInitiativesTable.id,
    { onDelete: "set null" }
  ),
  ownerId: text("owner_id"),
  ownerName: text("owner_name"),
  nextYearTarget: real("next_year_target"),
  target2030: real("target_2030"),
  status: text("status", { enum: ["exceeding", "on_track", "at_risk", "critical", "achieved", "not_started"] })
    .notNull()
    .default("on_track"),
  prevActual: real("prev_actual"),
  prevActualDt: date("prev_actual_dt"),
  kpiType: text("kpi_type", { enum: ["cumulative", "rate", "milestone", "reduction"] })
    .notNull()
    .default("rate"),
  direction: text("direction", { enum: ["higher", "lower"] })
    .notNull()
    .default("higher"),
  measurementPeriod: text("measurement_period", { enum: ["annual", "quarterly", "monthly"] })
    .notNull()
    .default("annual"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  milestoneDue: date("milestone_due"),
  milestoneDone: boolean("milestone_done").notNull().default(false),
  formula: text("formula"),
  targetRationale: text("target_rationale"),
  category: text("category"),
  measurementFrequency: text("measurement_frequency", { enum: ["annual", "quarterly", "monthly", "weekly"] }),
  target2026: real("target_2026"),
  target2027: real("target_2027"),
  target2028: real("target_2028"),
  target2029: real("target_2029"),
  actual2026: real("actual_2026"),
  actual2027: real("actual_2027"),
  actual2028: real("actual_2028"),
  actual2029: real("actual_2029"),
  actual2030: real("actual_2030"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("idx_kpis_pillar_id").on(t.pillarId),
  index("idx_kpis_project_id").on(t.projectId),
  index("idx_kpis_initiative_id").on(t.initiativeId),
]);

export const insertSpmoKpiSchema = createInsertSchema(spmoKpisTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpmoKpi = z.infer<typeof insertSpmoKpiSchema>;
export type SpmoKpi = typeof spmoKpisTable.$inferSelect;

// ─────────────────────────────────────────────
// KPI MEASUREMENT HISTORY
// ─────────────────────────────────────────────
export const spmoKpiMeasurementsTable = pgTable("spmo_kpi_measurements", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id")
    .notNull()
    .references(() => spmoKpisTable.id, { onDelete: "cascade" }),
  measuredAt: date("measured_at").notNull(),
  value: real("value").notNull(),
  notes: text("notes"),
  recordedById: text("recorded_by_id"),
  recordedByName: text("recorded_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("idx_kpi_measurements_kpi_id").on(t.kpiId),
]);

export const insertSpmoKpiMeasurementSchema = createInsertSchema(spmoKpiMeasurementsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSpmoKpiMeasurement = z.infer<typeof insertSpmoKpiMeasurementSchema>;
export type SpmoKpiMeasurement = typeof spmoKpiMeasurementsTable.$inferSelect;

// ─────────────────────────────────────────────
// RISKS
// ─────────────────────────────────────────────
export const spmoRisksTable = pgTable("spmo_risks", {
  id: serial("id").primaryKey(),
  pillarId: integer("pillar_id").references(() => spmoPillarsTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => spmoProjectsTable.id, { onDelete: "set null" }),
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
}, (t) => [
  index("idx_risks_pillar_id").on(t.pillarId),
  index("idx_risks_project_id").on(t.projectId),
]);

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
}, (t) => [
  index("idx_mitigations_risk_id").on(t.riskId),
]);

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
  projectId: integer("project_id").references(() => spmoProjectsTable.id, { onDelete: "set null" }),
  pillarId: integer("pillar_id").references(() => spmoPillarsTable.id, { onDelete: "set null" }),
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
}, (t) => [
  index("idx_budget_project_id").on(t.projectId),
  index("idx_budget_pillar_id").on(t.pillarId),
]);

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
}, (t) => [
  index("idx_procurement_project_id").on(t.projectId),
]);

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
  riskAlertThreshold: integer("risk_alert_threshold").notNull().default(9),
  reminderDaysAhead: integer("reminder_days_ahead").notNull().default(3),
  weeklyReportDeadlineHour: integer("weekly_report_deadline_hour").notNull().default(15),
  weeklyReportCcEmails: text("weekly_report_cc_emails"),
  weeklyResetDay: integer("weekly_reset_day").notNull().default(3),
  lastAiAssessment: jsonb("last_ai_assessment"),
  lastAiAssessmentAt: timestamp("last_ai_assessment_at", { withTimezone: true }),
  defaultPlanningWeight: real("default_planning_weight").notNull().default(5),
  defaultTenderingWeight: real("default_tendering_weight").notNull().default(5),
  defaultExecutionWeight: real("default_execution_weight").notNull().default(85),
  defaultClosureWeight: real("default_closure_weight").notNull().default(5),
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
      "weekly_report_submitted",
    ],
  }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("idx_activity_log_created_at").on(t.createdAt),
]);

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
  (t) => [
    unique("uniq_project_week").on(t.projectId, t.weekStart),
    index("idx_weekly_reports_project_id").on(t.projectId),
  ],
);

export const insertSpmoProjectWeeklyReportSchema = createInsertSchema(
  spmoProjectWeeklyReportsTable
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpmoProjectWeeklyReport = z.infer<typeof insertSpmoProjectWeeklyReportSchema>;
export type SpmoProjectWeeklyReport = typeof spmoProjectWeeklyReportsTable.$inferSelect;

// ─────────────────────────────────────────────
// CHANGE REQUESTS
// ─────────────────────────────────────────────
export const spmoChangeRequestsTable = pgTable("spmo_change_requests", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  changeType: text("change_type", {
    enum: ["scope", "budget", "timeline", "resource", "other"],
  }).notNull().default("other"),
  impact: text("impact"),
  requestedById: text("requested_by_id").notNull(),
  requestedByName: text("requested_by_name"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status", {
    enum: ["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"],
  }).notNull().default("draft"),
  reviewedById: text("reviewed_by_id"),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewComments: text("review_comments"),
  budgetImpact: real("budget_impact"),
  timelineImpact: integer("timeline_impact"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_change_requests_project_id").on(t.projectId),
]);

export const insertSpmoChangeRequestSchema = createInsertSchema(spmoChangeRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpmoChangeRequest = z.infer<typeof insertSpmoChangeRequestSchema>;
export type SpmoChangeRequest = typeof spmoChangeRequestsTable.$inferSelect;

// ─────────────────────────────────────────────
// RACI MATRIX
// ─────────────────────────────────────────────
export const spmoRaciTable = pgTable(
  "spmo_raci",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
    milestoneId: integer("milestone_id")
      .references(() => spmoMilestonesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name"),
    role: text("role", {
      enum: ["responsible", "accountable", "consulted", "informed"],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uniq_raci_ms_user").on(t.milestoneId, t.userId),
    index("idx_raci_project_id").on(t.projectId),
  ],
);

export const insertSpmoRaciSchema = createInsertSchema(spmoRaciTable).omit({ id: true, createdAt: true });
export type InsertSpmoRaci = z.infer<typeof insertSpmoRaciSchema>;
export type SpmoRaci = typeof spmoRaciTable.$inferSelect;

// ─────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────
export const spmoDocumentsTable = pgTable("spmo_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
  milestoneId: integer("milestone_id").references(() => spmoMilestonesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category", {
    enum: ["business_case", "charter", "plan", "report", "template", "contract", "other"],
  }).notNull().default("other"),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  objectPath: text("object_path").notNull(),
  version: integer("version").notNull().default(1),
  uploadedById: text("uploaded_by_id").notNull(),
  uploadedByName: text("uploaded_by_name"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_documents_project_id").on(t.projectId),
]);

export const insertSpmoDocumentSchema = createInsertSchema(spmoDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpmoDocument = z.infer<typeof insertSpmoDocumentSchema>;
export type SpmoDocument = typeof spmoDocumentsTable.$inferSelect;

// ─────────────────────────────────────────────
// ACTION ITEMS
// ─────────────────────────────────────────────
export const spmoActionsTable = pgTable("spmo_actions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
  milestoneId: integer("milestone_id").references(() => spmoMilestonesTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: text("assignee_id"),
  assigneeName: text("assignee_name"),
  dueDate: date("due_date"),
  priority: text("priority", {
    enum: ["low", "medium", "high", "urgent"],
  }).notNull().default("medium"),
  status: text("status", {
    enum: ["open", "in_progress", "done", "cancelled"],
  }).notNull().default("open"),
  createdById: text("created_by_id").notNull(),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_actions_project_id").on(t.projectId),
]);

export const insertSpmoActionSchema = createInsertSchema(spmoActionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpmoAction = z.infer<typeof insertSpmoActionSchema>;
export type SpmoAction = typeof spmoActionsTable.$inferSelect;

// ─────────────────────────────────────────────
// DEPENDENCIES (cross-project milestone/project dependencies)
// ─────────────────────────────────────────────
export const spmoDependenciesTable = pgTable(
  "spmo_dependencies",
  {
    id: serial("id").primaryKey(),
    sourceType: text("source_type", { enum: ["milestone", "project"] }).notNull(),
    sourceId: integer("source_id").notNull(),
    sourceThreshold: real("source_threshold").notNull().default(100),
    targetType: text("target_type", { enum: ["milestone", "project"] }).notNull(),
    targetId: integer("target_id").notNull(),
    depType: text("dep_type", { enum: ["ms-ms", "ms-proj", "proj-proj"] }).notNull(),
    lagDays: integer("lag_days").notNull().default(0),
    isHard: boolean("is_hard").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdById: text("created_by_id"),
  },
  (t) => [
    unique("uniq_dep_source_target").on(t.sourceType, t.sourceId, t.targetType, t.targetId),
    index("idx_dependencies_source_id").on(t.sourceId),
    index("idx_dependencies_target_id").on(t.targetId),
  ],
);

export const insertSpmoDependencySchema = createInsertSchema(spmoDependenciesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSpmoDependency = z.infer<typeof insertSpmoDependencySchema>;
export type SpmoDependency = typeof spmoDependenciesTable.$inferSelect;


// ─────────────────────────────────────────────
// PROJECT ACCESS GRANTS
// ─────────────────────────────────────────────
export const spmoProjectAccessTable = pgTable(
  "spmo_project_access",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => spmoProjectsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name"),
    userEmail: text("user_email"),
    grantedById: text("granted_by_id").notNull(),
    grantedByName: text("granted_by_name"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    // ── Fine-grained permission flags ──────────────────────────────────
    canEditDetails:          boolean("can_edit_details").notNull().default(true),
    canManageMilestones:     boolean("can_manage_milestones").notNull().default(true),
    canSubmitReports:        boolean("can_submit_reports").notNull().default(true),
    canManageRisks:          boolean("can_manage_risks").notNull().default(true),
    canManageBudget:         boolean("can_manage_budget").notNull().default(false),
    canManageDocuments:      boolean("can_manage_documents").notNull().default(true),
    canManageActions:        boolean("can_manage_actions").notNull().default(true),
    canManageRaci:           boolean("can_manage_raci").notNull().default(false),
    canSubmitChangeRequests: boolean("can_submit_change_requests").notNull().default(true),
  },
  (t) => [
    unique("uniq_project_access").on(t.projectId, t.userId),
    index("idx_project_access_project_id").on(t.projectId),
    index("idx_project_access_user_id").on(t.userId),
  ],
);

export type SpmoProjectAccess = typeof spmoProjectAccessTable.$inferSelect;
