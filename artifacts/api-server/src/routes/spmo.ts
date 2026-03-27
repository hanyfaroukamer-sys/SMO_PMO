import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc, and, asc, inArray, sql, ne, isNotNull, gte, lte } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { getCachedAssessment, setCachedAssessment, ASSESSMENT_CACHE_TTL_MS } from "../lib/assessment-cache";
import { db } from "@workspace/db";
import { recalculateDownstreamStatuses } from "../lib/dep-engine";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoEvidenceTable,
  spmoKpisTable,
  spmoRisksTable,
  spmoMitigationsTable,
  spmoBudgetTable,
  spmoProcurementTable,
  spmoProgrammeConfigTable,
  spmoActivityLogTable,
  spmoDepartmentsTable,
  spmoProjectWeeklyReportsTable,
  spmoChangeRequestsTable,
  spmoRaciTable,
  spmoDocumentsTable,
  spmoActionsTable,
  spmoKpiMeasurementsTable,
  spmoProjectAccessTable,
  spmoCommentsTable,
  spmoNotificationsTable,
  type InsertSpmoInitiative,
  type InsertSpmoProject,
  type InsertSpmoMilestone,
  type InsertSpmoMitigation,
  type InsertSpmoProcurement,
  type InsertSpmoDepartment,
} from "@workspace/db";
import { usersTable } from "@workspace/db";
import {
  CreateSpmoPillarBody,
  UpdateSpmoPillarBody,
  UpdateSpmoPillarParams,
  DeleteSpmoPillarParams,
  GetSpmoPillarParams,
  CreateSpmoInitiativeBody,
  UpdateSpmoInitiativeBody,
  UpdateSpmoInitiativeParams,
  DeleteSpmoInitiativeParams,
  GetSpmoInitiativeParams,
  ListSpmoInitiativesQueryParams,
  CreateSpmoProjectBody,
  UpdateSpmoProjectBody,
  UpdateSpmoProjectParams,
  DeleteSpmoProjectParams,
  GetSpmoProjectParams,
  ListSpmoProjectsQueryParams,
  ListSpmoMilestonesParams,
  CreateSpmoMilestoneParams,
  CreateSpmoMilestoneBody,
  UpdateSpmoMilestoneParams,
  UpdateSpmoMilestoneBody,
  DeleteSpmoMilestoneParams,
  SubmitSpmoMilestoneParams,
  ApproveSpmoMilestoneParams,
  ApproveSpmoMilestoneBody,
  RejectSpmoMilestoneParams,
  RejectSpmoMilestoneBody,
  AddSpmoEvidenceParams,
  AddSpmoEvidenceBody,
  DeleteSpmoEvidenceParams,
  CreateSpmoKpiBody,
  UpdateSpmoKpiParams,
  UpdateSpmoKpiBody,
  DeleteSpmoKpiParams,
  ListSpmoKpisQueryParams,
  CreateSpmoRiskBody,
  UpdateSpmoRiskParams,
  UpdateSpmoRiskBody,
  DeleteSpmoRiskParams,
  CreateSpmoMitigationParams,
  CreateSpmoMitigationBody,
  UpdateSpmoMitigationParams,
  UpdateSpmoMitigationBody,
  CreateSpmoBudgetEntryBody,
  UpdateSpmoBudgetEntryParams,
  UpdateSpmoBudgetEntryBody,
  DeleteSpmoBudgetEntryParams,
  ListSpmoBudgetQueryParams,
  ListSpmoActivityLogQueryParams,
  RunSpmoAiValidateEvidenceBody,
  ListSpmoProcurementQueryParams,
  CreateSpmoProcurementBody,
  UpdateSpmoProcurementParams,
  UpdateSpmoProcurementBody,
  DeleteSpmoProcurementParams,
  UpdateSpmoConfigBody,
  CreateSpmoDepartmentBody,
  UpdateSpmoDepartmentBody,
  UpdateSpmoDepartmentParams,
  DeleteSpmoDepartmentParams,
  GetSpmoDepartmentPortfolioParams,
  GetSpmoProjectWeeklyReportParams,
  UpsertSpmoProjectWeeklyReportParams,
  UpsertSpmoProjectWeeklyReportBody,
  UpdateSpmoUserRoleParams,
  UpdateSpmoUserRoleBody,
} from "@workspace/api-zod";
import {
  calcProgrammeProgress,
  pillarProgress,
  initiativeProgress,
  projectProgress,
  milestoneEffectiveProgress,
  computeRiskScore,
  computeStatus,
  computeInitiativeStatus,
  computeMilestoneHealth,
  type StatusResult,
} from "../lib/spmo-calc";
import { logSpmoActivity } from "../lib/spmo-activity";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getAuthUser(req: Parameters<Parameters<typeof router.get>[1]>[0]) {
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

function requireAdmin(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): boolean {
  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

function getCurrentWeekStart(resetDay: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysAgo = (todayDow - resetDay + 7) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysAgo);
  return weekStart.toISOString().split("T")[0];
}

function getUserDisplayName(user: ReturnType<typeof getAuthUser>): string | null {
  if (!user) return null;
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : user.email ?? null;
}

function requireAuth(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1]
): string | null {
  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user.id;
}

function requireRole(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  ...allowedRoles: string[]
): string | null {
  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (!user.role || !allowedRoles.includes(user.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return null;
  }
  return user.id;
}

type ProjectPermission =
  | "canEditDetails"
  | "canManageMilestones"
  | "canSubmitReports"
  | "canManageRisks"
  | "canManageBudget"
  | "canManageDocuments"
  | "canManageActions"
  | "canManageRaci"
  | "canSubmitChangeRequests";

const ALL_PERMISSIONS: ProjectPermission[] = [
  "canEditDetails",
  "canManageMilestones",
  "canSubmitReports",
  "canManageRisks",
  "canManageBudget",
  "canManageDocuments",
  "canManageActions",
  "canManageRaci",
  "canSubmitChangeRequests",
];

/** Returns true if the user has the given permission on this project. Admins always pass. PMs have full access to projects they own; for other projects they need an explicit grant row. */
async function checkProjectPerm(
  userId: string,
  userRole: string | null | undefined,
  projectId: number,
  permission: ProjectPermission,
): Promise<boolean> {
  if (userRole === "admin") return true;
  if (userRole !== "project-manager") return false;

  // Check if PM owns this project — owners have all permissions
  const [project] = await db.select({ ownerId: spmoProjectsTable.ownerId }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, projectId)).limit(1);
  if (project?.ownerId === userId) return true;

  // Not the owner — check explicit grant
  const [grant] = await db
    .select({
      canEditDetails:          spmoProjectAccessTable.canEditDetails,
      canManageMilestones:     spmoProjectAccessTable.canManageMilestones,
      canSubmitReports:        spmoProjectAccessTable.canSubmitReports,
      canManageRisks:          spmoProjectAccessTable.canManageRisks,
      canManageBudget:         spmoProjectAccessTable.canManageBudget,
      canManageDocuments:      spmoProjectAccessTable.canManageDocuments,
      canManageActions:        spmoProjectAccessTable.canManageActions,
      canManageRaci:           spmoProjectAccessTable.canManageRaci,
      canSubmitChangeRequests: spmoProjectAccessTable.canSubmitChangeRequests,
    })
    .from(spmoProjectAccessTable)
    .where(and(eq(spmoProjectAccessTable.projectId, projectId), eq(spmoProjectAccessTable.userId, userId)))
    .limit(1);
  // Non-owner PM with no explicit grant row — no access
  if (!grant) return false;
  return grant[permission] ?? false;
}

/** Backwards-compat alias — returns true if user has ANY edit access to this project */
async function canEditProject(userId: string, userRole: string | null | undefined, projectId: number): Promise<boolean> {
  if (userRole === "admin") return true;
  if (userRole !== "project-manager") return false;
  const [grant] = await db
    .select({ id: spmoProjectAccessTable.id })
    .from(spmoProjectAccessTable)
    .where(and(eq(spmoProjectAccessTable.projectId, projectId), eq(spmoProjectAccessTable.userId, userId)))
    .limit(1);
  return !!grant;
}

function parseId(req: { params: Record<string, string> }, res: any, paramName = "id"): number | null {
  const id = Number(req.params[paramName]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: `Invalid ${paramName}` });
    return null;
  }
  return id;
}

/** Convert a Date to an ISO date string (YYYY-MM-DD) for Drizzle date() columns */
function dateToStr(d: Date | undefined | null): string | undefined | null {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return d as undefined | null;
}

// ─────────────────────────────────────────────────────────────
// Phase Gate Helpers
// ─────────────────────────────────────────────────────────────

type ProjectPhase = "not_started" | "planning" | "tendering" | "execution" | "closure" | "completed";

function detectProjectPhase(milestones: Array<{ phaseGate: string | null; status: string; progress: number }>): ProjectPhase {
  const planning = milestones.find((m) => m.phaseGate === "planning");
  const tendering = milestones.find((m) => m.phaseGate === "tendering");
  const closure = milestones.find((m) => m.phaseGate === "closure");
  const executionMs = milestones.filter((m) => m.phaseGate === null);

  if (!planning || planning.progress === 0) return "not_started";
  if (planning.status !== "approved") return "planning";
  if (tendering && tendering.status !== "approved" && (tendering.progress > 0 || tendering.status !== "pending")) return "tendering";
  if (closure && closure.status === "approved") return "completed";
  const allExecApproved = executionMs.length > 0 && executionMs.every((m) => m.status === "approved");
  if (allExecApproved) return "closure";
  return "execution";
}

async function runPhaseGateMigration(): Promise<void> {
  try {
    const allProjects = await db.select().from(spmoProjectsTable);
    for (const project of allProjects) {
      const existingGates = await db.select({ id: spmoMilestonesTable.id })
        .from(spmoMilestonesTable)
        .where(and(eq(spmoMilestonesTable.projectId, project.id), isNotNull(spmoMilestonesTable.phaseGate)));
      if (existingGates.length > 0) continue;

      const existingMs = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, project.id));
      const totalWeight = existingMs.reduce((s, m) => s + (m.weight ?? 0), 0);
      if (totalWeight > 0) {
        for (const m of existingMs) {
          const newWeight = Math.round(((m.weight ?? 0) / totalWeight) * 85 * 10) / 10;
          await db.update(spmoMilestonesTable).set({ weight: newWeight }).where(eq(spmoMilestonesTable.id, m.id));
        }
      }
      await db.insert(spmoMilestonesTable).values([
        { projectId: project.id, name: "Planning & Requirements", description: "Define scope, requirements, stakeholders, project plan.", weight: 5, effortDays: 0, progress: 100, status: "approved", depStatus: "ready", phaseGate: "planning" },
        { projectId: project.id, name: "Tendering & Procurement", description: "Tender preparation, evaluation, contract award.", weight: 5, effortDays: 0, progress: project.status === "active" ? 100 : 0, status: project.status === "active" ? "approved" : "pending", depStatus: "ready", phaseGate: "tendering" },
        { projectId: project.id, name: "Closure & Handover", description: "Final acceptance, documentation, knowledge transfer.", weight: 5, effortDays: 0, progress: 0, status: "pending", depStatus: "ready", phaseGate: "closure" },
      ]);
    }
    // Migration is idempotent (skips projects with existing phase gates)
  } catch (err) {
    // Phase gate migration is best-effort; log but don't crash
    if (typeof req !== "undefined") {
      // This runs at module load, not in a request context
    }
  }
}

runPhaseGateMigration();

// ─────────────────────────────────────────────────────────────
// Programme Overview (cached 60 seconds)
// ─────────────────────────────────────────────────────────────
let _overviewCache: { data: unknown; ts: number } | null = null;
const OVERVIEW_CACHE_TTL = 60_000; // 60 seconds

router.get("/spmo/programme", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Return cached overview if fresh (avoids heavy calcProgrammeProgress on every dashboard load)
  if (_overviewCache && Date.now() - _overviewCache.ts < OVERVIEW_CACHE_TTL) {
    res.json(_overviewCache.data);
    return;
  }

  const { programmeProgress, pillarSummaries } = await calcProgrammeProgress();

  const allMilestones = await db.select().from(spmoMilestonesTable);
  const totalMilestones = allMilestones.length;
  const approvedMilestones = allMilestones.filter((m) => m.status === "approved").length;
  const pendingApprovals = allMilestones.filter((m) => m.status === "submitted").length;

  const activeRisks = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(spmoRisksTable)
    .where(eq(spmoRisksTable.status, "open"));

  const alertCount = await computeAlertCount();

  const [config] = await db.select().from(spmoProgrammeConfigTable).limit(1);
  const programmeName = config?.programmeName ?? "National Transformation Programme";
  const vision = config?.vision ?? null;
  const mission = config?.mission ?? null;

  const responseData = {
    programmeName,
    vision,
    mission,
    programmeProgress,
    lastUpdated: new Date(),
    pillarSummaries: pillarSummaries.map(({ pillar, progress, ...stats }) => ({
      id: pillar.id,
      name: pillar.name,
      description: pillar.description,
      pillarType: pillar.pillarType,
      weight: pillar.weight,
      color: pillar.color,
      iconName: pillar.iconName,
      sortOrder: pillar.sortOrder,
      createdAt: pillar.createdAt,
      updatedAt: pillar.updatedAt,
      progress,
      ...stats,
    })),
    totalMilestones,
    approvedMilestones,
    pendingApprovals,
    activeRisks: activeRisks[0]?.count ?? 0,
    alertCount,
  };

  _overviewCache = { data: responseData, ts: Date.now() };
  res.json(responseData);
});

// Invalidate overview cache on any write operation
function invalidateOverviewCache() { _overviewCache = null; }

// ─────────────────────────────────────────────────────────────
// Pillars
// ─────────────────────────────────────────────────────────────
router.get("/spmo/pillars", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const pillars = await db
    .select()
    .from(spmoPillarsTable)
    .orderBy(asc(spmoPillarsTable.sortOrder));

  const pillarsWithProgress = await Promise.all(
    pillars.map(async (p) => {
      const stats = await pillarProgress(p.id);
      return { ...p, ...stats };
    })
  );

  res.json({ pillars: pillarsWithProgress });
});

router.post("/spmo/pillars", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const parsed = CreateSpmoPillarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.weight !== undefined) {
    const allPillars = await db.select({ weight: spmoPillarsTable.weight }).from(spmoPillarsTable);
    const siblingSum = allPillars.reduce((s, p) => s + (p.weight ?? 0), 0);
    if (siblingSum + parsed.data.weight > 100) {
      res.status(400).json({ error: `Pillar weights cannot exceed 100%. Existing pillars total ${Math.round(siblingSum)}%, adding ${Math.round(parsed.data.weight)}% would reach ${Math.round(siblingSum + parsed.data.weight)}%.` });
      return;
    }
  }

  const [pillar] = await db.insert(spmoPillarsTable).values(parsed.data).returning();
  await logSpmoActivity(userId, getUserDisplayName(user), "created", "pillar", pillar.id, pillar.name);
  res.status(201).json(pillar);
});

router.get("/spmo/pillars/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetSpmoPillarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pillar] = await db
    .select()
    .from(spmoPillarsTable)
    .where(eq(spmoPillarsTable.id, params.data.id));

  if (!pillar) {
    res.status(404).json({ error: "Pillar not found" });
    return;
  }

  const stats = await pillarProgress(pillar.id);
  const initiatives = await db
    .select()
    .from(spmoInitiativesTable)
    .where(eq(spmoInitiativesTable.pillarId, pillar.id))
    .orderBy(asc(spmoInitiativesTable.sortOrder), asc(spmoInitiativesTable.createdAt));

  const initiativesWithProgress = await Promise.all(
    initiatives.map(async (i) => {
      const is = await initiativeProgress(i.id);
      return { ...i, ...is };
    })
  );

  res.json({ ...pillar, ...stats, initiatives: initiativesWithProgress });
});

