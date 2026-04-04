import { Router } from "express";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  spmoDependenciesTable,
  spmoMilestonesTable,
  spmoProjectsTable,
} from "@workspace/db";
import {
  detectCycle,
  resolveDependencies,
  recalculateDownstreamStatuses,
  analyzeCascade,
} from "../lib/dep-engine";

const router = Router();

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

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

const CreateDepBody = z.object({
  sourceType: z.enum(["milestone", "project"]),
  sourceId: z.number().int(),
  targetType: z.enum(["milestone", "project"]),
  targetId: z.number().int(),
  depType: z.enum(["ms-ms", "ms-proj", "proj-proj"]),
  sourceThreshold: z.number().optional().default(100),
  lagDays: z.number().int().optional().default(0),
  isHard: z.boolean().optional().default(true),
  notes: z.string().optional(),
});

// GET /spmo/api/spmo/dependencies — list all
router.get("/spmo/dependencies", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const deps = await db
      .select()
      .from(spmoDependenciesTable)
      .orderBy(spmoDependenciesTable.createdAt);

    // Batch-load all milestones and projects upfront (N+1 fix)
    const allMilestoneIds = [...new Set(deps.flatMap(d =>
      [d.sourceType === "milestone" ? d.sourceId : null, d.targetType === "milestone" ? d.targetId : null]
      .filter(Boolean) as number[]))];
    const allProjectIds = [...new Set(deps.flatMap(d =>
      [d.sourceType === "project" ? d.sourceId : null, d.targetType === "project" ? d.targetId : null]
      .filter(Boolean) as number[]))];

    const milestones = allMilestoneIds.length > 0
      ? await db.select({ id: spmoMilestonesTable.id, name: spmoMilestonesTable.name, projectId: spmoMilestonesTable.projectId })
        .from(spmoMilestonesTable).where(inArray(spmoMilestonesTable.id, allMilestoneIds))
      : [] as { id: number; name: string; projectId: number }[];
    // Add milestone project IDs to allProjectIds
    milestones.forEach((m: { id: number; name: string; projectId: number }) => { if (!allProjectIds.includes(m.projectId)) allProjectIds.push(m.projectId); });

    const projects = allProjectIds.length > 0
      ? await db.select({ id: spmoProjectsTable.id, name: spmoProjectsTable.name })
        .from(spmoProjectsTable).where(inArray(spmoProjectsTable.id, allProjectIds))
      : [] as { id: number; name: string }[];

    const msMap = new Map(milestones.map((m: { id: number; name: string; projectId: number }) => [m.id, m] as const));
    const projMap = new Map(projects.map((p: { id: number; name: string }) => [p.id, p] as const));

    // Enrich in-memory instead of per-dep queries
    const enriched = deps.map((dep) => {
      let sourceName = "";
      let sourceProjectName = "";
      let targetName = "";
      let targetProjectName = "";

      if (dep.sourceType === "milestone") {
        const ms = msMap.get(dep.sourceId);
        if (ms) {
          sourceName = ms.name;
          const proj = projMap.get(ms.projectId);
          sourceProjectName = proj?.name ?? "";
        }
      } else {
        const proj = projMap.get(dep.sourceId);
        sourceName = proj?.name ?? "";
        sourceProjectName = proj?.name ?? "";
      }

      if (dep.targetType === "milestone") {
        const ms = msMap.get(dep.targetId);
        if (ms) {
          targetName = ms.name;
          const proj = projMap.get(ms.projectId);
          targetProjectName = proj?.name ?? "";
        }
      } else {
        const proj = projMap.get(dep.targetId);
        targetName = proj?.name ?? "";
        targetProjectName = proj?.name ?? "";
      }

      return {
        ...dep,
        sourceName,
        sourceProjectName,
        targetName,
        targetProjectName,
      };
    });

    res.json({ dependencies: enriched });
  } catch (err) {
    req.log.error({ err }, "GET /spmo/dependencies error");
    res.status(500).json({ error: "Failed to fetch dependencies" });
  }
});

// GET /spmo/api/spmo/dependencies/resolve — resolve single target
router.get("/spmo/dependencies/resolve", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const targetId = parseInt(req.query.targetId as string);
    const targetType = req.query.targetType as "milestone" | "project";

    if (isNaN(targetId) || !targetType) {
      res.status(400).json({ error: "targetId and targetType required" });
      return;
    }

    const resolution = await resolveDependencies(targetId, targetType);
    res.json(resolution);
  } catch (err) {
    req.log.error({ err }, "GET /spmo/dependencies/resolve error");
    res.status(500).json({ error: "Failed to resolve dependencies" });
  }
});

// GET /spmo/api/spmo/dependencies/resolve-project — batch resolve all milestones in a project
router.get("/spmo/dependencies/resolve-project", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const projectId = parseInt(req.query.projectId as string);
    if (isNaN(projectId)) {
      res.status(400).json({ error: "projectId required" });
      return;
    }

    const milestones = await db
      .select({ id: spmoMilestonesTable.id })
      .from(spmoMilestonesTable)
      .where(eq(spmoMilestonesTable.projectId, projectId));

    const resolutions: Record<number, Awaited<ReturnType<typeof resolveDependencies>>> = {};
    await Promise.all(
      milestones.map(async (ms) => {
        resolutions[ms.id] = await resolveDependencies(ms.id, "milestone");
      }),
    );

    res.json({ resolutions });
  } catch (err) {
    req.log.error({ err }, "GET /spmo/dependencies/resolve-project error");
    res.status(500).json({ error: "Failed to resolve project dependencies" });
  }
});

