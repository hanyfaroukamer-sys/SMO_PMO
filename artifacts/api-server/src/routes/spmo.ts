import { Router, type IRouter } from "express";
import { eq, desc, and, asc, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
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
  type InsertSpmoInitiative,
  type InsertSpmoProject,
  type InsertSpmoMilestone,
  type InsertSpmoMitigation,
  type InsertSpmoProcurement,
  type InsertSpmoDepartment,
} from "@workspace/db";
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

/** Convert a Date to an ISO date string (YYYY-MM-DD) for Drizzle date() columns */
function dateToStr(d: Date | undefined | null): string | undefined | null {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return d as undefined | null;
}

// ─────────────────────────────────────────────────────────────
// Programme Overview
// ─────────────────────────────────────────────────────────────
router.get("/spmo/programme", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

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

  const [config] = await db.select().from(spmoProgrammeConfigTable).where(eq(spmoProgrammeConfigTable.id, 1));
  const programmeName = config?.programmeName ?? "National Transformation Programme";
  const vision = config?.vision ?? null;
  const mission = config?.mission ?? null;

  res.json({
    programmeName,
    vision,
    mission,
    programmeProgress,
    lastUpdated: new Date(),
    pillarSummaries: pillarSummaries.map(({ pillar, progress, ...stats }) => ({
      id: pillar.id,
      name: pillar.name,
      description: pillar.description,
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
  });
});

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

  const [pillar] = await db
    .update(spmoPillarsTable)
    .set(parsed.data)
    .where(eq(spmoPillarsTable.id, params.data.id))
    .returning();

  if (!pillar) {
    res.status(404).json({ error: "Pillar not found" });
    return;
  }

  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "pillar", pillar.id, pillar.name);
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

  if (parsed.data.weight !== undefined) {
    const [existingInit] = await db.select({ pillarId: spmoInitiativesTable.pillarId }).from(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, params.data.id));
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

  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "initiative", initiative.id, initiative.name);
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
      return { ...p, ...stats, computedStatus, healthStatus: computedStatus.status };
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
  const milestones = await db
    .select()
    .from(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.projectId, project.id));

  const milestonesWithEvidence = await Promise.all(
    milestones.map(async (m) => {
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

  const parsed = UpdateSpmoProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { startDate: psd, targetDate: ptd, ...restProjectUpdate } = parsed.data;
  const updateProject = {
    ...restProjectUpdate,
    ...(psd !== undefined && { startDate: dateToStr(psd) as string }),
    ...(ptd !== undefined && { targetDate: dateToStr(ptd) as string }),
  };

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

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "project", project.id, project.name);
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

  const withEvidence = await Promise.all(
    milestones.map(async (m) => {
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

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "created", "milestone", milestone.id, milestone.name);
  res.status(201).json(milestone);
});

router.get("/spmo/milestones/all", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const allMilestones = await db
    .select()
    .from(spmoMilestonesTable)
    .orderBy(desc(spmoMilestonesTable.updatedAt));

  const items = await Promise.all(
    allMilestones.map(async (m) => {
      const evidence = await db.select().from(spmoEvidenceTable).where(eq(spmoEvidenceTable.milestoneId, m.id));
      const [project] = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.id, m.projectId));
      if (!project) return null;
      const [initiative] = await db.select().from(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, project.initiativeId));
      if (!initiative) return null;
      const [pillar] = await db.select().from(spmoPillarsTable).where(eq(spmoPillarsTable.id, initiative.pillarId));
      if (!pillar) return null;
      return { milestone: { ...m, evidence }, project, initiative, pillar };
    })
  );

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

  const parsed = UpdateSpmoMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.weight !== undefined) {
    const [current] = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, params.data.id));
    if (!current) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    const siblings = await db
      .select()
      .from(spmoMilestonesTable)
      .where(
        and(
          eq(spmoMilestonesTable.projectId, current.projectId),
          sql`${spmoMilestonesTable.id} != ${params.data.id}`
        )
      );
    const siblingWeightSum = siblings.reduce((s, m) => s + (m.weight ?? 0), 0);
    if (siblingWeightSum + parsed.data.weight > 100) {
      res.status(400).json({ error: `Milestone weights would exceed 100% (siblings use ${Math.round(siblingWeightSum)}%)` });
      return;
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

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "milestone", milestone.id, milestone.name, { progress: milestone.progress });
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

  const [milestone] = await db
    .delete(spmoMilestonesTable)
    .where(eq(spmoMilestonesTable.id, params.data.id))
    .returning();

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "deleted", "milestone", milestone.id, milestone.name);
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
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  const role = user?.role;
  if (role !== "admin" && role !== "approver") {
    res.status(403).json({ error: "Approver or admin role required" });
    return;
  }

  const params = ApproveSpmoMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  await logSpmoActivity(userId, getUserDisplayName(user), "approved", "milestone", milestone.id, milestone.name);
  res.json(milestone);
});

router.post("/spmo/milestones/:id/reject", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = getAuthUser(req);
  const role = user?.role;
  if (role !== "admin" && role !== "approver") {
    res.status(403).json({ error: "Approver or admin role required" });
    return;
  }

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

  await logSpmoActivity(userId, getUserDisplayName(user), "rejected", "milestone", milestone.id, milestone.name, { reason: parsed.data.reason });
  res.json(milestone);
});