router.put("/spmo/pillars/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const params = UpdateSpmoPillarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSpmoPillarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.weight !== undefined) {
    const allPillars = await db.select({ id: spmoPillarsTable.id, weight: spmoPillarsTable.weight }).from(spmoPillarsTable);
    const siblingSum = allPillars.filter(p => p.id !== params.data.id).reduce((s, p) => s + (p.weight ?? 0), 0);
    if (siblingSum + parsed.data.weight > 100) {
      res.status(400).json({ error: `Pillar weights cannot exceed 100%. Other pillars total ${Math.round(siblingSum)}%, this pillar at ${Math.round(parsed.data.weight)}% would reach ${Math.round(siblingSum + parsed.data.weight)}%.` });
      return;
    }
  }

  const [oldPillar] = await db.select().from(spmoPillarsTable).where(eq(spmoPillarsTable.id, params.data.id)).limit(1);

  const [pillar] = await db
    .update(spmoPillarsTable)
    .set(parsed.data)
    .where(eq(spmoPillarsTable.id, params.data.id))
    .returning();

  if (!pillar) {
    res.status(404).json({ error: "Pillar not found" });
    return;
  }

  const pillarChanges: Record<string, { from: unknown; to: unknown }> = {};
  if (oldPillar) {
    for (const f of ["name", "description", "pillarType", "weight", "color"] as const) {
      const ov = (oldPillar as Record<string, unknown>)[f];
      const nv = (pillar as Record<string, unknown>)[f];
      if (ov !== nv && nv !== undefined) pillarChanges[f] = { from: ov, to: nv };
    }
  }
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "pillar", pillar.id, pillar.name, {
    link: `/pillars/${pillar.id}/portfolio`, changes: pillarChanges,
  });
  res.json(pillar);
});

router.delete("/spmo/pillars/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const params = DeleteSpmoPillarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pillar] = await db
    .delete(spmoPillarsTable)
    .where(eq(spmoPillarsTable.id, params.data.id))
    .returning();

  if (!pillar) {
    res.status(404).json({ error: "Pillar not found" });
    return;
  }

  await logSpmoActivity(userId, getUserDisplayName(user), "deleted", "pillar", pillar.id, pillar.name);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Initiatives
// ─────────────────────────────────────────────────────────────
router.get("/spmo/initiatives", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const qp = ListSpmoInitiativesQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const query = db.select().from(spmoInitiativesTable);
  const rows = qp.data.pillarId
    ? await query.where(eq(spmoInitiativesTable.pillarId, qp.data.pillarId))
    : await query;

  const withProgress = await Promise.all(
    rows.map(async (i) => {
      const stats = await initiativeProgress(i.id);
      const computedStatus: StatusResult = computeInitiativeStatus(
        stats.progress,
        i.startDate,
        i.targetDate,
        i.budget,
        stats.budgetSpent,
        stats.rawProgress,
        stats.childProjects,
      );
      return { ...i, ...stats, computedStatus, healthStatus: computedStatus.status };
    })
  );

  res.json({ initiatives: withProgress });
});

router.post("/spmo/initiatives", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  const role = user?.role;
  if (role !== "admin" && role !== "project-manager") {
    res.status(403).json({ error: "Admin or project-manager role required" });
    return;
  }

  const parsed = CreateSpmoInitiativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insertInitiative: InsertSpmoInitiative = {
    ...parsed.data,
    startDate: dateToStr(parsed.data.startDate) as string,
    targetDate: dateToStr(parsed.data.targetDate) as string,
  };

  if (parsed.data.initiativeCode) {
    const [codeConflict] = await db.select({ id: spmoInitiativesTable.id }).from(spmoInitiativesTable).where(eq(spmoInitiativesTable.initiativeCode, parsed.data.initiativeCode)).limit(1);
    if (codeConflict) {
      res.status(409).json({ error: `Initiative code "${parsed.data.initiativeCode}" is already in use. Please choose a different code.` });
      return;
    }
  }

  if (parsed.data.weight !== undefined) {
    const siblings = await db.select({ weight: spmoInitiativesTable.weight }).from(spmoInitiativesTable).where(eq(spmoInitiativesTable.pillarId, insertInitiative.pillarId));
    const siblingSum = siblings.reduce((s, i) => s + (i.weight ?? 0), 0);
    if (siblingSum + parsed.data.weight > 100) {
      res.status(400).json({ error: `Initiative weights in this pillar cannot exceed 100%. Existing initiatives total ${Math.round(siblingSum)}%, adding ${Math.round(parsed.data.weight)}% would reach ${Math.round(siblingSum + parsed.data.weight)}%.` });
      return;
    }
  }

  const [initiative] = await db
    .insert(spmoInitiativesTable)
    .values(insertInitiative)
    .returning();

  await logSpmoActivity(userId, getUserDisplayName(user), "created", "initiative", initiative.id, initiative.name);
  res.status(201).json(initiative);
});

router.get("/spmo/initiatives/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetSpmoInitiativeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [initiative] = await db
    .select()
    .from(spmoInitiativesTable)
    .where(eq(spmoInitiativesTable.id, params.data.id));

  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  const stats = await initiativeProgress(initiative.id);
  const computedStatus: StatusResult = computeInitiativeStatus(
    stats.progress,
    initiative.startDate,
    initiative.targetDate,
    initiative.budget,
    stats.budgetSpent,
    stats.rawProgress,
    stats.childProjects,
  );
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.initiativeId, initiative.id));

  const projectsWithProgress = await Promise.all(
    projects.map(async (p) => {
      const ps = await projectProgress(p.id);
      const projStatus: StatusResult = computeStatus(ps.progress, p.startDate, p.targetDate, p.budget, p.budgetSpent, ps.rawProgress);
      return { ...p, ...ps, computedStatus: projStatus, healthStatus: projStatus.status };
    })
  );

  res.json({ ...initiative, ...stats, computedStatus, healthStatus: computedStatus.status, projects: projectsWithProgress });
});

router.put("/spmo/initiatives/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  const role = user?.role;
  if (role !== "admin" && role !== "project-manager") {
    res.status(403).json({ error: "Admin or project-manager role required" });
    return;
  }

  const params = UpdateSpmoInitiativeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSpmoInitiativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { startDate: sd, targetDate: td, ...restInitiativeUpdate } = parsed.data;
  const updateInitiative = {
    ...restInitiativeUpdate,
    ...(sd !== undefined && { startDate: dateToStr(sd) as string }),
    ...(td !== undefined && { targetDate: dateToStr(td) as string }),
  };

  const [oldInit] = await db.select().from(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, params.data.id)).limit(1);

  if (parsed.data.initiativeCode) {
    const [codeConflict] = await db.select({ id: spmoInitiativesTable.id }).from(spmoInitiativesTable).where(and(eq(spmoInitiativesTable.initiativeCode, parsed.data.initiativeCode), ne(spmoInitiativesTable.id, params.data.id))).limit(1);
    if (codeConflict) {
      res.status(409).json({ error: `Initiative code "${parsed.data.initiativeCode}" is already in use. Please choose a different code.` });
      return;
    }
  }

  if (parsed.data.weight !== undefined) {
    const existingInit = oldInit;
    if (existingInit) {
      const pillarId = parsed.data.pillarId ?? existingInit.pillarId;
      const siblings = await db.select({ id: spmoInitiativesTable.id, weight: spmoInitiativesTable.weight }).from(spmoInitiativesTable).where(eq(spmoInitiativesTable.pillarId, pillarId));
      const siblingSum = siblings.filter(i => i.id !== params.data.id).reduce((s, i) => s + (i.weight ?? 0), 0);
      if (siblingSum + parsed.data.weight > 100) {
        res.status(400).json({ error: `Initiative weights in this pillar cannot exceed 100%. Other initiatives total ${Math.round(siblingSum)}%, this initiative at ${Math.round(parsed.data.weight)}% would reach ${Math.round(siblingSum + parsed.data.weight)}%.` });
        return;
      }
    }
  }

  const [initiative] = await db
    .update(spmoInitiativesTable)
    .set(updateInitiative)
    .where(eq(spmoInitiativesTable.id, params.data.id))
    .returning();

  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  const initChanges: Record<string, { from: unknown; to: unknown }> = {};
  if (oldInit) {
    for (const f of ["name", "description", "status", "weight", "budget", "ownerName", "startDate", "targetDate", "initiativeCode"] as const) {
      const ov = (oldInit as Record<string, unknown>)[f];
      const nv = (initiative as Record<string, unknown>)[f];
      if (ov !== nv && nv !== undefined) initChanges[f] = { from: ov, to: nv };
    }
  }
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "initiative", initiative.id, initiative.name, {
    link: `/initiatives`, changes: initChanges,
  });
  res.json(initiative);
});

router.delete("/spmo/initiatives/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const params = DeleteSpmoInitiativeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [initiative] = await db
    .delete(spmoInitiativesTable)
    .where(eq(spmoInitiativesTable.id, params.data.id))
    .returning();

  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  await logSpmoActivity(userId, getUserDisplayName(user), "deleted", "initiative", initiative.id, initiative.name);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────
router.get("/spmo/projects", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const qp = ListSpmoProjectsQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const rows = qp.data.initiativeId
    ? await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, qp.data.initiativeId))
    : await db.select().from(spmoProjectsTable);

  const withProgress = await Promise.all(
    rows.map(async (p) => {
      const stats = await projectProgress(p.id);
      const computedStatus: StatusResult = computeStatus(
        stats.progress,
        p.startDate,
        p.targetDate,
        p.budget,
        p.budgetSpent,
        stats.rawProgress,
      );
      const pMilestones = await db.select({ phaseGate: spmoMilestonesTable.phaseGate, status: spmoMilestonesTable.status, progress: spmoMilestonesTable.progress }).from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, p.id));
      const currentPhase = detectProjectPhase(pMilestones);
      return { ...p, ...stats, computedStatus, healthStatus: computedStatus.status, currentPhase };
    })
  );

  res.json({ projects: withProgress });
});

router.post("/spmo/projects", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  const role = user?.role;
  if (role !== "admin" && role !== "project-manager") {
    res.status(403).json({ error: "Admin or project-manager role required" });
    return;
  }

  const parsed = CreateSpmoProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insertProject: InsertSpmoProject = {
    ...parsed.data,
    budget: parsed.data.budget ?? 0,
    startDate: dateToStr(parsed.data.startDate) as string,
    targetDate: dateToStr(parsed.data.targetDate) as string,
  };

  if (parsed.data.projectCode) {
    const [codeConflict] = await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable).where(eq(spmoProjectsTable.projectCode, parsed.data.projectCode)).limit(1);
    if (codeConflict) {
      res.status(409).json({ error: `Project code "${parsed.data.projectCode}" is already in use. Please choose a different code.` });
      return;
    }
  }

  if (parsed.data.weight !== undefined) {
    const siblings = await db.select({ weight: spmoProjectsTable.weight }).from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, insertProject.initiativeId));
    const siblingSum = siblings.reduce((s, p) => s + (p.weight ?? 0), 0);
    if (siblingSum + parsed.data.weight > 100) {
      res.status(400).json({ error: `Project weights in this initiative cannot exceed 100%. Existing projects total ${Math.round(siblingSum)}%, adding ${Math.round(parsed.data.weight)}% would reach ${Math.round(siblingSum + parsed.data.weight)}%.` });
      return;
    }
  }

  const [project] = await db
    .insert(spmoProjectsTable)
    .values(insertProject)
    .returning();

  const [cfg] = await db.select().from(spmoProgrammeConfigTable).limit(1);
  await db.insert(spmoMilestonesTable).values([
    { projectId: project.id, name: "Planning & Requirements", description: "Define scope, requirements, stakeholders, project plan. Obtain charter approval.", weight: cfg?.defaultPlanningWeight ?? 5, effortDays: 30, progress: 0, status: "pending", depStatus: "ready", phaseGate: "planning" },
    { projectId: project.id, name: "Tendering & Procurement", description: "Prepare RFP/RFQ, publish tender, evaluate proposals, award contract.", weight: cfg?.defaultTenderingWeight ?? 5, effortDays: 45, progress: 0, status: "pending", depStatus: "ready", phaseGate: "tendering" },
    { projectId: project.id, name: "Execution & Delivery", description: "Implementation, development, testing, UAT, and go-live. Split into detailed milestones.", weight: cfg?.defaultExecutionWeight ?? 85, effortDays: 120, progress: 0, status: "pending", depStatus: "ready", phaseGate: null },
    { projectId: project.id, name: "Closure & Handover", description: "Final acceptance, documentation, knowledge transfer, warranty activation, lessons learned.", weight: cfg?.defaultClosureWeight ?? 5, effortDays: 20, progress: 0, status: "pending", depStatus: "ready", phaseGate: "closure" },
  ]);

  await logSpmoActivity(userId, getUserDisplayName(user), "created", "project", project.id, project.name);
  res.status(201).json(project);
});

router.get("/spmo/projects/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetSpmoProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const stats = await projectProgress(project.id);
  const milestonesRaw = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.projectId, project.id))
    .orderBy(asc(spmoMilestonesTable.createdAt));

  const PHASE_ORDER: Record<string, number> = { planning: 0, tendering: 1, closure: 3 };
  const milestonesSorted = [...milestonesRaw].sort((a, b) => {
    const aOrder = a.phaseGate ? PHASE_ORDER[a.phaseGate] : 2;
    const bOrder = b.phaseGate ? PHASE_ORDER[b.phaseGate] : 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    // Stable sort: use ID as final tiebreaker (never changes on update)
    return a.id - b.id;
  });

  const milestonesWithEvidence = await Promise.all(
    milestonesSorted.map(async (m) => {
      const evidence = await db.select().from(spmoEvidenceTable).where(eq(spmoEvidenceTable.milestoneId, m.id));
      return { ...m, evidence };
    })
  );

  res.json({ ...project, ...stats, milestones: milestonesWithEvidence });
});

router.put("/spmo/projects/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = UpdateSpmoProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, params.data.id, "canEditDetails"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }

  const parsed = UpdateSpmoProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Fetch old record for audit diff
  const [oldProject] = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.id, params.data.id)).limit(1);

  const { startDate: psd, targetDate: ptd, ...restProjectUpdate } = parsed.data;
  const updateProject = {
    ...restProjectUpdate,
    ...(psd !== undefined && { startDate: dateToStr(psd) as string }),
    ...(ptd !== undefined && { targetDate: dateToStr(ptd) as string }),
  };

  if (parsed.data.projectCode) {
    const [codeConflict] = await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable).where(and(eq(spmoProjectsTable.projectCode, parsed.data.projectCode), ne(spmoProjectsTable.id, params.data.id))).limit(1);
    if (codeConflict) {
      res.status(409).json({ error: `Project code "${parsed.data.projectCode}" is already in use. Please choose a different code.` });
      return;
    }
  }

  if (parsed.data.weight !== undefined) {
    const [existingProject] = await db.select({ initiativeId: spmoProjectsTable.initiativeId }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, params.data.id));
    if (existingProject) {
      const initiativeId = existingProject.initiativeId;
      const siblings = await db.select({ id: spmoProjectsTable.id, weight: spmoProjectsTable.weight }).from(spmoProjectsTable).where(eq(spmoProjectsTable.initiativeId, initiativeId));
      const siblingSum = siblings.filter(p => p.id !== params.data.id).reduce((s, p) => s + (p.weight ?? 0), 0);
      if (siblingSum + parsed.data.weight > 100) {
        res.status(400).json({ error: `Project weights in this initiative cannot exceed 100%. Other projects total ${Math.round(siblingSum)}%, this project at ${Math.round(parsed.data.weight)}% would reach ${Math.round(siblingSum + parsed.data.weight)}%.` });
        return;
      }
    }
  }

  const [project] = await db
    .update(spmoProjectsTable)
    .set(updateProject)
    .where(eq(spmoProjectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Build audit details with before/after for changed fields
  const projectChanges: Record<string, { from: unknown; to: unknown }> = {};
  if (oldProject) {
    const trackFields = ["name", "status", "budget", "budgetCapex", "budgetOpex", "budgetSpent", "startDate", "targetDate", "ownerName", "projectCode", "weight", "departmentId"] as const;
    for (const f of trackFields) {
      const oldVal = (oldProject as Record<string, unknown>)[f];
      const newVal = (project as Record<string, unknown>)[f];
      if (oldVal !== newVal && newVal !== undefined) {
        projectChanges[f] = { from: oldVal, to: newVal };
      }
    }
  }
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "project", project.id, project.name, {
    projectId: project.id,
    projectCode: project.projectCode,
    link: `/projects/${project.id}`,
    changes: projectChanges,
  });
  res.json(project);
});

