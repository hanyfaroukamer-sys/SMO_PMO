import { z } from "zod";
import type { IRouter } from "express";
import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoProgrammeConfigTable,
  spmoProjectAccessTable,
} from "@workspace/db";
import { usersTable } from "@workspace/db";
import {
  UpdateSpmoUserRoleParams,
  UpdateSpmoUserRoleBody,
} from "@workspace/api-zod";
import { logSpmoActivity } from "../lib/spmo-activity";
import {
  requireAdmin,
  requireAuth,
  getAuthUser,
  getUserDisplayName,
  parseId,
  invalidateOverviewCache,
} from "./spmo";

// ─────────────────────────────────────────────────────────────
// GLOBAL AUTO-WEIGHT (admin only — resets ALL weights across ALL levels)
// ─────────────────────────────────────────────────────────────

function registerAutoWeight(router: IRouter) {
  router.post("/spmo/admin/auto-weight-all", async (req, res) => {
    // Admin only
    if (!requireAdmin(req, res)) return;
    const userId = getAuthUser(req)?.id ?? "";
    const user = getAuthUser(req);

    try {
      // Step 1: Reset all milestone weights to 0 (triggers effortDays/duration-based auto-weight on next load)
      await db.update(spmoMilestonesTable).set({ weight: 0, updatedAt: new Date() });

      // Step 2: Reset all project weights to 0 (triggers budget/effort cascade)
      await db.update(spmoProjectsTable).set({ weight: 0, updatedAt: new Date() });

      // Step 3: Reset all initiative weights to 0 (triggers budget cascade)
      await db.update(spmoInitiativesTable).set({ weight: 0, updatedAt: new Date() });

      // Step 4: Reset all pillar weights to 0 (triggers equal/budget cascade)
      await db.update(spmoPillarsTable).set({ weight: 0, updatedAt: new Date() });

      // Step 5: Now auto-compute milestone weights per project using effortDays/duration
      const allProjects = await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable);
      let milestonesUpdated = 0;

      for (const project of allProjects) {
        const allMilestones = await db.select().from(spmoMilestonesTable)
          .where(eq(spmoMilestonesTable.projectId, project.id));

        if (allMilestones.length === 0) continue;

        // Filter out execution_placeholder when custom milestones exist (same logic as GET endpoints)
        const isExecPlaceholder = (m: typeof allMilestones[0]) =>
          (m.phaseGate as string) === "execution_placeholder" ||
          (m.phaseGate === null && /^Execution\s*[&+]\s*Delivery/i.test(m.name));
        const customMilestones = allMilestones.filter((m) => !m.phaseGate && !isExecPlaceholder(m));
        const hasCustom = customMilestones.length > 0;
        const milestones = hasCustom ? allMilestones.filter((m) => !isExecPlaceholder(m)) : allMilestones;

        // Set hidden placeholder weights to 0 so they don't interfere
        if (hasCustom) {
          const hiddenIds = allMilestones.filter((m) => isExecPlaceholder(m)).map((m) => m.id);
          for (const hId of hiddenIds) {
            await db.update(spmoMilestonesTable).set({ weight: 0, updatedAt: new Date() }).where(eq(spmoMilestonesTable.id, hId));
          }
        }

        if (milestones.length === 0) continue;

        // Weight cascade: effortDays → duration (dueDate - startDate) → equal
        // Uses largest-remainder method to ensure weights sum to exactly 100

        const computeWeights = (items: { id: number; value: number }[]): Map<number, number> => {
          const total = items.reduce((s, i) => s + i.value, 0);
          if (total === 0) {
            // Equal weight
            const eqW = Math.floor(100 / items.length);
            const rem = 100 - eqW * items.length;
            const result = new Map<number, number>();
            items.forEach((item, i) => result.set(item.id, i < rem ? eqW + 1 : eqW));
            return result;
          }
          // Largest-remainder method (Hare quota) — guarantees sum = 100
          const exact = items.map(i => ({ id: i.id, exact: (i.value / total) * 100 }));
          const floored = exact.map(e => ({ id: e.id, floor: Math.floor(e.exact), rem: e.exact - Math.floor(e.exact) }));
          let remainder = 100 - floored.reduce((s, e) => s + e.floor, 0);
          floored.sort((a, b) => b.rem - a.rem);
          const result = new Map<number, number>();
          floored.forEach((e, i) => result.set(e.id, e.floor + (i < remainder ? 1 : 0)));
          return result;
        };

        let weights: Map<number, number>;
        const totalEffort = milestones.reduce((s, m) => s + (m.effortDays ?? 0), 0);
        const allHaveEffort = milestones.every(m => (m.effortDays ?? 0) > 0);

        if (allHaveEffort && totalEffort > 0) {
          weights = computeWeights(milestones.map(m => ({ id: m.id, value: m.effortDays ?? 0 })));
        } else {
          // Try duration from dates
          const durations = milestones.map(m => {
            if (m.startDate && m.dueDate) {
              return { id: m.id, value: Math.max(1, Math.round((new Date(m.dueDate).getTime() - new Date(m.startDate).getTime()) / 86400000)) };
            }
            return { id: m.id, value: 0 };
          });
          const allHaveDates = durations.every(d => d.value > 0);
          const totalDuration = durations.reduce((s, d) => s + d.value, 0);

          if (allHaveDates && totalDuration > 0) {
            weights = computeWeights(durations);
          } else {
            // Equal weight — all milestones get same share
            weights = computeWeights(milestones.map(m => ({ id: m.id, value: 1 })));
          }
        }

        // Verify weights sum to 100 — if not, force equal distribution
        const weightSum = [...weights.values()].reduce((s, w) => s + w, 0);
        if (Math.abs(weightSum - 100) > 1) {
          // Force equal distribution as safety net
          const eqW = Math.floor(100 / milestones.length);
          const rem = 100 - eqW * milestones.length;
          weights = new Map();
          milestones.forEach((m, i) => weights.set(m.id, i < rem ? eqW + 1 : eqW));
        }

        // Apply weights
        for (const [msId, weight] of weights) {
          await db.update(spmoMilestonesTable).set({ weight, updatedAt: new Date() }).where(eq(spmoMilestonesTable.id, msId));
          milestonesUpdated++;
        }
      }

      // Verify all projects have visible milestone weights summing to 100
      let projectsFixed = 0;
      const problemProjects: string[] = [];
      for (const project of allProjects) {
        const allMs = await db.select({ id: spmoMilestonesTable.id, weight: spmoMilestonesTable.weight, name: spmoMilestonesTable.name, phaseGate: spmoMilestonesTable.phaseGate })
          .from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, project.id));
        if (allMs.length === 0) continue;
        // Apply same execution placeholder filter
        const isEP = (m: typeof allMs[0]) =>
          (m.phaseGate as string) === "execution_placeholder" ||
          (m.phaseGate === null && /^Execution\s*[&+]\s*Delivery/i.test(m.name));
        const hasCustomMs = allMs.some((m) => !m.phaseGate && !isEP(m));
        const ms = hasCustomMs ? allMs.filter((m) => !isEP(m)) : allMs;
        if (ms.length === 0) continue;
        const sum = ms.reduce((s, m) => s + (m.weight ?? 0), 0);
        if (Math.abs(sum - 100) > 1) {
          // Force equal distribution on visible milestones only
          const eqW = Math.floor(100 / ms.length);
          const rem = 100 - eqW * ms.length;
          for (let i = 0; i < ms.length; i++) {
            const w = i < rem ? eqW + 1 : eqW;
            await db.update(spmoMilestonesTable).set({ weight: w, updatedAt: new Date() }).where(eq(spmoMilestonesTable.id, ms[i].id));
          }
          projectsFixed++;
          problemProjects.push(`P${project.id}: was ${sum}%, fixed to 100%`);
        }
      }

      // Invalidate overview cache
      invalidateOverviewCache();

      // Log activity
      await logSpmoActivity(userId, getUserDisplayName(user), "updated", "programme", 0, "Global Auto-Weight",
        { action: "auto_weight_all", milestonesUpdated, projectsReset: allProjects.length, projectsFixed });

      res.json({
        success: true,
        message: `Auto-weight complete. ${milestonesUpdated} milestones weighted across ${allProjects.length} projects.${projectsFixed > 0 ? ` Fixed ${projectsFixed} projects with incorrect totals.` : " All projects verified at 100%."}`,
        stats: { milestonesUpdated, projectsReset: allProjects.length, projectsFixed, problemProjects: problemProjects.slice(0, 10) }
      });
    } catch (err: any) {
      req.log?.error?.({ err }, "Global auto-weight failed");
      res.status(500).json({ error: err.message ?? "Auto-weight failed" });
    }
  });
}

