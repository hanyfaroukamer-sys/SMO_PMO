import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
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
  try {
    const deps = await db
      .select()
      .from(spmoDependenciesTable)
      .orderBy(spmoDependenciesTable.createdAt);

    const enriched = await Promise.all(
      deps.map(async (dep) => {
        let sourceName = "";
        let sourceProjectName = "";
        let targetName = "";
        let targetProjectName = "";

        if (dep.sourceType === "milestone") {
          const ms = await db
            .select({ name: spmoMilestonesTable.name, projectId: spmoMilestonesTable.projectId })
            .from(spmoMilestonesTable)
            .where(eq(spmoMilestonesTable.id, dep.sourceId))
            .limit(1);
          if (ms[0]) {
            sourceName = ms[0].name;
            const proj = await db
              .select({ name: spmoProjectsTable.name })
              .from(spmoProjectsTable)
              .where(eq(spmoProjectsTable.id, ms[0].projectId))
              .limit(1);
            sourceProjectName = proj[0]?.name ?? "";
          }
        } else {
          const proj = await db
            .select({ name: spmoProjectsTable.name })
            .from(spmoProjectsTable)
            .where(eq(spmoProjectsTable.id, dep.sourceId))
            .limit(1);
          sourceName = proj[0]?.name ?? "";
          sourceProjectName = proj[0]?.name ?? "";
        }

        if (dep.targetType === "milestone") {
          const ms = await db
            .select({ name: spmoMilestonesTable.name, projectId: spmoMilestonesTable.projectId })
            .from(spmoMilestonesTable)
            .where(eq(spmoMilestonesTable.id, dep.targetId))
            .limit(1);
          if (ms[0]) {
            targetName = ms[0].name;
            const proj = await db
              .select({ name: spmoProjectsTable.name })
              .from(spmoProjectsTable)
              .where(eq(spmoProjectsTable.id, ms[0].projectId))
              .limit(1);
            targetProjectName = proj[0]?.name ?? "";
          }
        } else {
          const proj = await db
            .select({ name: spmoProjectsTable.name })
            .from(spmoProjectsTable)
            .where(eq(spmoProjectsTable.id, dep.targetId))
            .limit(1);
          targetName = proj[0]?.name ?? "";
          targetProjectName = proj[0]?.name ?? "";
        }

        return {
          ...dep,
          sourceName,
          sourceProjectName,
          targetName,
          targetProjectName,
        };
      }),
    );

    res.json({ dependencies: enriched });
  } catch (err) {
    console.error("GET /spmo/dependencies error:", err);
    res.status(500).json({ error: "Failed to fetch dependencies" });
  }
});

// GET /spmo/api/spmo/dependencies/resolve — resolve single target
router.get("/spmo/dependencies/resolve", async (req, res): Promise<void> => {
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
    console.error("GET /spmo/dependencies/resolve error:", err);
    res.status(500).json({ error: "Failed to resolve dependencies" });
  }
});

// GET /spmo/api/spmo/dependencies/resolve-project — batch resolve all milestones in a project
router.get("/spmo/dependencies/resolve-project", async (req, res): Promise<void> => {
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
    console.error("GET /spmo/dependencies/resolve-project error:", err);
    res.status(500).json({ error: "Failed to resolve project dependencies" });
  }
});

// GET /spmo/api/spmo/dependencies/cascade — cascade impact
router.get("/spmo/dependencies/cascade", async (req, res): Promise<void> => {
  try {
    const sourceId = parseInt(req.query.sourceId as string);
    if (isNaN(sourceId)) {
      res.status(400).json({ error: "sourceId required" });
      return;
    }
    const result = await analyzeCascade(sourceId);
    res.json(result);
  } catch (err) {
    console.error("GET /spmo/dependencies/cascade error:", err);
    res.status(500).json({ error: "Failed to analyze cascade" });
  }
});

// POST /spmo/api/spmo/dependencies — create
router.post("/spmo/dependencies", async (req, res): Promise<void> => {
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

    // Insert
    const inserted = await db
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
      await db
        .update(spmoMilestonesTable)
        .set({ depStatus: resolution.status })
        .where(eq(spmoMilestonesTable.id, targetId));
    } else {
      await db
        .update(spmoProjectsTable)
        .set({ depStatus: resolution.status })
        .where(eq(spmoProjectsTable.id, targetId));
    }

    res.status(201).json(inserted[0]);
  } catch (err) {
    console.error("POST /spmo/dependencies error:", err);
    res.status(500).json({ error: "Failed to create dependency" });
  }
});

// DELETE /spmo/api/spmo/dependencies/:id
router.delete("/spmo/dependencies/:id", async (req, res): Promise<void> => {
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

    await db.delete(spmoDependenciesTable).where(eq(spmoDependenciesTable.id, id));

    // Recalculate dep_status for the target after deletion
    const resolution = await resolveDependencies(dep[0].targetId, dep[0].targetType as "milestone" | "project");
    if (dep[0].targetType === "milestone") {
      await db
        .update(spmoMilestonesTable)
        .set({ depStatus: resolution.status })
        .where(eq(spmoMilestonesTable.id, dep[0].targetId));
    } else {
      await db
        .update(spmoProjectsTable)
        .set({ depStatus: resolution.status })
        .where(eq(spmoProjectsTable.id, dep[0].targetId));
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /spmo/dependencies/:id error:", err);
    res.status(500).json({ error: "Failed to delete dependency" });
  }
});

export default router;