router.delete("/spmo/projects/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  const role = user?.role;
  if (role !== "admin" && role !== "project-manager") {
    res.status(403).json({ error: "Admin or project-manager role required" });
    return;
  }

  const params = DeleteSpmoProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .delete(spmoProjectsTable)
    .where(eq(spmoProjectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  await logSpmoActivity(userId, getUserDisplayName(user), "deleted", "project", project.id, project.name);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Milestones
// ─────────────────────────────────────────────────────────────
router.get("/spmo/projects/:id/milestones", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ListSpmoMilestonesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const milestones = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.projectId, params.data.id))
    .orderBy(asc(spmoMilestonesTable.createdAt));

  const PHASE_ORDER: Record<string, number> = { planning: 0, tendering: 1, closure: 3 };
  const sorted = [...milestones].sort((a, b) => {
    const aOrder = a.phaseGate ? PHASE_ORDER[a.phaseGate] : 2;
    const bOrder = b.phaseGate ? PHASE_ORDER[b.phaseGate] : 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const withEvidence = await Promise.all(
    sorted.map(async (m) => {
      const evidence = await db.select().from(spmoEvidenceTable).where(eq(spmoEvidenceTable.milestoneId, m.id));
      const healthStatus = computeMilestoneHealth(m.status, m.dueDate);
      return { ...m, evidence, healthStatus };
    })
  );

  res.json({ milestones: withEvidence });
});

router.post("/spmo/projects/:id/milestones", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = CreateSpmoMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, params.data.id, "canManageMilestones"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }

  const parsed = CreateSpmoMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const siblings = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.projectId, params.data.id));
  const siblingWeightSum = siblings.reduce((s, m) => s + (m.weight ?? 0), 0);
  if (siblingWeightSum + parsed.data.weight > 100) {
    res.status(400).json({ error: `Milestone weights would exceed 100% (siblings already use ${Math.round(siblingWeightSum)}%)` });
    return;
  }

  const insertMilestone: InsertSpmoMilestone = {
    ...parsed.data,
    projectId: params.data.id,
    startDate: parsed.data.startDate ? dateToStr(parsed.data.startDate) : undefined,
    dueDate: dateToStr(parsed.data.dueDate),
  };
  const [milestone] = await db
    .insert(spmoMilestonesTable)
    .values(insertMilestone)
    .returning();

  await logSpmoActivity(userId, getUserDisplayName(user), "created", "milestone", milestone.id, milestone.name);
  res.status(201).json(milestone);
});

// Lightweight milestone list for Gantt chart (single query, no N+1)
router.get("/spmo/milestones/list", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const milestones = await db.select({
    id: spmoMilestonesTable.id,
    projectId: spmoMilestonesTable.projectId,
    name: spmoMilestonesTable.name,
    startDate: spmoMilestonesTable.startDate,
    dueDate: spmoMilestonesTable.dueDate,
    status: spmoMilestonesTable.status,
    progress: spmoMilestonesTable.progress,
  }).from(spmoMilestonesTable);
  res.json({ milestones });
});

router.get("/spmo/milestones/all", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Batch load all data in 4 parallel queries (was: 4 queries PER milestone)
  const [allMilestones, allEvidence, allProjects, allInitiatives, allPillarsRaw] = await Promise.all([
    db.select().from(spmoMilestonesTable).orderBy(desc(spmoMilestonesTable.updatedAt)),
    db.select().from(spmoEvidenceTable),
    db.select().from(spmoProjectsTable),
    db.select().from(spmoInitiativesTable),
    db.select().from(spmoPillarsTable),
  ]);

  const evidenceByMilestone = new Map<number, typeof allEvidence>();
  for (const e of allEvidence) {
    const list = evidenceByMilestone.get(e.milestoneId) ?? [];
    list.push(e);
    evidenceByMilestone.set(e.milestoneId, list);
  }
  const projectMap = new Map(allProjects.map((p) => [p.id, p]));
  const initiativeMap = new Map(allInitiatives.map((i) => [i.id, i]));
  const pillarMap = new Map(allPillarsRaw.map((p) => [p.id, p]));

  const items = allMilestones.map((m) => {
    const project = projectMap.get(m.projectId);
    if (!project) return null;
    const initiative = initiativeMap.get(project.initiativeId);
    if (!initiative) return null;
    const pillar = pillarMap.get(initiative.pillarId);
    if (!pillar) return null;
    return { milestone: { ...m, evidence: evidenceByMilestone.get(m.id) ?? [] }, project, initiative, pillar };
  });

  res.json({ items: items.filter(Boolean) });
});

router.put("/spmo/milestones/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = UpdateSpmoMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Access check + fetch old record for audit diff
  const [oldMilestone] = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, params.data.id)).limit(1);
  if (!oldMilestone) { res.status(404).json({ error: "Milestone not found" }); return; }
  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, oldMilestone.projectId, "canManageMilestones"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }

  const parsed = UpdateSpmoMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // PMs can only update progress — weight, dates, name, description etc. require admin
  if (user?.role !== "admin") {
    const restrictedFields = ["weight", "name", "description", "dueDate", "startDate", "effortDays", "phaseGate", "assigneeName", "assigneeId", "status"] as const;
    const attempted = restrictedFields.filter((f) => (parsed.data as Record<string, unknown>)[f] !== undefined);
    if (attempted.length > 0) {
      res.status(403).json({ error: `Only admins can modify ${attempted.join(", ")}. Project managers can only update progress. Please raise a change request for other modifications.` });
      return;
    }
  }

  if (parsed.data.weight !== undefined) {
    // Only validate against siblings when the weight is actually changing
    if (parsed.data.weight !== oldMilestone.weight) {
      const siblings = await db
        .select()
        .from(spmoMilestonesTable)
        .where(
          and(
            eq(spmoMilestonesTable.projectId, oldMilestone.projectId),
            sql`${spmoMilestonesTable.id} != ${params.data.id}`
          )
        );
      const siblingWeightSum = siblings.reduce((s, m) => s + (m.weight ?? 0), 0);
      if (siblingWeightSum + parsed.data.weight > 100) {
        res.status(400).json({ error: `Milestone weights would exceed 100% (siblings use ${Math.round(siblingWeightSum)}%)` });
        return;
      }
    }
  }

  const { dueDate: mdd, startDate: msd, ...restMilestoneUpdate } = parsed.data;
  const updateMilestone = {
    ...restMilestoneUpdate,
    ...(msd !== undefined && { startDate: dateToStr(msd) }),
    ...(mdd !== undefined && { dueDate: dateToStr(mdd) }),
  };
  const [milestone] = await db
    .update(spmoMilestonesTable)
    .set(updateMilestone)
    .where(eq(spmoMilestonesTable.id, params.data.id))
    .returning();

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  // Build audit diff for milestone
  const msChanges: Record<string, { from: unknown; to: unknown }> = {};
  const msTrackFields = ["name", "progress", "status", "weight", "effortDays", "startDate", "dueDate", "assigneeName", "phaseGate", "description"] as const;
  for (const f of msTrackFields) {
    const oldVal = (oldMilestone as Record<string, unknown>)[f];
    const newVal = (milestone as Record<string, unknown>)[f];
    if (oldVal !== newVal && newVal !== undefined) {
      msChanges[f] = { from: oldVal, to: newVal };
    }
  }
  // Fetch project name for context
  const [msProject] = await db.select({ name: spmoProjectsTable.name, projectCode: spmoProjectsTable.projectCode }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, milestone.projectId)).limit(1);
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "milestone", milestone.id, milestone.name, {
    projectId: milestone.projectId,
    projectName: msProject?.name,
    projectCode: msProject?.projectCode,
    link: `/projects/${milestone.projectId}?tab=milestones`,
    changes: msChanges,
  });
  res.json(milestone);
});