// ─────────────────────────────────────────────────────────────
// Evidence
// ─────────────────────────────────────────────────────────────
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
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = CreateSpmoKpiBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [kpi] = await db.insert(spmoKpisTable).values(parsed.data).returning();
  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "created", "kpi", kpi.id, kpi.name);
  res.status(201).json(kpi);
});

router.put("/spmo/kpis/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
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

  const [kpi] = await db
    .update(spmoKpisTable)
    .set(parsed.data)
    .where(eq(spmoKpisTable.id, params.data.id))
    .returning();

  if (!kpi) {
    res.status(404).json({ error: "KPI not found" });
    return;
  }

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "kpi", kpi.id, kpi.name, { actual: kpi.actual });
  res.json(kpi);
});

router.delete("/spmo/kpis/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
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
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = CreateSpmoRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const riskScore = computeRiskScore(parsed.data.probability, parsed.data.impact);

  const [risk] = await db
    .insert(spmoRisksTable)
    .values({ ...parsed.data, riskScore })
    .returning();

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "created", "risk", risk.id, risk.title);
  res.status(201).json(risk);
});

router.put("/spmo/risks/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
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

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.probability || parsed.data.impact) {
    const [existing] = await db.select().from(spmoRisksTable).where(eq(spmoRisksTable.id, params.data.id));
    if (existing) {
      const prob = parsed.data.probability ?? existing.probability;
      const imp = parsed.data.impact ?? existing.impact;
      updateData.riskScore = computeRiskScore(prob, imp);
    }
  }

  const [risk] = await db
    .update(spmoRisksTable)
    .set(updateData)
    .where(eq(spmoRisksTable.id, params.data.id))
    .returning();

  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }

  const user = getAuthUser(req);
  await logSpmoActivity(userId, getUserDisplayName(user), "updated", "risk", risk.id, risk.title);
  res.json(risk);
});

router.delete("/spmo/risks/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = DeleteSpmoRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [risk] = await db.delete(spmoRisksTable).where(eq(spmoRisksTable.id, params.data.id)).returning();
  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }

  res.json({ success: true });
});

router.post("/spmo/risks/:id/mitigations", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = CreateSpmoMitigationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = UpdateSpmoMitigationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
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

  let entries = await db.select().from(spmoBudgetTable).orderBy(asc(spmoBudgetTable.period));

  if (qp.data.projectId) {
    entries = entries.filter((e) => e.projectId === qp.data.projectId);
  }
  if (qp.data.pillarId) {
    entries = entries.filter((e) => e.pillarId === qp.data.pillarId);
  }

  const totalAllocated = entries.reduce((s, e) => s + e.allocated, 0);
  const totalSpent = entries.reduce((s, e) => s + e.spent, 0);
  const utilizationPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 1000) / 10 : 0;

  res.json({ totalAllocated, totalSpent, utilizationPct, entries });
});

router.post("/spmo/budget", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = CreateSpmoBudgetEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db.insert(spmoBudgetTable).values(parsed.data).returning();
  res.status(201).json(entry);
});

router.put("/spmo/budget/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
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
  const userId = requireAuth(req, res);
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
    if (k.status === "off_track") count++;
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
    if (k.status === "off_track") {
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

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(spmoActivityLogTable);

  const entries = await db
    .select()
    .from(spmoActivityLogTable)
    .orderBy(desc(spmoActivityLogTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ entries, total: totalRow?.count ?? 0 });
});

// ─────────────────────────────────────────────────────────────
// AI: Programme Assessment
// ─────────────────────────────────────────────────────────────
let cachedAssessment: {
  result: unknown;
  cachedAt: Date;
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

router.post("/spmo/ai/assessment", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Use cache if fresh
  if (cachedAssessment && Date.now() - cachedAssessment.cachedAt.getTime() < CACHE_TTL_MS) {
    res.json(cachedAssessment.result);
    return;
  }

  const { programmeProgress, pillarSummaries } = await calcProgrammeProgress();
  const allMilestones = await db.select().from(spmoMilestonesTable);
  const openRisks = await db.select().from(spmoRisksTable).where(eq(spmoRisksTable.status, "open"));
  const offTrackKpis = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.status, "off_track"));

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
    cachedAssessment = { result, cachedAt: new Date() };

    const user = getAuthUser(req);
    await logSpmoActivity(userId, getUserDisplayName(user), "ran_ai_assessment", "programme", 0, "StrategyPMO");

    res.json(result);
  } catch (e) {
    req.log.error({ err: e }, "AI assessment failed");
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
  const userId = requireAuth(req, res);
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
  const userId = requireAuth(req, res);
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
  const userId = requireAuth(req, res);
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

  const [config] = await db.select().from(spmoProgrammeConfigTable).where(eq(spmoProgrammeConfigTable.id, 1));
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

  const existing = await db.select().from(spmoProgrammeConfigTable).where(eq(spmoProgrammeConfigTable.id, 1));
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

export default router;