// GET /spmo/api/spmo/dependencies/cascade — cascade impact
router.get("/spmo/dependencies/cascade", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const sourceId = parseInt(req.query.sourceId as string);
    if (isNaN(sourceId)) {
      res.status(400).json({ error: "sourceId required" });
      return;
    }
    const result = await analyzeCascade(sourceId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "GET /spmo/dependencies/cascade error");
    res.status(500).json({ error: "Failed to analyze cascade" });
  }
});

// POST /spmo/api/spmo/dependencies — create
router.post("/spmo/dependencies", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  try {
    const parsed = CreateDepBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.errors });
      return;
    }

    const { sourceType, sourceId, targetType, targetId, depType, sourceThreshold, lagDays, isHard, notes } = parsed.data;

    // Validate source exists
    if (sourceType === "milestone") {
      const rows = await db
        .select({ id: spmoMilestonesTable.id })
        .from(spmoMilestonesTable)
        .where(eq(spmoMilestonesTable.id, sourceId))
        .limit(1);
      if (!rows[0]) {
        res.status(400).json({ error: "Source milestone not found" });
        return;
      }
    } else {
      const rows = await db
        .select({ id: spmoProjectsTable.id })
        .from(spmoProjectsTable)
        .where(eq(spmoProjectsTable.id, sourceId))
        .limit(1);
      if (!rows[0]) {
        res.status(400).json({ error: "Source project not found" });
        return;
      }
    }

    // Validate target exists
    if (targetType === "milestone") {
      const rows = await db
        .select({ id: spmoMilestonesTable.id })
        .from(spmoMilestonesTable)
        .where(eq(spmoMilestonesTable.id, targetId))
        .limit(1);
      if (!rows[0]) {
        res.status(400).json({ error: "Target milestone not found" });
        return;
      }
    } else {
      const rows = await db
        .select({ id: spmoProjectsTable.id })
        .from(spmoProjectsTable)
        .where(eq(spmoProjectsTable.id, targetId))
        .limit(1);
      if (!rows[0]) {
        res.status(400).json({ error: "Target project not found" });
        return;
      }
    }

    // Same node check
    if (sourceId === targetId && sourceType === targetType) {
      res.status(400).json({ error: "Source and target cannot be the same" });
      return;
    }

    // Duplicate check
    const existing = await db
      .select({ id: spmoDependenciesTable.id })
      .from(spmoDependenciesTable)
      .where(
        and(
          eq(spmoDependenciesTable.sourceId, sourceId),
          eq(spmoDependenciesTable.targetId, targetId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      res.status(409).json({ error: "Dependency already exists" });
      return;
    }

    // Cycle detection
    const wouldCycle = await detectCycle(sourceId, targetId);
    if (wouldCycle) {
      res.status(422).json({ error: "Cannot add: this would create a circular dependency." });
      return;
    }

    // Insert + recalculate in a transaction
    await db.transaction(async (tx: any) => {
      const inserted = await tx
        .insert(spmoDependenciesTable)
        .values({
          sourceType,
          sourceId,
          sourceThreshold: sourceThreshold ?? 100,
          targetType,
          targetId,
          depType,
          lagDays: lagDays ?? 0,
          isHard: isHard ?? true,
          notes: notes ?? null,
          createdById: (req as { user?: { id?: string } }).user?.id ?? null,
        })
        .returning();

      // Recalculate dep_status for the target
      const resolution = await resolveDependencies(targetId, targetType);
      if (targetType === "milestone") {
        await tx
          .update(spmoMilestonesTable)
          .set({ depStatus: resolution.status })
          .where(eq(spmoMilestonesTable.id, targetId));
      } else {
        await tx
          .update(spmoProjectsTable)
          .set({ depStatus: resolution.status })
          .where(eq(spmoProjectsTable.id, targetId));
      }

      res.status(201).json(inserted[0]);
    });
  } catch (err) {
    req.log.error({ err }, "POST /spmo/dependencies error");
    res.status(500).json({ error: "Failed to create dependency" });
  }
});

// DELETE /spmo/api/spmo/dependencies/:id
router.delete("/spmo/dependencies/:id", async (req, res): Promise<void> => {
  const userId = requireRole(req, res, "admin", "project-manager");
  if (!userId) return;

  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    // Get the dep before deleting to know the target
    const dep = await db
      .select()
      .from(spmoDependenciesTable)
      .where(eq(spmoDependenciesTable.id, id))
      .limit(1);

    if (!dep[0]) {
      res.status(404).json({ error: "Dependency not found" });
      return;
    }

    // Delete + recalculate in a transaction
    await db.transaction(async (tx: any) => {
      await tx.delete(spmoDependenciesTable).where(eq(spmoDependenciesTable.id, id));

      // Recalculate dep_status for the target after deletion
      const resolution = await resolveDependencies(dep[0].targetId, dep[0].targetType as "milestone" | "project");
      if (dep[0].targetType === "milestone") {
        await tx
          .update(spmoMilestonesTable)
          .set({ depStatus: resolution.status })
          .where(eq(spmoMilestonesTable.id, dep[0].targetId));
      } else {
        await tx
          .update(spmoProjectsTable)
          .set({ depStatus: resolution.status })
          .where(eq(spmoProjectsTable.id, dep[0].targetId));
      }
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /spmo/dependencies/:id error");
    res.status(500).json({ error: "Failed to delete dependency" });
  }
});

export default router;