router.delete("/spmo/milestones/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = DeleteSpmoMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, params.data.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Milestone not found" }); return; }

  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, existing.projectId, "canManageMilestones"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }

  if (existing.phaseGate) {
    res.status(403).json({ error: `Cannot delete mandatory phase gate "${existing.name}". Phase gates (Planning, Tendering, Closure) are required for programme reporting.` });
    return;
  }

  const [milestone] = await db
    .delete(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.id, params.data.id))
    .returning();

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  await logSpmoActivity(userId, getUserDisplayName(user), "deleted", "milestone", milestone.id, milestone.name);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// BULK MILESTONE WEIGHT UPDATE (atomic — bypasses per-row validation)
// ─────────────────────────────────────────────────────────────
router.put("/spmo/projects/:id/milestones/weights", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetSpmoProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid project id" }); return; }
  const projectId = params.data.id;

  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, projectId, "canManageMilestones"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }

  const body = z.object({
    weights: z.array(z.object({ id: z.number().int().positive(), weight: z.number().min(0).max(100) })),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid weights payload" }); return; }

  const { weights } = body.data;
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (Math.abs(total - 100) > 1) {
    res.status(400).json({ error: `Weights must sum to 100% (got ${Math.round(total)}%)` });
    return;
  }

  for (const { id, weight } of weights) {
    await db.update(spmoMilestonesTable)
      .set({ weight, updatedAt: new Date() })
      .where(and(eq(spmoMilestonesTable.id, id), eq(spmoMilestonesTable.projectId, projectId)));
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Approval Workflow
// ─────────────────────────────────────────────────────────────
router.post("/spmo/milestones/:id/submit", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = SubmitSpmoMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Status guard: only pending, in_progress, or rejected milestones can be submitted
  const [existing] = await db.select({ status: spmoMilestonesTable.status }).from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, params.data.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!["pending", "in_progress", "rejected"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot submit a milestone with status "${existing.status}". Only pending, in-progress, or rejected milestones can be submitted.` });
    return;
  }

  const evidence = await db
    .select()
    .from(spmoEvidenceTable)
    .where(eq(spmoEvidenceTable.milestoneId, params.data.id));

  if (evidence.length === 0) {
    res.status(400).json({ error: "At least one evidence file must be attached before submitting" });
    return;
  }

  const [milestone] = await db
    .update(spmoMilestonesTable)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(spmoMilestonesTable.id, params.data.id))
    .returning();

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "submitted", "milestone", milestone.id, milestone.name);
  res.json(milestone);
});

router.post("/spmo/milestones/:id/approve", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "approver");
  if (!userId) return;

  const params = ApproveSpmoMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Check milestone is in submitted status before approving
  const [existing] = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  if (existing.status !== "submitted") {
    res.status(400).json({ error: "Only submitted milestones can be approved" });
    return;
  }

  const [milestone] = await db
    .update(spmoMilestonesTable)
    .set({ status: "approved", approvedAt: new Date(), approvedById: userId })
    .where(eq(spmoMilestonesTable.id, params.data.id))
    .returning();

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "approved", "milestone", milestone.id, milestone.name);

  // Recalculate dep_status on all downstream dependencies
  await recalculateDownstreamStatuses(milestone.id);

  res.json(milestone);
});

router.post("/spmo/milestones/:id/reject", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "approver");
  if (!userId) return;

  const params = RejectSpmoMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RejectSpmoMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Status guard: only submitted milestones can be rejected
  const [existingForReject] = await db.select({ status: spmoMilestonesTable.status }).from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, params.data.id)).limit(1);
  if (!existingForReject) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (existingForReject.status !== "submitted") {
    res.status(400).json({ error: `Cannot reject a milestone with status "${existingForReject.status}". Only submitted milestones can be rejected.` });
    return;
  }

  const [milestone] = await db
    .update(spmoMilestonesTable)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedById: userId,
      rejectionReason: parsed.data.reason ?? null,
    })
    .where(eq(spmoMilestonesTable.id, params.data.id))
    .returning();

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "rejected", "milestone", milestone.id, milestone.name, { reason: parsed.data.reason });
  res.json(milestone);
});

// ─────────────────────────────────────────────────────────────
// Evidence uploads
// ─────────────────────────────────────────────────────────────
router.post("/spmo/uploads/request-url", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = z.object({ milestoneId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "milestoneId is required" });
    return;
  }

  const [milestone] = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.id, parsed.data.milestoneId));

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (err) {
    req.log.error({ err }, "Error generating SPMO upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/spmo/milestones/:id/evidence", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);

  const params = AddSpmoEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddSpmoEvidenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [evidence] = await db
    .insert(spmoEvidenceTable)
    .values({
      milestoneId: params.data.id,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType ?? null,
      objectPath: parsed.data.objectPath,
      uploadedById: userId,
      uploadedByName: getUserDisplayName(user),
      description: parsed.data.description ?? null,
    })
    .returning();

  const [milestone] = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.id, params.data.id));

  await logSpmoActivity(
    userId,
    getUserDisplayName(user),
    "uploaded_evidence",
    "milestone",
    params.data.id,
    milestone?.name ?? "milestone",
    { evidenceId: evidence.id, fileName: evidence.fileName }
  );

  res.status(201).json(evidence);
});

router.delete("/spmo/evidence/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = DeleteSpmoEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [evidence] = await db
    .delete(spmoEvidenceTable)
    .where(eq(spmoEvidenceTable.id, params.data.id))
    .returning();

  if (!evidence) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Pending Approvals
// ─────────────────────────────────────────────────────────────
router.get("/spmo/pending-approvals", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const submittedMilestones = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.status, "submitted"))
    .orderBy(desc(spmoMilestonesTable.submittedAt));

  const items = await Promise.all(
    submittedMilestones.map(async (m) => {
      const evidence = await db.select().from(spmoEvidenceTable).where(eq(spmoEvidenceTable.milestoneId, m.id));

      const [project] = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.id, m.projectId));
      if (!project) return null;

      const [initiative] = await db
        .select()
        .from(spmoInitiativesTable)
        .where(eq(spmoInitiativesTable.id, project.initiativeId));
      if (!initiative) return null;

      const [pillar] = await db
        .select()
        .from(spmoPillarsTable)
        .where(eq(spmoPillarsTable.id, initiative.pillarId));
      if (!pillar) return null;

      return {
        milestone: { ...m, evidence },
        project,
        initiative,
        pillar,
      };
    })
  );

  res.json({ items: items.filter(Boolean) });
});

// ─────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────
router.get("/spmo/kpis", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
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
  const userId = requireRole(req, res, "admin", "project-manager");
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
  const userId = requireRole(req, res, "admin", "project-manager");
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
  const userId = requireRole(req, res, "admin", "project-manager");
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
// Risks
// ─────────────────────────────────────────────────────────────
router.get("/spmo/risks", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const risks = await db
    .select()
    .from(spmoRisksTable)
    .orderBy(desc(spmoRisksTable.riskScore));

  const withMitigations = await Promise.all(
    risks.map(async (r) => {
      const mitigations = await db
        .select()
        .from(spmoMitigationsTable)
        .where(eq(spmoMitigationsTable.riskId, r.id));
      return { ...r, mitigations };
    })
  );

  res.json({ risks: withMitigations });
});

router.post("/spmo/risks", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const parsed = CreateSpmoRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, parsed.data.projectId, "canManageRisks"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }

  const riskScore = computeRiskScore(parsed.data.probability, parsed.data.impact);

  const [risk] = await db
    .insert(spmoRisksTable)
    .values({ ...parsed.data, riskScore })
    .returning();

  await logSpmoActivity(userId, getUserDisplayName(user), "created", "risk", risk.id, risk.title);
  res.status(201).json(risk);
});

router.put("/spmo/risks/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = UpdateSpmoRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSpmoRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Check per-project permission
  const [existingRisk] = await db.select().from(spmoRisksTable).where(eq(spmoRisksTable.id, params.data.id));
  if (!existingRisk) { res.status(404).json({ error: "Risk not found" }); return; }
  const user = getAuthUser(req);
  if (existingRisk.projectId && !(await checkProjectPerm(userId, user?.role, existingRisk.projectId, "canManageRisks"))) {
    res.status(403).json({ error: "You do not have permission to manage risks on this project" });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.probability || parsed.data.impact) {
    const prob = parsed.data.probability ?? existingRisk.probability;
    const imp = parsed.data.impact ?? existingRisk.impact;
    updateData.riskScore = computeRiskScore(prob, imp);
  }

  const [risk] = await db
    .update(spmoRisksTable)
    .set(updateData)
    .where(eq(spmoRisksTable.id, params.data.id))
    .returning();

  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "risk", risk.id, risk.title);
  res.json(risk);
});

router.delete("/spmo/risks/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = DeleteSpmoRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Check per-project permission
  const [existingRisk] = await db.select({ projectId: spmoRisksTable.projectId }).from(spmoRisksTable).where(eq(spmoRisksTable.id, params.data.id)).limit(1);
  if (!existingRisk) { res.status(404).json({ error: "Risk not found" }); return; }
  const user = getAuthUser(req);
  if (existingRisk.projectId && !(await checkProjectPerm(userId, user?.role, existingRisk.projectId, "canManageRisks"))) {
    res.status(403).json({ error: "You do not have permission to manage risks on this project" });
    return;
  }

  await db.delete(spmoRisksTable).where(eq(spmoRisksTable.id, params.data.id));
  res.json({ success: true });
});

router.post("/spmo/risks/:id/mitigations", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = CreateSpmoMitigationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Check per-project permission via the parent risk
  const [parentRisk] = await db.select({ projectId: spmoRisksTable.projectId }).from(spmoRisksTable).where(eq(spmoRisksTable.id, params.data.id)).limit(1);
  if (!parentRisk) { res.status(404).json({ error: "Risk not found" }); return; }
  const user = getAuthUser(req);
  if (parentRisk.projectId && !(await checkProjectPerm(userId, user?.role, parentRisk.projectId, "canManageRisks"))) {
    res.status(403).json({ error: "You do not have permission to manage risks on this project" });
    return;
  }

  const parsed = CreateSpmoMitigationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { dueDate: mitigationDd, ...restMitigation } = parsed.data;
  const insertMitigation: InsertSpmoMitigation = {
    ...restMitigation,
    riskId: params.data.id,
    ...(mitigationDd !== undefined && { dueDate: dateToStr(mitigationDd) }),
  };
  const [mitigation] = await db
    .insert(spmoMitigationsTable)
    .values(insertMitigation)
    .returning();

  res.status(201).json(mitigation);
});

router.put("/spmo/mitigations/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = UpdateSpmoMitigationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Check per-project permission via mitigation → risk → project
  const [mitForAccess] = await db.select({ riskId: spmoMitigationsTable.riskId }).from(spmoMitigationsTable).where(eq(spmoMitigationsTable.id, params.data.id)).limit(1);
  if (mitForAccess) {
    const [risk] = await db.select({ projectId: spmoRisksTable.projectId }).from(spmoRisksTable).where(eq(spmoRisksTable.id, mitForAccess.riskId)).limit(1);
    const user = getAuthUser(req);
    if (risk?.projectId && !(await checkProjectPerm(userId, user?.role, risk.projectId, "canManageRisks"))) {
      res.status(403).json({ error: "You do not have permission to manage risks on this project" });
      return;
    }
  }

  const parsed = UpdateSpmoMitigationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { dueDate: mitigationUpdDd, ...restMitigationUpdate } = parsed.data;
  const [mitigation] = await db
    .update(spmoMitigationsTable)
    .set({
      ...restMitigationUpdate,
      ...(mitigationUpdDd !== undefined && { dueDate: dateToStr(mitigationUpdDd) }),
    })
    .where(eq(spmoMitigationsTable.id, params.data.id))
    .returning();

  if (!mitigation) {
    res.status(404).json({ error: "Mitigation not found" });
    return;
  }

  res.json(mitigation);
});

// ─────────────────────────────────────────────────────────────
// Budget
// ─────────────────────────────────────────────────────────────
router.get("/spmo/budget", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const qp = ListSpmoBudgetQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  // Always compute authoritative totals from projects (bottom-up)
  let projectsQ = db
    .select({
      budget: spmoProjectsTable.budget,
      budgetCapex: spmoProjectsTable.budgetCapex,
      budgetOpex: spmoProjectsTable.budgetOpex,
      budgetSpent: spmoProjectsTable.budgetSpent,
      initiativeId: spmoProjectsTable.initiativeId,
    })
    .from(spmoProjectsTable);

  const allProjects = await projectsQ;

  // Apply filters when provided
  let filteredProjects = allProjects;
  if (qp.data.projectId) {
    // single-project view: fall back to budget entries
    let entries = await db.select().from(spmoBudgetTable).orderBy(asc(spmoBudgetTable.period));
    entries = entries.filter((e) => e.projectId === qp.data.projectId);
    const totalAllocated = entries.reduce((s, e) => s + e.allocated, 0);
    const totalSpent = entries.reduce((s, e) => s + e.spent, 0);
    const utilizationPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 1000) / 10 : 0;
    res.json({ totalAllocated, totalSpent, utilizationPct, entries });
    return;
  }

  if (qp.data.pillarId) {
    // Resolve initiative IDs belonging to this pillar
    const pillarInitiatives = await db
      .select({ id: spmoInitiativesTable.id })
      .from(spmoInitiativesTable)
      .where(eq(spmoInitiativesTable.pillarId, qp.data.pillarId));
    const iniIds = new Set(pillarInitiatives.map((i) => i.id));
    filteredProjects = allProjects.filter((p) => p.initiativeId !== null && iniIds.has(p.initiativeId));
  }

  const totalAllocated = filteredProjects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalCapex    = filteredProjects.reduce((s, p) => s + (p.budgetCapex ?? 0), 0);
  const totalOpex     = filteredProjects.reduce((s, p) => s + (p.budgetOpex ?? 0), 0);
  const totalSpent    = filteredProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
  const utilizationPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 1000) / 10 : 0;

  // Also fetch manual entries for the detailed entries tab
  let entries = await db.select().from(spmoBudgetTable).orderBy(asc(spmoBudgetTable.period));
  if (qp.data.pillarId) {
    entries = entries.filter((e) => e.pillarId === qp.data.pillarId);
  }

  res.json({ totalAllocated, totalCapex, totalOpex, totalSpent, utilizationPct, entries });
});

router.post("/spmo/budget", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const parsed = CreateSpmoBudgetEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, parsed.data.projectId, "canManageBudget"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }

  const [entry] = await db.insert(spmoBudgetTable).values(parsed.data).returning();
  res.status(201).json(entry);
});

router.put("/spmo/budget/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = UpdateSpmoBudgetEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSpmoBudgetEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db
    .update(spmoBudgetTable)
    .set(parsed.data)
    .where(eq(spmoBudgetTable.id, params.data.id))
    .returning();

  if (!entry) {
    res.status(404).json({ error: "Budget entry not found" });
    return;
  }

  res.json(entry);
});

router.delete("/spmo/budget/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = DeleteSpmoBudgetEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [entry] = await db.delete(spmoBudgetTable).where(eq(spmoBudgetTable.id, params.data.id)).returning();
  if (!entry) {
    res.status(404).json({ error: "Budget entry not found" });
    return;
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Alerts (computed from programme state)
// ─────────────────────────────────────────────────────────────
async function computeAlertCount(): Promise<number> {
  const milestones = await db.select().from(spmoMilestonesTable);
  const risks = await db.select().from(spmoRisksTable).where(eq(spmoRisksTable.status, "open"));
  const kpis = await db.select().from(spmoKpisTable);

  let count = 0;
  const now = new Date();

  for (const m of milestones) {
    if (m.dueDate && new Date(m.dueDate) < now && m.status !== "approved") count++;
    if (m.status === "submitted") count++;
  }
  for (const r of risks) {
    if (r.riskScore >= 9) count++;
  }
  for (const k of kpis) {
    if (k.status === "critical" || k.status === "at_risk") count++;
  }

  return count;
}

router.get("/spmo/alerts", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const alerts: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    category: "progress" | "approval" | "budget" | "risk" | "deadline" | "kpi";
    title: string;
    description: string;
    entityType: "programme" | "pillar" | "initiative" | "project" | "milestone" | "kpi" | "risk";
    entityId: number | null;
    entityName: string;
    projectId?: number | null;
    createdAt: Date;
  }> = [];

  const now = new Date();
  const milestones = await db.select().from(spmoMilestonesTable);

  for (const m of milestones) {
    if (m.status === "submitted") {
      alerts.push({
        id: `approval-${m.id}`,
        severity: "warning",
        category: "approval",
        title: "Milestone Awaiting Approval",
        description: `"${m.name}" has been submitted and is awaiting review.`,
        entityType: "milestone",
        entityId: m.id,
        entityName: m.name,
        projectId: m.projectId,
        createdAt: m.submittedAt ?? now,
      });
    }
    if (m.dueDate && new Date(m.dueDate) < now && m.status !== "approved") {
      const isOverdue = m.status !== "submitted";
      alerts.push({
        id: `deadline-${m.id}`,
        severity: isOverdue ? "critical" : "warning",
        category: "deadline",
        title: "Milestone Past Due Date",
        description: `"${m.name}" was due on ${m.dueDate} and has not been approved.`,
        entityType: "milestone",
        entityId: m.id,
        entityName: m.name,
        projectId: m.projectId,
        createdAt: new Date(m.dueDate),
      });
    }
    if (m.progress < 25 && m.status === "in_progress") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (m.updatedAt < weekAgo) {
        alerts.push({
          id: `progress-${m.id}`,
          severity: "info",
          category: "progress",
          title: "Low Progress Milestone",
          description: `"${m.name}" has low progress (${m.progress}%) and hasn't been updated recently.`,
          entityType: "milestone",
          entityId: m.id,
          entityName: m.name,
          projectId: m.projectId,
          createdAt: m.updatedAt,
        });
      }
    }
  }

  const risks = await db.select().from(spmoRisksTable).where(eq(spmoRisksTable.status, "open"));
  for (const r of risks) {
    if (r.riskScore >= 12) {
      alerts.push({
        id: `risk-${r.id}`,
        severity: "critical",
        category: "risk",
        title: "Critical Risk Open",
        description: `Risk "${r.title}" has a critical score of ${r.riskScore} and no mitigation.`,
        entityType: "risk",
        entityId: r.id,
        entityName: r.title,
        createdAt: r.createdAt,
      });
    } else if (r.riskScore >= 9) {
      alerts.push({
        id: `risk-${r.id}`,
        severity: "warning",
        category: "risk",
        title: "High Risk Open",
        description: `Risk "${r.title}" has a high score of ${r.riskScore} and needs attention.`,
        entityType: "risk",
        entityId: r.id,
        entityName: r.title,
        createdAt: r.createdAt,
      });
    }
  }

  const kpis = await db.select().from(spmoKpisTable);
  for (const k of kpis) {
    if (k.status === "critical") {
      alerts.push({
        id: `kpi-${k.id}`,
        severity: "critical",
        category: "kpi",
        title: "KPI Off Track",
        description: `KPI "${k.name}" is off track (${k.actual} ${k.unit} vs target ${k.target} ${k.unit}).`,
        entityType: "kpi",
        entityId: k.id,
        entityName: k.name,
        createdAt: k.updatedAt,
      });
    } else if (k.status === "at_risk") {
      alerts.push({
        id: `kpi-${k.id}`,
        severity: "warning",
        category: "kpi",
        title: "KPI At Risk",
        description: `KPI "${k.name}" is at risk (${k.actual} ${k.unit} vs target ${k.target} ${k.unit}).`,
        entityType: "kpi",
        entityId: k.id,
        entityName: k.name,
        createdAt: k.updatedAt,
      });
    }
  }

  // Budget alerts
  const budgetEntries = await db.select().from(spmoBudgetTable);
  const totalAllocated = budgetEntries.reduce((s, e) => s + e.allocated, 0);
  const totalSpent = budgetEntries.reduce((s, e) => s + e.spent, 0);
  if (totalAllocated > 0) {
    const utilPct = totalSpent / totalAllocated;
    if (utilPct > 0.9) {
      alerts.push({
        id: "budget-overall",
        severity: "critical",
        category: "budget",
        title: "Budget Critically Overrun",
        description: `Programme has consumed ${Math.round(utilPct * 100)}% of total budget.`,
        entityType: "programme",
        entityId: null,
        entityName: "Programme Budget",
        createdAt: now,
      });
    } else if (utilPct > 0.75) {
      alerts.push({
        id: "budget-overall",
        severity: "warning",
        category: "budget",
        title: "Budget Utilization High",
        description: `Programme has consumed ${Math.round(utilPct * 100)}% of total budget.`,
        entityType: "programme",
        entityId: null,
        entityName: "Programme Budget",
        createdAt: now,
      });
    }
  }

  // Sort by severity then date
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => {
    const sA = severityOrder[a.severity] ?? 2;
    const sB = severityOrder[b.severity] ?? 2;
    if (sA !== sB) return sA - sB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  res.json({ alerts });
});

// ─────────────────────────────────────────────────────────────
// Activity Log
// ─────────────────────────────────────────────────────────────
router.get("/spmo/activity-log", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const qp = ListSpmoActivityLogQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const limit = qp.data.limit ?? 50;
  const offset = qp.data.offset ?? 0;
  const from = qp.data.from ? new Date(qp.data.from) : null;
  const to = qp.data.to ? new Date(qp.data.to) : null;
  const entityTypeFilter = qp.data.entityType ?? null;
  const actionFilter = qp.data.action ?? null;

  const conditions = [];
  if (from) conditions.push(gte(spmoActivityLogTable.createdAt, from));
  if (to) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(spmoActivityLogTable.createdAt, toEnd));
  }
  if (entityTypeFilter) conditions.push(eq(spmoActivityLogTable.entityType, entityTypeFilter));
  if (actionFilter) conditions.push(eq(spmoActivityLogTable.action, actionFilter as "created" | "updated" | "deleted" | "submitted" | "approved" | "rejected" | "uploaded_evidence" | "ran_ai_assessment" | "weekly_report_submitted"));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(spmoActivityLogTable)
    .where(whereClause);

  const entries = await db
    .select()
    .from(spmoActivityLogTable)
    .where(whereClause)
    .orderBy(desc(spmoActivityLogTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ entries, total: totalRow?.count ?? 0 });
});

// ─────────────────────────────────────────────────────────────
// AI: Programme Assessment
// ─────────────────────────────────────────────────────────────