// ─────────────────────────────────────────────────────────────
// GLOBAL SEARCH (Cmd+K — searches projects, milestones, KPIs, risks, documents)
// ─────────────────────────────────────────────────────────────

function registerGlobalSearch(router: IRouter) {
  router.get("/spmo/search", async (req, res) => {
    const userId = await requireAuth(req, res);
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
}

// ─────────────────────────────────────────────────────────────
// USER SEARCH (for @ tagging in action items — any authenticated user)
// ─────────────────────────────────────────────────────────────

function registerUserSearch(router: IRouter) {
  router.get("/spmo/users/search", async (req, res) => {
    const userId = await requireAuth(req, res);
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
}

// ─────────────────────────────────────────────────────────────
// ADMIN: DIAGNOSTICS
// ─────────────────────────────────────────────────────────────

const SERVER_START_TIME = Date.now();

function registerDiagnostics(router: IRouter) {
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
}

// ─────────────────────────────────────────────────────────────
// ADMIN: USER MANAGEMENT
// ─────────────────────────────────────────────────────────────

function registerUserManagement(router: IRouter) {
  router.get("/spmo/admin/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
        blocked: usersTable.blocked,
        blockedAt: usersTable.blockedAt,
        blockedBy: usersTable.blockedBy,
        blockedReason: usersTable.blockedReason,
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

  // Block user (admin only)
  router.post("/spmo/admin/users/:userId/block", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const userId = req.params.userId;
    if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }

    const currentAdmin = getAuthUser(req);
    if (currentAdmin?.id === userId) {
      res.status(400).json({ error: "You cannot block yourself" });
      return;
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason : null;

    const [updated] = await db
      .update(usersTable)
      .set({
        blocked: true,
        blockedAt: new Date(),
        blockedBy: currentAdmin?.id ?? null,
        blockedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated) { res.status(404).json({ error: "User not found" }); return; }

    res.json({ success: true, id: updated.id, blocked: true });
  });

  // Unblock user (admin only)
  router.post("/spmo/admin/users/:userId/unblock", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const userId = req.params.userId;
    if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }

    const [updated] = await db
      .update(usersTable)
      .set({
        blocked: false,
        blockedAt: null,
        blockedBy: null,
        blockedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated) { res.status(404).json({ error: "User not found" }); return; }

    res.json({ success: true, id: updated.id, blocked: false });
  });
}

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

const GrantAccessBody = z.object({
  userId: z.string().min(1),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
}).merge(PermissionsSchema);

function registerProjectAccessGrants(router: IRouter) {
  /** GET /spmo/my-project-access — list all projects + per-project permissions for the current user */
  router.get("/spmo/my-project-access", async (req, res) => {
    const userId = await requireAuth(req, res);
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
}

// ─────────────────────────────────────────────────────────────
// Register all admin routes
// ─────────────────────────────────────────────────────────────

export function registerAdminRoutes(router: IRouter) {
  registerAutoWeight(router);
  registerGlobalSearch(router);
  registerUserSearch(router);
  registerDiagnostics(router);
  registerUserManagement(router);
  registerProjectAccessGrants(router);
}