router.post("/spmo/ai/assessment", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Use cache if fresh
  const cachedAssessment = await getCachedAssessment();
  if (cachedAssessment && Date.now() - cachedAssessment.cachedAt.getTime() < ASSESSMENT_CACHE_TTL_MS) {
    res.json(cachedAssessment.result);
    return;
  }

  const { programmeProgress, pillarSummaries } = await calcProgrammeProgress();
  const allMilestones = await db.select().from(spmoMilestonesTable);
  const openRisks = await db.select().from(spmoRisksTable).where(eq(spmoRisksTable.status, "open"));
  const offTrackKpis = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.status, "critical"));

  const context = {
    programmeProgress,
    pillars: pillarSummaries.map(({ pillar, progress, ...s }) => ({
      name: pillar.name,
      progress,
      ...s,
    })),
    totalMilestones: allMilestones.length,
    approvedMilestones: allMilestones.filter((m) => m.status === "approved").length,
    pendingApprovals: allMilestones.filter((m) => m.status === "submitted").length,
    openRisks: openRisks.length,
    highRisks: openRisks.filter((r) => r.riskScore >= 9).length,
    offTrackKpis: offTrackKpis.length,
  };

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `You are a senior programme management advisor. Analyze this government programme data and produce a structured health assessment.

Programme Data:
${JSON.stringify(context, null, 2)}

Return a JSON object with exactly this structure:
{
  "overallHealth": "excellent|good|fair|at_risk|critical",
  "summary": "2-3 sentence summary of programme health",
  "pillarInsights": [
    {
      "pillarId": <number>,
      "pillarName": "<name>",
      "insight": "1-2 sentence insight",
      "sentiment": "positive|neutral|negative"
    }
  ],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "riskFlags": ["risk flag 1", "risk flag 2"]
}

Return ONLY valid JSON, no markdown or explanation.`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      res.status(503).json({ error: "AI response was empty" });
      return;
    }

    const rawText = textContent.text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(rawText) as {
      overallHealth: string;
      summary: string;
      pillarInsights: Array<{ pillarId: number; pillarName: string; insight: string; sentiment: string }>;
      recommendations: string[];
      riskFlags: string[];
    };

    const result = { ...parsed, cachedAt: new Date() };
    await setCachedAssessment(result);

    const user = getAuthUser(req);
    await logSpmoActivity(userId, getUserDisplayName(user), "ran_ai_assessment", "programme", 0, "StrategyPMO");

    res.json(result);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    req.log.error({ err: errMsg }, "AI assessment failed");
    res.status(503).json({ error: "AI service temporarily unavailable" });
  }
});

// ─────────────────────────────────────────────────────────────
// AI: Evidence Validation
// ─────────────────────────────────────────────────────────────
router.post("/spmo/ai/validate-evidence", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = RunSpmoAiValidateEvidenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [milestone] = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.id, parsed.data.milestoneId));

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const evidence = await db
    .select()
    .from(spmoEvidenceTable)
    .where(eq(spmoEvidenceTable.milestoneId, milestone.id));

  const context = {
    milestoneName: milestone.name,
    milestoneDescription: milestone.description,
    progress: milestone.progress,
    status: milestone.status,
    evidenceFiles: evidence.map((e) => ({
      fileName: e.fileName,
      contentType: e.contentType,
      description: e.description,
    })),
  };

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `You are a senior programme auditor reviewing evidence for a government programme milestone.

Milestone Data:
${JSON.stringify(context, null, 2)}

Evaluate the evidence quality and completeness. Return a JSON object with exactly this structure:
{
  "overallScore": <number 0-100>,
  "subScores": {
    "completeness": <number 0-100, how complete is the evidence set>,
    "relevance": <number 0-100, how relevant is the evidence to the milestone>,
    "specificity": <number 0-100, how specific and detailed is the evidence>
  },
  "verdict": "strong|adequate|weak|insufficient",
  "reasoning": "2-3 sentence explanation of verdict",
  "presentItems": ["item 1 that is well-evidenced", "item 2"],
  "gapItems": ["missing item 1", "gap 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Scoring guide:
- "strong" (80-100): Comprehensive evidence, well-documented, clearly demonstrates completion
- "adequate" (60-79): Sufficient evidence with minor gaps
- "weak" (40-59): Some evidence present but significant gaps
- "insufficient" (0-39): Missing key evidence or too few files

Return ONLY valid JSON, no markdown or explanation.`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      res.status(503).json({ error: "AI response was empty" });
      return;
    }

    const rawText2 = textContent.text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const aiResult = JSON.parse(rawText2) as {
      overallScore: number;
      subScores?: { completeness: number; relevance: number; specificity: number };
      verdict: string;
      reasoning: string;
      presentItems?: string[];
      gapItems?: string[];
      suggestions: string[];
    };

    // Update evidence records with AI scores
    if (evidence.length > 0) {
      const scorePerEvidence = aiResult.overallScore;
      await db
        .update(spmoEvidenceTable)
        .set({
          aiValidated: true,
          aiScore: scorePerEvidence,
          aiReasoning: aiResult.reasoning,
        })
        .where(eq(spmoEvidenceTable.milestoneId, milestone.id));
    }

    res.json({
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      evidenceCount: evidence.length,
      ...aiResult,
    });
  } catch (e) {
    req.log.error({ err: e }, "AI evidence validation failed");
    res.status(503).json({ error: "AI service temporarily unavailable" });
  }
});

// ─────────────────────────────────────────────────────────────
// Procurement
// ─────────────────────────────────────────────────────────────
router.get("/spmo/procurement", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const qp = ListSpmoProcurementQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const query = db.select().from(spmoProcurementTable).orderBy(desc(spmoProcurementTable.createdAt));
  const rows = qp.data.projectId
    ? await query.where(eq(spmoProcurementTable.projectId, qp.data.projectId))
    : await query;

  res.json({ procurement: rows });
});

router.post("/spmo/procurement", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const parsed = CreateSpmoProcurementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insert: InsertSpmoProcurement = {
    ...parsed.data,
  };

  const [row] = await db.insert(spmoProcurementTable).values(insert).returning();
  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "created", "procurement", row.id, row.title ?? "Procurement record");
  res.status(201).json(row);
});

router.put("/spmo/procurement/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = UpdateSpmoProcurementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSpmoProcurementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .update(spmoProcurementTable)
    .set(parsed.data)
    .where(eq(spmoProcurementTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Procurement record not found" });
    return;
  }

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "procurement", row.id, row.title ?? "Procurement record");
  res.json(row);
});

router.delete("/spmo/procurement/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  const params = DeleteSpmoProcurementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .delete(spmoProcurementTable)
    .where(eq(spmoProcurementTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Procurement record not found" });
    return;
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Programme Config
// ─────────────────────────────────────────────────────────────
router.get("/spmo/programme-config", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [config] = await db.select().from(spmoProgrammeConfigTable).limit(1);
  if (!config) {
    res.json({
      id: 1,
      programmeName: "National Transformation Programme",
      vision: null,
      mission: null,
      reportingCurrency: "SAR",
      fiscalYearStart: 1,
      projectAtRiskThreshold: 5,
      projectDelayedThreshold: 10,
      milestoneAtRiskThreshold: 5,
    });
    return;
  }
  res.json(config);
});

router.put("/spmo/programme-config", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const parsed = UpdateSpmoConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(spmoProgrammeConfigTable).limit(1);
  let row;
  if (existing.length === 0) {
    [row] = await db.insert(spmoProgrammeConfigTable).values({ id: 1, ...parsed.data }).returning();
  } else {
    [row] = await db.update(spmoProgrammeConfigTable).set(parsed.data).where(eq(spmoProgrammeConfigTable.id, 1)).returning();
  }
  res.json(row);
});

// ─────────────────────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/departments", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const departments = await db
    .select()
    .from(spmoDepartmentsTable)
    .orderBy(asc(spmoDepartmentsTable.sortOrder), asc(spmoDepartmentsTable.name));

  // For each department, compute project count and average progress
  const withStats = await Promise.all(
    departments.map(async (dept) => {
      const projects = await db
        .select()
        .from(spmoProjectsTable)
        .where(eq(spmoProjectsTable.departmentId, dept.id));

      let totalProgress = 0;
      for (const p of projects) {
        const stats = await projectProgress(p.id);
        totalProgress += stats.progress;
      }
      const progress = projects.length > 0 ? totalProgress / projects.length : 0;

      return {
        ...dept,
        projectCount: projects.length,
        progress: Math.round(progress * 10) / 10,
      };
    }),
  );

  res.json({ departments: withStats });
});

router.post("/spmo/departments", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const parsed = CreateSpmoDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insert: InsertSpmoDepartment = {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    color: parsed.data.color ?? "#3B82F6",
    sortOrder: parsed.data.sortOrder ?? 0,
  };

  const [dept] = await db.insert(spmoDepartmentsTable).values(insert).returning();
  await logSpmoActivity(userId, getUserDisplayName(user), "created", "department", dept.id, dept.name);
  res.status(201).json(dept);
});

router.put("/spmo/departments/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const params = UpdateSpmoDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSpmoDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [dept] = await db
    .update(spmoDepartmentsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(spmoDepartmentsTable.id, params.data.id))
    .returning();

  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "department", dept.id, dept.name);
  res.json(dept);
});

router.delete("/spmo/departments/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const params = DeleteSpmoDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Null out departmentId on projects before deleting (ON DELETE SET NULL handles this via FK)
  const [dept] = await db
    .delete(spmoDepartmentsTable)
    .where(eq(spmoDepartmentsTable.id, params.data.id))
    .returning();

  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  await logSpmoActivity(userId, getUserDisplayName(user), "deleted", "department", dept.id, dept.name);
  res.json({ success: true });
});

router.get("/spmo/pillars/:id/portfolio", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetSpmoPillarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pillar] = await db.select().from(spmoPillarsTable).where(eq(spmoPillarsTable.id, params.data.id));
  if (!pillar) {
    res.status(404).json({ error: "Pillar not found" });
    return;
  }

  const stats = await pillarProgress(pillar.id);

  const initiatives = await db
    .select()
    .from(spmoInitiativesTable)
    .where(eq(spmoInitiativesTable.pillarId, pillar.id))
    .orderBy(asc(spmoInitiativesTable.sortOrder), asc(spmoInitiativesTable.createdAt));

  const departments = await db.select().from(spmoDepartmentsTable);
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const initiativesWithProjects = await Promise.all(
    initiatives.map(async (i) => {
      const is = await initiativeProgress(i.id);

      const projects = await db
        .select()
        .from(spmoProjectsTable)
        .where(eq(spmoProjectsTable.initiativeId, i.id))
        .orderBy(asc(spmoProjectsTable.createdAt));

      const projectsEnriched = await Promise.all(
        projects.map(async (p) => {
          const ps = await projectProgress(p.id);
          return {
            ...p,
            ...ps,
            departmentName: p.departmentId ? deptMap.get(p.departmentId) : undefined,
          };
        }),
      );

      return { ...i, ...is, projects: projectsEnriched };
    }),
  );

  res.json({ pillar: { ...pillar, ...stats }, initiatives: initiativesWithProjects });
});

router.get("/spmo/departments/:id/portfolio", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetSpmoDepartmentPortfolioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [dept] = await db
    .select()
    .from(spmoDepartmentsTable)
    .where(eq(spmoDepartmentsTable.id, params.data.id));

  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  // Get all projects tagged to this department
  const projects = await db
    .select()
    .from(spmoProjectsTable)
    .where(eq(spmoProjectsTable.departmentId, dept.id));

  // Enrich with progress stats + initiative/pillar names
  const enriched = await Promise.all(
    projects.map(async (p) => {
      const stats = await projectProgress(p.id);

      // Get initiative name + pillar name
      const [initiative] = await db
        .select({ name: spmoInitiativesTable.name, pillarId: spmoInitiativesTable.pillarId })
        .from(spmoInitiativesTable)
        .where(eq(spmoInitiativesTable.id, p.initiativeId));

      let pillarName: string | undefined;
      if (initiative?.pillarId) {
        const [pillar] = await db
          .select({ name: spmoPillarsTable.name })
          .from(spmoPillarsTable)
          .where(eq(spmoPillarsTable.id, initiative.pillarId));
        pillarName = pillar?.name;
      }

      return {
        ...p,
        ...stats,
        initiativeName: initiative?.name,
        pillarName,
      };
    }),
  );

  res.json({ department: dept, projects: enriched });
});

// ─────────────────────────────────────────────────────────────
// PROJECT WEEKLY REPORTS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/projects/:id/weekly-report", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = GetSpmoProjectWeeklyReportParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid project id" }); return; }
  const { id: projectId } = parsed.data;

  const [cfg] = await db.select().from(spmoProgrammeConfigTable).limit(1);
  const resetDay = cfg?.weeklyResetDay ?? 3;
  const weekStart = getCurrentWeekStart(resetDay);

  const [report] = await db
    .select()
    .from(spmoProjectWeeklyReportsTable)
    .where(and(eq(spmoProjectWeeklyReportsTable.projectId, projectId), eq(spmoProjectWeeklyReportsTable.weekStart, weekStart)));

  res.json({
    projectId,
    weekStart,
    keyAchievements: report?.keyAchievements ?? null,
    nextSteps: report?.nextSteps ?? null,
    updatedByName: report?.updatedByName ?? null,
    updatedAt: report?.updatedAt ?? null,
  });
});

router.put("/spmo/projects/:id/weekly-report", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedParams = UpsertSpmoProjectWeeklyReportParams.safeParse(req.params);
  if (!parsedParams.success) { res.status(400).json({ error: "Invalid project id" }); return; }
  const { id: projectId } = parsedParams.data;

  const parsedBody = UpsertSpmoProjectWeeklyReportBody.safeParse(req.body);
  if (!parsedBody.success) { res.status(400).json({ error: parsedBody.error }); return; }
  const { keyAchievements, nextSteps } = parsedBody.data;

  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, projectId, "canSubmitReports"))) {
    res.status(403).json({ error: "You do not have permission to submit weekly reports for this project" });
    return;
  }

  const [cfg] = await db.select().from(spmoProgrammeConfigTable).limit(1);
  const resetDay = cfg?.weeklyResetDay ?? 3;
  const weekStart = getCurrentWeekStart(resetDay);
  const updatedByName = getUserDisplayName(user) ?? user?.email ?? null;

  const [project] = await db.select({ name: spmoProjectsTable.name }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, projectId));

  const [report] = await db
    .insert(spmoProjectWeeklyReportsTable)
    .values({
      projectId,
      weekStart,
      keyAchievements: keyAchievements ?? null,
      nextSteps: nextSteps ?? null,
      updatedById: user?.id ?? null,
      updatedByName,
    })
    .onConflictDoUpdate({
      target: [spmoProjectWeeklyReportsTable.projectId, spmoProjectWeeklyReportsTable.weekStart],
      set: {
        keyAchievements: keyAchievements ?? null,
        nextSteps: nextSteps ?? null,
        updatedById: user?.id ?? null,
        updatedByName,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (user?.id) {
    await logSpmoActivity(
      user.id,
      getUserDisplayName(user) ?? user.email ?? null,
      "weekly_report_submitted",
      "project",
      projectId,
      project?.name ?? `Project #${projectId}`,
      { weekStart, keyAchievements: keyAchievements ?? "", nextSteps: nextSteps ?? "" }
    );
  }

  res.json({
    projectId,
    weekStart,
    keyAchievements: report?.keyAchievements ?? null,
    nextSteps: report?.nextSteps ?? null,
    updatedByName: report?.updatedByName ?? null,
    updatedAt: report?.updatedAt ?? null,
  });
});

router.get("/spmo/projects/:id/weekly-report/history", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = GetSpmoProjectWeeklyReportParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid project id" }); return; }
  const { id: projectId } = parsed.data;

  const reports = await db
    .select()
    .from(spmoProjectWeeklyReportsTable)
    .where(eq(spmoProjectWeeklyReportsTable.projectId, projectId))
    .orderBy(desc(spmoProjectWeeklyReportsTable.weekStart));

  res.json({ reports });
});

// ─────────────────────────────────────────────────────────────
// CHANGE REQUESTS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/change-requests", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = await db
    .select()
    .from(spmoChangeRequestsTable)
    .where(projectId ? eq(spmoChangeRequestsTable.projectId, projectId) : undefined)
    .orderBy(desc(spmoChangeRequestsTable.createdAt));
  res.json({ changeRequests: rows });
});

router.get("/spmo/change-requests/:id", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseId(req, res);
  if (!id) return;
  const [row] = await db.select().from(spmoChangeRequestsTable).where(eq(spmoChangeRequestsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.post("/spmo/change-requests", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const user = getAuthUser(req)!;
  const body = z.object({
    projectId: z.number(),
    title: z.string(),
    description: z.string().optional(),
    changeType: z.enum(["scope", "budget", "timeline", "resource", "other"]).default("other"),
    impact: z.string().optional(),
    budgetImpact: z.number().optional(),
    timelineImpact: z.number().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  if (!(await checkProjectPerm(userId, user.role, body.data.projectId, "canSubmitChangeRequests"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }
  const [row] = await db.insert(spmoChangeRequestsTable).values({
    ...body.data,
    requestedById: user.id,
    requestedByName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
    status: "draft",
  }).returning();
  await db.insert(spmoActivityLogTable).values({
    actorId: user.id,
    actorName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
    action: "created",
    entityType: "change_request",
    entityId: row.id,
    entityName: row.title,
    details: { changeType: row.changeType },
  });
  res.status(201).json(row);
});

router.patch("/spmo/change-requests/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const user = getAuthUser(req)!;
  const id = parseId(req, res);
  if (!id) return;
  const body = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    changeType: z.enum(["scope", "budget", "timeline", "resource", "other"]).optional(),
    impact: z.string().optional(),
    budgetImpact: z.number().nullable().optional(),
    timelineImpact: z.number().nullable().optional(),
    status: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"]).optional(),
    reviewComments: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  const update: Record<string, unknown> = { ...body.data };
  if (body.data.status === "approved" || body.data.status === "rejected") {
    update.reviewedById = user.id;
    update.reviewedByName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    update.reviewedAt = new Date();
  }
  const [row] = await db.update(spmoChangeRequestsTable).set(update).where(eq(spmoChangeRequestsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await db.insert(spmoActivityLogTable).values({
    actorId: user.id,
    actorName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
    action: "updated",
    entityType: "change_request",
    entityId: row.id,
    entityName: row.title,
    details: body.data,
  });
  res.json(row);
});

router.delete("/spmo/change-requests/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  const [row] = await db.delete(spmoChangeRequestsTable).where(eq(spmoChangeRequestsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// RACI MATRIX
// ─────────────────────────────────────────────────────────────

router.get("/spmo/raci", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (!projectId) { res.status(400).json({ error: "projectId required" }); return; }
  const rows = await db
    .select()
    .from(spmoRaciTable)
    .where(eq(spmoRaciTable.projectId, projectId))
    .orderBy(asc(spmoRaciTable.milestoneId), asc(spmoRaciTable.userName));
  res.json({ raci: rows });
});

router.post("/spmo/raci", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const user = getAuthUser(req)!;
  const body = z.object({
    projectId: z.number(),
    milestoneId: z.number().nullable().optional(),
    userId: z.string(),
    userName: z.string().optional(),
    role: z.enum(["responsible", "accountable", "consulted", "informed"]),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  if (!(await checkProjectPerm(userId, user.role, body.data.projectId, "canManageRaci"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }
  const existing = body.data.milestoneId
    ? await db.select().from(spmoRaciTable).where(
        and(eq(spmoRaciTable.milestoneId, body.data.milestoneId), eq(spmoRaciTable.userId, body.data.userId))
      )
    : [];
  if (existing.length > 0) {
    const [row] = await db.update(spmoRaciTable).set({ role: body.data.role }).where(eq(spmoRaciTable.id, existing[0].id)).returning();
    res.json(row);
    return;
  }
  const [row] = await db.insert(spmoRaciTable).values({
    projectId: body.data.projectId,
    milestoneId: body.data.milestoneId ?? null,
    userId: body.data.userId,
    userName: body.data.userName ?? body.data.userId,
    role: body.data.role,
  }).returning();
  res.status(201).json(row);
});

router.patch("/spmo/raci/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  const body = z.object({ role: z.enum(["responsible", "accountable", "consulted", "informed"]) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  const [row] = await db.update(spmoRaciTable).set(body.data).where(eq(spmoRaciTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/spmo/raci/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  const [row] = await db.delete(spmoRaciTable).where(eq(spmoRaciTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/documents", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = await db
    .select()
    .from(spmoDocumentsTable)
    .where(projectId ? eq(spmoDocumentsTable.projectId, projectId) : undefined)
    .orderBy(desc(spmoDocumentsTable.createdAt));
  res.json({ documents: rows });
});

router.get("/spmo/documents/:id", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseId(req, res);
  if (!id) return;
  const [row] = await db.select().from(spmoDocumentsTable).where(eq(spmoDocumentsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.post("/spmo/documents", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const user = getAuthUser(req)!;
  const body = z.object({
    projectId: z.number().nullable().optional(),
    milestoneId: z.number().nullable().optional(),
    title: z.string(),
    description: z.string().optional(),
    category: z.enum(["business_case", "charter", "plan", "report", "template", "contract", "other"]).default("other"),
    fileName: z.string(),
    contentType: z.string().optional(),
    objectPath: z.string(),
    tags: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  if (body.data.projectId && !(await checkProjectPerm(userId, user.role, body.data.projectId, "canManageDocuments"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }
  const [row] = await db.insert(spmoDocumentsTable).values({
    ...body.data,
    uploadedById: user.id,
    uploadedByName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
    version: 1,
  }).returning();
  await db.insert(spmoActivityLogTable).values({
    actorId: user.id,
    actorName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
    action: "created",
    entityType: "document",
    entityId: row.id,
    entityName: row.title,
    details: { category: row.category },
  });
  res.status(201).json(row);
});

router.patch("/spmo/documents/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  // Check per-project permission
  const [doc] = await db.select({ projectId: spmoDocumentsTable.projectId }).from(spmoDocumentsTable).where(eq(spmoDocumentsTable.id, id)).limit(1);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const user = getAuthUser(req);
  if (doc.projectId && !(await checkProjectPerm(userId, user?.role, doc.projectId, "canManageDocuments"))) {
    res.status(403).json({ error: "You do not have permission to manage documents on this project" });
    return;
  }
  const body = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.enum(["business_case", "charter", "plan", "report", "template", "contract", "other"]).optional(),
    tags: z.array(z.string()).optional(),
    fileName: z.string().optional(),
    objectPath: z.string().optional(),
    contentType: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  const update: Record<string, unknown> = { ...body.data };
  if (body.data.objectPath) update.version = sql`version + 1`;
  const [row] = await db.update(spmoDocumentsTable).set(update).where(eq(spmoDocumentsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/spmo/documents/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  // Check per-project permission
  const [doc] = await db.select({ projectId: spmoDocumentsTable.projectId }).from(spmoDocumentsTable).where(eq(spmoDocumentsTable.id, id)).limit(1);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const user = getAuthUser(req);
  if (doc.projectId && !(await checkProjectPerm(userId, user?.role, doc.projectId, "canManageDocuments"))) {
    res.status(403).json({ error: "You do not have permission to manage documents on this project" });
    return;
  }
  await db.delete(spmoDocumentsTable).where(eq(spmoDocumentsTable.id, id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// ACTION ITEMS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/actions", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = await db
    .select()
    .from(spmoActionsTable)
    .where(projectId ? eq(spmoActionsTable.projectId, projectId) : undefined)
    .orderBy(asc(spmoActionsTable.dueDate), desc(spmoActionsTable.createdAt));
  res.json({ actions: rows });
});

router.post("/spmo/actions", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const user = getAuthUser(req)!;
  const body = z.object({
    projectId: z.number(),
    milestoneId: z.number().nullable().optional(),
    title: z.string(),
    description: z.string().optional(),
    assigneeId: z.string().optional(),
    assigneeName: z.string().optional(),
    dueDate: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    status: z.enum(["open", "in_progress", "done", "cancelled"]).default("open"),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  if (!(await checkProjectPerm(userId, user.role, body.data.projectId, "canManageActions"))) {
    res.status(403).json({ error: "You do not have edit access to this project" });
    return;
  }
  const [row] = await db.insert(spmoActionsTable).values({
    ...body.data,
    createdById: user.id,
    createdByName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
  }).returning();
  res.status(201).json(row);
});

router.patch("/spmo/actions/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  // Check per-project permission
  const [action] = await db.select({ projectId: spmoActionsTable.projectId }).from(spmoActionsTable).where(eq(spmoActionsTable.id, id)).limit(1);
  if (!action) { res.status(404).json({ error: "Not found" }); return; }
  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, action.projectId, "canManageActions"))) {
    res.status(403).json({ error: "You do not have permission to manage actions on this project" });
    return;
  }
  const body = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    assigneeId: z.string().optional(),
    assigneeName: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  const [row] = await db.update(spmoActionsTable).set(body.data).where(eq(spmoActionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/spmo/actions/:id", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  // Check per-project permission
  const [action] = await db.select({ projectId: spmoActionsTable.projectId }).from(spmoActionsTable).where(eq(spmoActionsTable.id, id)).limit(1);
  if (!action) { res.status(404).json({ error: "Not found" }); return; }
  const user = getAuthUser(req);
  if (!(await checkProjectPerm(userId, user?.role, action.projectId, "canManageActions"))) {
    res.status(403).json({ error: "You do not have permission to manage actions on this project" });
    return;
  }
  await db.delete(spmoActionsTable).where(eq(spmoActionsTable.id, id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// COMMENTS & DISCUSSION THREADS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/comments", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const entityType = req.query.entityType as string;
  const entityId = req.query.entityId ? Number(req.query.entityId) : null;
  if (!entityType || !entityId) { res.status(400).json({ error: "entityType and entityId required" }); return; }
  const rows = await db.select().from(spmoCommentsTable).where(and(eq(spmoCommentsTable.entityType, entityType), eq(spmoCommentsTable.entityId, entityId))).orderBy(asc(spmoCommentsTable.createdAt));
  res.json({ comments: rows });
});

router.post("/spmo/comments", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const user = getAuthUser(req);
  const body = z.object({
    entityType: z.enum(["project", "milestone", "risk", "kpi", "initiative"]),
    entityId: z.number(),
    parentId: z.number().nullable().optional(),
    body: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error }); return; }
  const [row] = await db.insert(spmoCommentsTable).values({
    ...body.data,
    authorId: userId,
    authorName: getUserDisplayName(user),
  }).returning();

  // Create notification for project owner if commenting on their project
  if (body.data.entityType === "project") {
    const [proj] = await db.select({ ownerId: spmoProjectsTable.ownerId, name: spmoProjectsTable.name }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, body.data.entityId)).limit(1);
    if (proj?.ownerId && proj.ownerId !== userId) {
      await db.insert(spmoNotificationsTable).values({
        userId: proj.ownerId,
        type: "comment",
        title: `New comment on ${proj.name}`,
        body: body.data.body.slice(0, 200),
        link: `/projects/${body.data.entityId}`,
        entityType: body.data.entityType,
        entityId: body.data.entityId,
      });
    }
  }

  res.status(201).json(row);
});

router.delete("/spmo/comments/:id", async (req, res) => {
  const userId = requireAuth(req, res);
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

// NOTIFICATIONS (in-app bell icon)
// ─────────────────────────────────────────────────────────────

router.get("/spmo/notifications", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db.select().from(spmoNotificationsTable).where(eq(spmoNotificationsTable.userId, userId)).orderBy(desc(spmoNotificationsTable.createdAt)).limit(50);
  const unread = rows.filter((r) => !r.read).length;
  res.json({ notifications: rows, unreadCount: unread });
});

router.post("/spmo/notifications/read-all", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await db.update(spmoNotificationsTable).set({ read: true }).where(and(eq(spmoNotificationsTable.userId, userId), eq(spmoNotificationsTable.read, false)));
  res.json({ ok: true });
});

router.post("/spmo/notifications/:id/read", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  await db.update(spmoNotificationsTable).set({ read: true }).where(and(eq(spmoNotificationsTable.id, id), eq(spmoNotificationsTable.userId, userId)));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// EMAIL REMINDERS
// ─────────────────────────────────────────────────────────────

// Send task reminders (milestones, actions, risks)
router.post("/spmo/admin/send-reminders", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { generateTaskReminders, formatReminderHtml, formatReminderText } = await import("../lib/email-reminders");
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}/strategy-pmo`;
    const reminders = await generateTaskReminders(baseUrl);
    const preview = reminders.map((r) => ({
      to: r.to, toName: r.toName, cc: r.cc, subject: r.subject,
      totalItems: r.sections.reduce((s, sec) => s + sec.items.length, 0),
      textPreview: formatReminderText(r).slice(0, 500),
      html: formatReminderHtml(r),
    }));
    res.json({ type: "task_reminders", sent: reminders.length, reminders: preview });
  } catch (err) {
    req.log.error({ err }, "Failed to generate task reminders");
    res.status(500).json({ error: "Failed to generate reminders" });
  }
});

// Send weekly report deadline reminders (overdue reports only)
router.post("/spmo/admin/send-weekly-report-reminders", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { generateWeeklyReportReminders, formatReminderHtml, formatReminderText } = await import("../lib/email-reminders");
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}/strategy-pmo`;
    const reminders = await generateWeeklyReportReminders(baseUrl);
    const preview = reminders.map((r) => ({
      to: r.to, toName: r.toName, cc: r.cc, subject: r.subject,
      totalItems: r.sections.reduce((s, sec) => s + sec.items.length, 0),
      textPreview: formatReminderText(r).slice(0, 500),
      html: formatReminderHtml(r),
    }));
    res.json({ type: "weekly_report_deadline", sent: reminders.length, reminders: preview });
  } catch (err) {
    req.log.error({ err }, "Failed to generate weekly report reminders");
    res.status(500).json({ error: "Failed to generate reminders" });
  }
});

// ─────────────────────────────────────────────────────────────
// GLOBAL SEARCH (Cmd+K — searches projects, milestones, KPIs, risks, documents)
// ─────────────────────────────────────────────────────────────

router.get("/spmo/search", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const q = ((req.query.q as string) || "").trim();
  if (q.length < 2) { res.json({ results: [] }); return; }

  // Single SQL query using UNION ALL with ILIKE (was: 5 full table scans + JS filtering)
  const pattern = `%${q}%`;
  const searchResults = await db.execute(sql`
    (SELECT 'project' as type, id, name as title, COALESCE(project_code || ' · ' || COALESCE(owner_name, ''), '') as subtitle, '/projects/' || id as link FROM spmo_projects WHERE name ILIKE ${pattern} OR project_code ILIKE ${pattern} OR description ILIKE ${pattern} LIMIT 5)
    UNION ALL
    (SELECT 'milestone', id, name, 'Milestone', '/projects/' || project_id || '?tab=milestones' FROM spmo_milestones WHERE name ILIKE ${pattern} OR description ILIKE ${pattern} LIMIT 5)
    UNION ALL
    (SELECT 'kpi', id, name, type || ' KPI', '/kpis' FROM spmo_kpis WHERE name ILIKE ${pattern} OR description ILIKE ${pattern} LIMIT 5)
    UNION ALL
    (SELECT 'risk', id, title, 'Risk', CASE WHEN project_id IS NOT NULL THEN '/projects/' || project_id || '?tab=risks' ELSE '/risks' END FROM spmo_risks WHERE title ILIKE ${pattern} OR description ILIKE ${pattern} LIMIT 5)
    UNION ALL
    (SELECT 'initiative', id, name, 'Initiative ' || COALESCE(initiative_code, ''), '/initiatives' FROM spmo_initiatives WHERE name ILIKE ${pattern} OR initiative_code ILIKE ${pattern} OR description ILIKE ${pattern} LIMIT 5)
  `);

  const results = (searchResults.rows as { type: string; id: number; title: string; subtitle: string; link: string }[]).slice(0, 20);
  res.json({ results });
});

// ─────────────────────────────────────────────────────────────
// USER SEARCH (for @ tagging in action items — any authenticated user)
// ─────────────────────────────────────────────────────────────

router.get("/spmo/users/search", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const q = ((req.query.q as string) || "").trim().toLowerCase();
  const allUsers = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    role: usersTable.role,
  }).from(usersTable);

  const filtered = q
    ? allUsers.filter(u => {
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : allUsers;

  res.json({ users: filtered.slice(0, 20) });
});

// ─────────────────────────────────────────────────────────────
// ADMIN: DIAGNOSTICS
// ─────────────────────────────────────────────────────────────

const SERVER_START_TIME = Date.now();

router.get("/spmo/admin/diagnostics", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    // DB connectivity
    let dbStatus = "healthy";
    let dbLatencyMs = 0;
    try {
      const t0 = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - t0;
    } catch {
      dbStatus = "unreachable";
    }

    // Table row counts
    const counts = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM spmo_pillars) AS pillars,
        (SELECT count(*)::int FROM spmo_initiatives) AS initiatives,
        (SELECT count(*)::int FROM spmo_projects) AS projects,
        (SELECT count(*)::int FROM spmo_milestones) AS milestones,
        (SELECT count(*)::int FROM spmo_kpis) AS kpis,
        (SELECT count(*)::int FROM spmo_risks) AS risks,
        (SELECT count(*)::int FROM spmo_budget_entries) AS budget_entries,
        (SELECT count(*)::int FROM spmo_activity_log) AS activity_log,
        (SELECT count(*)::int FROM users) AS users
    `);
    const tableCounts = counts.rows[0] as Record<string, number>;

    // Programme config
    const [cfg] = await db.select().from(spmoProgrammeConfigTable).limit(1);
    const lastAiAssessmentAt = cfg?.lastAiAssessmentAt ?? null;

    // Memory usage
    const mem = process.memoryUsage();

    // Uptime
    const uptimeMs = Date.now() - SERVER_START_TIME;
    const uptimeDays = Math.floor(uptimeMs / 86_400_000);
    const uptimeHours = Math.floor((uptimeMs % 86_400_000) / 3_600_000);
    const uptimeMins = Math.floor((uptimeMs % 3_600_000) / 60_000);

    res.json({
      appVersion: "1.1.0",
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? "development",
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      tableCounts,
      config: {
        programmeName: cfg?.programmeName ?? null,
        weeklyResetDay: cfg?.weeklyResetDay ?? null,
        riskAlertThreshold: cfg?.riskAlertThreshold ?? null,
        reminderDaysAhead: cfg?.reminderDaysAhead ?? null,
        lastAiAssessmentAt,
      },
      memory: {
        rss: `${Math.round(mem.rss / 1_048_576)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1_048_576)}MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1_048_576)}MB`,
        external: `${Math.round(mem.external / 1_048_576)}MB`,
      },
      uptime: {
        formatted: `${uptimeDays}d ${uptimeHours}h ${uptimeMins}m`,
        ms: uptimeMs,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Diagnostics failed");
    res.status(500).json({ error: "Diagnostics check failed" });
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN: USER MANAGEMENT
// ─────────────────────────────────────────────────────────────

router.get("/spmo/admin/users", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(asc(usersTable.createdAt));

  res.json({ users });
});

// GET /spmo/admin/users-access — All users with their project access grants
router.get("/spmo/admin/users-access", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    role: usersTable.role,
  }).from(usersTable).orderBy(asc(usersTable.createdAt));

  const grants = await db.select().from(spmoProjectAccessTable);
  const projects = await db.select({ id: spmoProjectsTable.id, name: spmoProjectsTable.name, projectCode: spmoProjectsTable.projectCode, ownerId: spmoProjectsTable.ownerId }).from(spmoProjectsTable);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const result = users.map((u) => {
    const userGrants = grants.filter((g) => g.userId === u.id);
    const ownedProjects = projects.filter((p) => p.ownerId === u.id);
    return {
      ...u,
      ownedProjects: ownedProjects.map((p) => ({ id: p.id, name: p.name, projectCode: p.projectCode })),
      accessGrants: userGrants.map((g) => {
        const proj = projectMap.get(g.projectId);
        return {
          projectId: g.projectId,
          projectName: proj?.name ?? "Unknown",
          projectCode: proj?.projectCode ?? null,
          canEditDetails: g.canEditDetails,
          canManageMilestones: g.canManageMilestones,
          canSubmitReports: g.canSubmitReports,
          canManageRisks: g.canManageRisks,
          canManageBudget: g.canManageBudget,
          canManageDocuments: g.canManageDocuments,
          canManageActions: g.canManageActions,
          canManageRaci: g.canManageRaci,
          canSubmitChangeRequests: g.canSubmitChangeRequests,
        };
      }),
    };
  });

  res.json({ users: result });
});

router.put("/spmo/admin/users/:userId/role", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsedParams = UpdateSpmoUserRoleParams.safeParse(req.params);
  if (!parsedParams.success) { res.status(400).json({ error: "Invalid user id" }); return; }
  const { userId } = parsedParams.data;

  const parsedBody = UpdateSpmoUserRoleBody.safeParse(req.body);
  if (!parsedBody.success) { res.status(400).json({ error: parsedBody.error }); return; }
  const { role } = parsedBody.data;

  const currentAdmin = getAuthUser(req);
  if (currentAdmin?.id === userId && role !== "admin") {
    res.status(400).json({ error: "You cannot demote yourself from admin" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  res.json({ id: updated.id, email: updated.email, firstName: updated.firstName, lastName: updated.lastName, role: updated.role });
});

// ─────────────────────────────────────────────────────────────
// KPI MEASUREMENTS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/kpis/:id/measurements", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const kpiId = parseId(req, res);
  if (!kpiId) return;
  const rows = await db.select().from(spmoKpiMeasurementsTable).where(eq(spmoKpiMeasurementsTable.kpiId, kpiId)).orderBy(desc(spmoKpiMeasurementsTable.measuredAt));
  res.json({ measurements: rows });
});

router.post("/spmo/kpis/:id/measurements", async (req, res) => {
  const userId = requireRole(req, res, "admin", "project-manager");
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
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;
  const id = parseId(req, res);
  if (!id) return;
  const [row] = await db.delete(spmoKpiMeasurementsTable).where(eq(spmoKpiMeasurementsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// MY TASKS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/my-tasks/count", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const isApprover = userRow?.role === "admin" || userRow?.role === "approver";

  // Only include active projects — completed/on_hold/cancelled projects should not generate tasks
  const myProjects = await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable).where(and(eq(spmoProjectsTable.ownerId, userId), eq(spmoProjectsTable.status, "active")));
  const myProjectIds = myProjects.map((p) => p.id);

  // Only admin and approver roles see pending approvals
  let pendingApprovals = 0;
  if (isApprover) {
    const rows = await db.select({ id: spmoMilestonesTable.id }).from(spmoMilestonesTable).where(eq(spmoMilestonesTable.status, "submitted"));
    pendingApprovals = rows.length;
  }

  // Exclude milestones from completed/cancelled/on_hold projects
  const activeProjectIds = (await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable).where(eq(spmoProjectsTable.status, "active"))).map((p) => p.id);
  const myMilestones = activeProjectIds.length > 0
    ? await db.select().from(spmoMilestonesTable).where(and(eq(spmoMilestonesTable.assigneeId, userId), ne(spmoMilestonesTable.status, "approved"), inArray(spmoMilestonesTable.projectId, activeProjectIds)))
    : [];
  const overdueCount = myMilestones.filter((m) => m.dueDate && m.dueDate < today).length;
  const dueSoonCount = myMilestones.filter((m) => {
    if (!m.dueDate || m.dueDate < today) return false;
    const daysLeft = Math.ceil((new Date(m.dueDate).getTime() - now.getTime()) / 86400000);
    return daysLeft >= 0 && daysLeft <= 7;
  }).length;

  // Count action items assigned to this user that are open/in_progress
  const myActions = await db.select({ id: spmoActionsTable.id, dueDate: spmoActionsTable.dueDate, status: spmoActionsTable.status }).from(spmoActionsTable).where(and(eq(spmoActionsTable.assigneeId, userId), inArray(spmoActionsTable.status, ["open", "in_progress"])));
  const overdueActions = myActions.filter((a) => a.dueDate && a.dueDate < today).length;
  const pendingActions = myActions.length - overdueActions;

  // Load risk alert threshold from config
  const [riskCfg] = await db.select({ riskAlertThreshold: spmoProgrammeConfigTable.riskAlertThreshold }).from(spmoProgrammeConfigTable).limit(1);
  const riskThreshold = riskCfg?.riskAlertThreshold ?? 9;

  // Count project-level alerts for owned projects
  let projectAlerts = 0;
  let ownerOverdueMilestones = 0;
  let ownerDueSoonMilestones = 0;
  let delayedProjects = 0;
  let atRiskProjects = 0;
  if (myProjectIds.length > 0) {
    const highRisks = await db.select({ id: spmoRisksTable.id }).from(spmoRisksTable).where(and(inArray(spmoRisksTable.projectId, myProjectIds), eq(spmoRisksTable.status, "open"), gte(spmoRisksTable.riskScore, riskThreshold)));
    projectAlerts = highRisks.length;

    // Milestones in owned projects (overdue/due soon)
    const assignedMsIds = new Set(myMilestones.map((m) => m.id));
    const ownedMs = await db.select({ id: spmoMilestonesTable.id, dueDate: spmoMilestonesTable.dueDate, status: spmoMilestonesTable.status, assigneeId: spmoMilestonesTable.assigneeId }).from(spmoMilestonesTable).where(and(inArray(spmoMilestonesTable.projectId, myProjectIds), ne(spmoMilestonesTable.status, "approved")));
    for (const m of ownedMs) {
      if (assignedMsIds.has(m.id) || !m.dueDate) continue;
      const dl = Math.ceil((new Date(m.dueDate).getTime() - now.getTime()) / 86400000);
      if (m.dueDate < today) ownerOverdueMilestones++;
      else if (dl <= 7) ownerDueSoonMilestones++;
    }

    // Project health
    const myProjsFull = await db.select().from(spmoProjectsTable).where(inArray(spmoProjectsTable.id, myProjectIds));
    for (const p of myProjsFull) {
      const ps = await projectProgress(p.id);
      const h = computeStatus(ps.progress, p.startDate, p.targetDate, p.budget, p.budgetSpent, ps.rawProgress);
      if (h.status === "delayed") delayedProjects++;
      else if (h.status === "at_risk") atRiskProjects++;
    }
  }

  const [cfg] = await db.select({ weeklyResetDay: spmoProgrammeConfigTable.weeklyResetDay }).from(spmoProgrammeConfigTable).limit(1);
  const resetDay = cfg?.weeklyResetDay ?? 3;
  const weekStart = getCurrentWeekStart(resetDay);
  let weeklyDue = 0;
  if (myProjectIds.length > 0) {
    const existing = await db.select({ projectId: spmoProjectWeeklyReportsTable.projectId }).from(spmoProjectWeeklyReportsTable).where(and(inArray(spmoProjectWeeklyReportsTable.projectId, myProjectIds), eq(spmoProjectWeeklyReportsTable.weekStart, weekStart)));
    weeklyDue = myProjectIds.length - existing.length;
  }

  const total = pendingApprovals + overdueCount + dueSoonCount + weeklyDue + overdueActions + pendingActions + projectAlerts + ownerOverdueMilestones + ownerDueSoonMilestones + delayedProjects + atRiskProjects;
  const critical = overdueCount + overdueActions + delayedProjects;
  const high = pendingApprovals + projectAlerts + ownerOverdueMilestones + atRiskProjects;
  res.json({ total, critical, high, medium: dueSoonCount + weeklyDue + pendingActions + ownerDueSoonMilestones, low: 0 });
});

router.get("/spmo/my-tasks", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const isApprover = userRow?.role === "admin" || userRow?.role === "approver";

  // Only include active projects — completed/on_hold/cancelled should not generate tasks
  const myProjects = await db.select({ id: spmoProjectsTable.id, name: spmoProjectsTable.name }).from(spmoProjectsTable).where(and(eq(spmoProjectsTable.ownerId, userId), eq(spmoProjectsTable.status, "active")));
  const myProjectIds = myProjects.map((p) => p.id);
  const projectNameMap = new Map(myProjects.map((p) => [p.id, p.name]));

  // Only admin and approver roles see pending approvals — PMs submit evidence, not approve
  let pendingApprovals: typeof spmoMilestonesTable.$inferSelect[] = [];
  if (isApprover) {
    pendingApprovals = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.status, "submitted"));
    // Build project name map for all submitted milestone projects
    const submittedProjectIds = [...new Set(pendingApprovals.map((m) => m.projectId))];
    if (submittedProjectIds.length > 0) {
      const extraProjects = await db.select({ id: spmoProjectsTable.id, name: spmoProjectsTable.name }).from(spmoProjectsTable).where(inArray(spmoProjectsTable.id, submittedProjectIds));
      for (const p of extraProjects) if (!projectNameMap.has(p.id)) projectNameMap.set(p.id, p.name);
    }
  }

  // Exclude milestones from completed/cancelled/on_hold projects
  const activeProjectIds = (await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable).where(eq(spmoProjectsTable.status, "active"))).map((p) => p.id);
  const myMilestones = activeProjectIds.length > 0
    ? await db.select().from(spmoMilestonesTable).where(and(eq(spmoMilestonesTable.assigneeId, userId), ne(spmoMilestonesTable.status, "approved"), inArray(spmoMilestonesTable.projectId, activeProjectIds)))
    : [];
  const overdue = myMilestones.filter((m) => m.dueDate && m.dueDate < today && m.status !== "approved");
  const dueSoon = myMilestones.filter((m) => {
    if (!m.dueDate || m.status === "approved" || overdue.some((o) => o.id === m.id)) return false;
    const daysLeft = Math.ceil((new Date(m.dueDate).getTime() - now.getTime()) / 86400000);
    return daysLeft >= 0 && daysLeft <= 7;
  });
  const needsUpdate = myMilestones.filter((m) => m.progress < 100 && !overdue.some((o) => o.id === m.id) && !dueSoon.some((d) => d.id === m.id) && m.depStatus !== "blocked");
  const blocked = myMilestones.filter((m) => m.depStatus === "blocked");

  const [cfg] = await db.select({ weeklyResetDay: spmoProgrammeConfigTable.weeklyResetDay }).from(spmoProgrammeConfigTable).limit(1);
  const resetDay = cfg?.weeklyResetDay ?? 3;
  const weekStart = getCurrentWeekStart(resetDay);
  let weeklyReportsDue: { id: number; name: string }[] = [];
  if (myProjectIds.length > 0) {
    const existing = await db.select({ projectId: spmoProjectWeeklyReportsTable.projectId }).from(spmoProjectWeeklyReportsTable).where(and(inArray(spmoProjectWeeklyReportsTable.projectId, myProjectIds), eq(spmoProjectWeeklyReportsTable.weekStart, weekStart)));
    const reported = new Set(existing.map((r) => r.projectId));
    weeklyReportsDue = myProjects.filter((p) => !reported.has(p.id));
  }

  const tasks: object[] = [];
  for (const m of pendingApprovals) {
    const daysSubmitted = m.submittedAt ? Math.ceil((now.getTime() - new Date(m.submittedAt).getTime()) / 86400000) : 0;
    const isEscalated = daysSubmitted >= 5;
    tasks.push({ id: `approve-${m.id}`, type: "approval", priority: isEscalated ? "critical" : "high", title: `${isEscalated ? "⚠ ESCALATED: " : ""}Approve: ${m.name}`, subtitle: `${projectNameMap.get(m.projectId) ?? "—"} · Submitted${daysSubmitted > 0 ? ` ${daysSubmitted}d ago` : ""} · ${m.progress}%`, entityType: "milestone", entityId: m.id, projectId: m.projectId, dueDate: null, daysLeft: null, action: isEscalated ? "Overdue approval — submitted over 5 days ago" : "Review evidence and approve or reject", link: `/projects/${m.projectId}?tab=milestones` });
  }
  for (const m of overdue) {
    const daysOver = Math.ceil((now.getTime() - new Date(m.dueDate!).getTime()) / 86400000);
    tasks.push({ id: `overdue-${m.id}`, type: "overdue", priority: "critical", title: `OVERDUE: ${m.name}`, subtitle: `${projectNameMap.get(m.projectId) ?? "—"} · ${daysOver}d overdue · ${m.progress}%`, entityType: "milestone", entityId: m.id, projectId: m.projectId, dueDate: m.dueDate, daysLeft: -daysOver, action: "Update progress and evidence immediately", link: `/projects/${m.projectId}?tab=milestones` });
  }
  for (const m of dueSoon) {
    const daysLeft = Math.ceil((new Date(m.dueDate!).getTime() - now.getTime()) / 86400000);
    tasks.push({ id: `duesoon-${m.id}`, type: "due_soon", priority: "medium", title: `Due in ${daysLeft}d: ${m.name}`, subtitle: `${projectNameMap.get(m.projectId) ?? "—"} · ${m.progress}%`, entityType: "milestone", entityId: m.id, projectId: m.projectId, dueDate: m.dueDate, daysLeft, action: "Update progress before due date", link: `/projects/${m.projectId}?tab=milestones` });
  }
  for (const p of weeklyReportsDue) {
    tasks.push({ id: `weekly-${p.id}`, type: "weekly_report", priority: "medium", title: `Weekly Report: ${p.name}`, subtitle: `Week of ${weekStart} · Not yet submitted`, entityType: "project", entityId: p.id, projectId: p.id, dueDate: null, daysLeft: null, action: "Submit key achievements and next steps", link: `/projects/${p.id}?tab=weekly-report` });
  }
  for (const m of needsUpdate) {
    tasks.push({ id: `update-${m.id}`, type: "progress_update", priority: "low", title: `Update: ${m.name}`, subtitle: `${projectNameMap.get(m.projectId) ?? "—"} · ${m.progress}%`, entityType: "milestone", entityId: m.id, projectId: m.projectId, dueDate: m.dueDate, daysLeft: m.dueDate ? Math.ceil((new Date(m.dueDate).getTime() - now.getTime()) / 86400000) : null, action: "Update progress percentage", link: `/projects/${m.projectId}?tab=milestones` });
  }
  for (const m of blocked) {
    tasks.push({ id: `blocked-${m.id}`, type: "blocked", priority: "info", title: `Blocked: ${m.name}`, subtitle: `${projectNameMap.get(m.projectId) ?? "—"} · Waiting on dependency`, entityType: "milestone", entityId: m.id, projectId: m.projectId, dueDate: m.dueDate, daysLeft: null, action: "No action needed — blocked by upstream dependency", link: `/projects/${m.projectId}?tab=milestones` });
  }

  // ── Action items assigned to this user ──
  const myActions = await db.select().from(spmoActionsTable).where(and(eq(spmoActionsTable.assigneeId, userId), inArray(spmoActionsTable.status, ["open", "in_progress"])));
  // Build project name map for action projects
  const actionProjectIds = [...new Set(myActions.map((a) => a.projectId))];
  if (actionProjectIds.length > 0) {
    const actionProjects = await db.select({ id: spmoProjectsTable.id, name: spmoProjectsTable.name }).from(spmoProjectsTable).where(inArray(spmoProjectsTable.id, actionProjectIds));
    for (const p of actionProjects) if (!projectNameMap.has(p.id)) projectNameMap.set(p.id, p.name);
  }
  for (const a of myActions) {
    const isOverdueAction = a.dueDate && a.dueDate < today;
    const daysLeft = a.dueDate ? Math.ceil((new Date(a.dueDate).getTime() - now.getTime()) / 86400000) : null;
    tasks.push({
      id: `action-${a.id}`,
      type: isOverdueAction ? "overdue" : "action_assigned",
      priority: isOverdueAction ? "critical" : (a.priority === "urgent" || a.priority === "high" ? "medium" : "low"),
      title: `${isOverdueAction ? "OVERDUE: " : ""}${a.title}`,
      subtitle: `${projectNameMap.get(a.projectId) ?? "—"} · ${a.priority} · ${a.status.replace("_", " ")}${a.dueDate ? ` · Due ${new Date(a.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`,
      entityType: "action",
      entityId: a.id,
      projectId: a.projectId,
      dueDate: a.dueDate,
      daysLeft,
      action: isOverdueAction ? "Complete overdue action item immediately" : "Complete assigned action item",
      link: `/projects/${a.projectId}?tab=actions`,
    });
  }

  // Load risk alert threshold from config
  const [riskCfg2] = await db.select({ riskAlertThreshold: spmoProgrammeConfigTable.riskAlertThreshold }).from(spmoProgrammeConfigTable).limit(1);
  const riskThreshold = riskCfg2?.riskAlertThreshold ?? 9;

  // ── Project owner notifications for owned projects ──
  if (myProjectIds.length > 0) {
    // Risk alerts: high-score open risks
    const highRisks = await db.select().from(spmoRisksTable).where(and(inArray(spmoRisksTable.projectId, myProjectIds), eq(spmoRisksTable.status, "open"), gte(spmoRisksTable.riskScore, riskThreshold)));
    for (const r of highRisks) {
      tasks.push({
        id: `risk-alert-${r.id}`,
        type: "risk_alert",
        priority: r.riskScore >= 16 ? "critical" : "high",
        title: `Risk Alert: ${r.title}`,
        subtitle: `${projectNameMap.get(r.projectId!) ?? "—"} · Score ${r.riskScore} · ${r.probability}/${r.impact}`,
        entityType: "risk",
        entityId: r.id,
        projectId: r.projectId!,
        dueDate: null,
        daysLeft: null,
        action: "Review and add mitigation actions",
        link: `/projects/${r.projectId}?tab=risks`,
      });
    }

    // Milestone due/overdue in owned projects (not already in assignee tasks)
    const assignedMsIds = new Set(myMilestones.map((m) => m.id));
    const ownedProjectMilestones = await db.select().from(spmoMilestonesTable).where(and(inArray(spmoMilestonesTable.projectId, myProjectIds), ne(spmoMilestonesTable.status, "approved")));
    for (const m of ownedProjectMilestones) {
      if (assignedMsIds.has(m.id)) continue; // Already shown as assignee task
      if (!m.dueDate) continue;
      const daysLeft = Math.ceil((new Date(m.dueDate).getTime() - now.getTime()) / 86400000);
      if (m.dueDate < today) {
        // Overdue milestone in owned project
        tasks.push({
          id: `owner-overdue-${m.id}`,
          type: "owner_milestone_overdue",
          priority: "high",
          title: `Your Project — Overdue: ${m.name}`,
          subtitle: `${projectNameMap.get(m.projectId) ?? "—"} · ${Math.abs(daysLeft)}d overdue · ${m.progress}%`,
          entityType: "milestone",
          entityId: m.id,
          projectId: m.projectId,
          dueDate: m.dueDate,
          daysLeft,
          action: "Follow up with assignee on overdue milestone",
          link: `/projects/${m.projectId}?tab=milestones`,
        });
      } else if (daysLeft <= 7) {
        // Due soon milestone in owned project
        tasks.push({
          id: `owner-duesoon-${m.id}`,
          type: "owner_milestone_due_soon",
          priority: "medium",
          title: `Your Project — Due in ${daysLeft}d: ${m.name}`,
          subtitle: `${projectNameMap.get(m.projectId) ?? "—"} · ${m.progress}%`,
          entityType: "milestone",
          entityId: m.id,
          projectId: m.projectId,
          dueDate: m.dueDate,
          daysLeft,
          action: "Ensure milestone is on track before deadline",
          link: `/projects/${m.projectId}?tab=milestones`,
        });
      }
    }

    // Project health alerts: delayed or at_risk status
    for (const p of myProjects) {
      const pStats = await projectProgress(p.id);
      const [projRow] = await db.select({ startDate: spmoProjectsTable.startDate, targetDate: spmoProjectsTable.targetDate, budget: spmoProjectsTable.budget, budgetSpent: spmoProjectsTable.budgetSpent }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, p.id)).limit(1);
      if (!projRow) continue;
      const health = computeStatus(pStats.progress, projRow.startDate, projRow.targetDate, projRow.budget, projRow.budgetSpent, pStats.rawProgress);
      if (health.status === "delayed") {
        tasks.push({
          id: `project-delayed-${p.id}`,
          type: "project_delayed",
          priority: "critical",
          title: `PROJECT DELAYED: ${p.name}`,
          subtitle: `Progress ${pStats.progress}% · ${health.reason}`,
          entityType: "project",
          entityId: p.id,
          projectId: p.id,
          dueDate: projRow.targetDate,
          daysLeft: projRow.targetDate ? Math.ceil((new Date(projRow.targetDate).getTime() - now.getTime()) / 86400000) : null,
          action: "Urgent intervention needed — project is behind schedule",
          link: `/projects/${p.id}`,
        });
      } else if (health.status === "at_risk") {
        tasks.push({
          id: `project-atrisk-${p.id}`,
          type: "project_at_risk",
          priority: "high",
          title: `At Risk: ${p.name}`,
          subtitle: `Progress ${pStats.progress}% · ${health.reason}`,
          entityType: "project",
          entityId: p.id,
          projectId: p.id,
          dueDate: projRow.targetDate,
          daysLeft: projRow.targetDate ? Math.ceil((new Date(projRow.targetDate).getTime() - now.getTime()) / 86400000) : null,
          action: "Review project plan and take corrective action",
          link: `/projects/${p.id}`,
        });
      }
    }
  }

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  tasks.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (priorityOrder[a.priority as string] ?? 5) - (priorityOrder[b.priority as string] ?? 5));

  res.json({ userId, taskCount: tasks.length, criticalCount: tasks.filter((t: Record<string, unknown>) => t.priority === "critical").length, highCount: tasks.filter((t: Record<string, unknown>) => t.priority === "high").length, tasks });
});

// ─────────────────────────────────────────────────────────────
// DASHBOARD - DEPARTMENT STATUS
// ─────────────────────────────────────────────────────────────

router.get("/spmo/dashboard/department-status", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const departments = await db.select().from(spmoDepartmentsTable);
  const projects = await db.select().from(spmoProjectsTable);

  const result = await Promise.all(departments.map(async (dept) => {
    const deptProjects = projects.filter((p) => p.departmentId === dept.id);
    const stats = { departmentId: dept.id, departmentName: dept.name, departmentColor: dept.color ?? "#2563EB", totalProjects: deptProjects.length, onTrack: 0, atRisk: 0, delayed: 0, completed: 0, notStarted: 0 };
    for (const p of deptProjects) {
      const milestones = await db.select({ phaseGate: spmoMilestonesTable.phaseGate, status: spmoMilestonesTable.status, progress: spmoMilestonesTable.progress }).from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, p.id));
      const pStats = await projectProgress(p.id);
      const health = computeStatus(pStats.progress, p.startDate, p.targetDate, p.budget, p.budgetSpent, pStats.rawProgress);
      const hs = health.status;
      if (hs === "on_track") stats.onTrack++;
      else if (hs === "at_risk") stats.atRisk++;
      else if (hs === "delayed") stats.delayed++;
      else if (hs === "completed") stats.completed++;
      else stats.notStarted++;
    }
    return stats;
  }));

  res.json(result.filter((d) => d.totalProjects > 0));
});

// ─────────────────────────────────────────────────────────────
// PROJECT ACCESS GRANTS (admin-managed per-project edit rights)
// ─────────────────────────────────────────────────────────────

const PermissionsSchema = z.object({
  canEditDetails:          z.boolean().optional(),
  canManageMilestones:     z.boolean().optional(),
  canSubmitReports:        z.boolean().optional(),
  canManageRisks:          z.boolean().optional(),
  canManageBudget:         z.boolean().optional(),
  canManageDocuments:      z.boolean().optional(),
  canManageActions:        z.boolean().optional(),
  canManageRaci:           z.boolean().optional(),
  canSubmitChangeRequests: z.boolean().optional(),
});

/** GET /spmo/my-project-access — list all projects + per-project permissions for the current user */
router.get("/spmo/my-project-access", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const user = getAuthUser(req);
  if (user?.role === "admin") {
    res.json({ admin: true, grants: [] });
    return;
  }
  const grants = await db
    .select({
      projectId:               spmoProjectAccessTable.projectId,
      canEditDetails:          spmoProjectAccessTable.canEditDetails,
      canManageMilestones:     spmoProjectAccessTable.canManageMilestones,
      canSubmitReports:        spmoProjectAccessTable.canSubmitReports,
      canManageRisks:          spmoProjectAccessTable.canManageRisks,
      canManageBudget:         spmoProjectAccessTable.canManageBudget,
      canManageDocuments:      spmoProjectAccessTable.canManageDocuments,
      canManageActions:        spmoProjectAccessTable.canManageActions,
      canManageRaci:           spmoProjectAccessTable.canManageRaci,
      canSubmitChangeRequests: spmoProjectAccessTable.canSubmitChangeRequests,
    })
    .from(spmoProjectAccessTable)
    .where(eq(spmoProjectAccessTable.userId, userId));
  res.json({ admin: false, grants });
});

/** GET /spmo/projects/:id/access — list users + permissions for a project (admin only) */
router.get("/spmo/projects/:id/access", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const projectId = parseId(req, res);
  if (!projectId) return;
  const grants = await db
    .select()
    .from(spmoProjectAccessTable)
    .where(eq(spmoProjectAccessTable.projectId, projectId))
    .orderBy(asc(spmoProjectAccessTable.grantedAt));
  res.json({ grants });
});

const GrantAccessBody = z.object({
  userId: z.string().min(1),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
}).merge(PermissionsSchema);

/** POST /spmo/projects/:id/access — grant a user edit rights with specific permissions (admin only) */
router.post("/spmo/projects/:id/access", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const projectId = parseId(req, res);
  if (!projectId) return;
  const parsed = GrantAccessBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const admin = getAuthUser(req);
  const adminName = getUserDisplayName(admin);

  const [project] = await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable).where(eq(spmoProjectsTable.id, projectId)).limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { userId: targetUserId, userName, userEmail, ...perms } = parsed.data;

  const [grant] = await db
    .insert(spmoProjectAccessTable)
    .values({
      projectId,
      userId: targetUserId,
      userName: userName ?? null,
      userEmail: userEmail ?? null,
      grantedById: admin!.id,
      grantedByName: adminName,
      ...perms,
    })
    .onConflictDoUpdate({
      target: [spmoProjectAccessTable.projectId, spmoProjectAccessTable.userId],
      set: {
        userName: userName ?? null,
        userEmail: userEmail ?? null,
        grantedById: admin!.id,
        grantedByName: adminName,
        grantedAt: new Date(),
        ...perms,
      },
    })
    .returning();

  res.status(201).json(grant);
});

/** PATCH /spmo/projects/:id/access/:userId — update permission flags for an existing grant (admin only) */
router.patch("/spmo/projects/:id/access/:userId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const projectId = parseId(req, res);
  if (!projectId) return;
  const { userId: targetUserId } = req.params;
  if (!targetUserId) { res.status(400).json({ error: "Missing userId" }); return; }

  const parsed = PermissionsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Filter out undefined values — only update what was sent
  const updates: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No permission fields provided" });
    return;
  }

  const [grant] = await db
    .update(spmoProjectAccessTable)
    .set(updates)
    .where(and(eq(spmoProjectAccessTable.projectId, projectId), eq(spmoProjectAccessTable.userId, targetUserId)))
    .returning();

  if (!grant) { res.status(404).json({ error: "Grant not found" }); return; }
  res.json(grant);
});

/** DELETE /spmo/projects/:id/access/:userId — revoke edit rights from a user (admin only) */
router.delete("/spmo/projects/:id/access/:userId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const projectId = parseId(req, res);
  if (!projectId) return;
  const { userId: targetUserId } = req.params;
  if (!targetUserId) { res.status(400).json({ error: "Missing userId" }); return; }

  await db
    .delete(spmoProjectAccessTable)
    .where(and(eq(spmoProjectAccessTable.projectId, projectId), eq(spmoProjectAccessTable.userId, targetUserId)));

  res.json({ ok: true });
});

export default router;
