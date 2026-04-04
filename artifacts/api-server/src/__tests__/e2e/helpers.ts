/**
 * E2E test helpers — shared utilities for full-stack HTTP tests.
 *
 * Injects a mock authenticated user onto `req.user` by inserting
 * a test middleware before all routes.  This avoids OIDC but still
 * exercises all downstream auth checks (requireAuth, requireRole,
 * checkProjectPerm).
 */
import express, { type Express } from "express";
import request from "supertest";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoRisksTable,
  spmoKpisTable,
  spmoDepartmentsTable,
  spmoBudgetTable,
  spmoProcurementTable,
  spmoDocumentsTable,
  spmoActionsTable,
  spmoEvidenceTable,
  spmoRaciTable,
  spmoChangeRequestsTable,
  spmoMitigationsTable,
  spmoKpiMeasurementsTable,
  spmoProgrammeConfigTable,
  spmoProjectAccessTable,
  spmoActivityLogTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

// ── Mock user profiles ──────────────────────────────────────────
export const ADMIN_USER = {
  id: "e2e-admin-001",
  email: "admin@e2e-test.local",
  firstName: "E2E",
  lastName: "Admin",
  role: "admin",
};

export const PM_USER = {
  id: "e2e-pm-001",
  email: "pm@e2e-test.local",
  firstName: "E2E",
  lastName: "ProjectManager",
  role: "project-manager",
};

export const APPROVER_USER = {
  id: "e2e-approver-001",
  email: "approver@e2e-test.local",
  firstName: "E2E",
  lastName: "Approver",
  role: "approver",
};

export const VIEWER_USER = {
  id: "e2e-viewer-001",
  email: "viewer@e2e-test.local",
  firstName: "E2E",
  lastName: "Viewer",
  role: "viewer",
};

// ── Build test app with injected user ───────────────────────────
let _cachedApp: Express | null = null;
let _currentUser = ADMIN_USER;

export function setCurrentUser(user: typeof ADMIN_USER) {
  _currentUser = user;
}

export async function getTestApp(): Promise<Express> {
  if (_cachedApp) return _cachedApp;

  // We build a fresh Express app that injects our test user
  // before any route handler runs.
  const testApp = express();

  // Inject mock user before all routes
  testApp.use((req, _res, next) => {
    (req as any).user = { ..._currentUser };
    (req as any).isAuthenticated = () => true;
    next();
  });

  // JSON body parser
  testApp.use(express.json({ limit: "1mb" }));
  testApp.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Mount the real router (same as app.ts)
  const { default: router } = await import("../../routes/index.js");
  testApp.use("/api", router);

  _cachedApp = testApp;
  return testApp;
}

export function api() {
  if (!_cachedApp) throw new Error("Call getTestApp() in beforeAll first");
  return request(_cachedApp);
}

// ── Seed helpers ────────────────────────────────────────────────
const uid = () => `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export interface TestSeeds {
  pillarId: number;
  pillar2Id: number;
  initiativeId: number;
  initiative2Id: number;
  projectId: number;
  project2Id: number;
  departmentId: number;
  milestoneId: number;
  milestone2Id: number;
}

let _seeds: TestSeeds | null = null;

export async function seedTestData(): Promise<TestSeeds> {
  if (_seeds) return _seeds;

  // Department
  const [dept] = await db.insert(spmoDepartmentsTable).values({
    name: uid(),
    description: "E2E test department",
    color: "#3B82F6",
  }).returning();

  // Pillars — use weight 0 so multiple parallel test workers don't push total over 100%
  const [pillar] = await db.insert(spmoPillarsTable).values({
    name: uid(),
    description: "E2E test pillar",
    weight: 0,
  }).returning();

  const [pillar2] = await db.insert(spmoPillarsTable).values({
    name: uid(),
    description: "E2E test pillar 2",
    weight: 0,
  }).returning();

  // Initiatives
  const [init] = await db.insert(spmoInitiativesTable).values({
    pillarId: pillar.id,
    name: uid(),
    ownerId: ADMIN_USER.id,
    startDate: "2025-01-01",
    targetDate: "2026-12-31",
    budget: 10_000_000,
  }).returning();

  const [init2] = await db.insert(spmoInitiativesTable).values({
    pillarId: pillar2.id,
    name: uid(),
    ownerId: PM_USER.id,
    startDate: "2025-01-01",
    targetDate: "2026-12-31",
    budget: 5_000_000,
  }).returning();

  // Projects
  const [project] = await db.insert(spmoProjectsTable).values({
    initiativeId: init.id,
    departmentId: dept.id,
    name: uid(),
    ownerId: PM_USER.id,
    ownerName: "E2E ProjectManager",
    startDate: "2025-01-01",
    targetDate: "2026-12-31",
    budget: 5_000_000,
    weight: 60,
  }).returning();

  const [project2] = await db.insert(spmoProjectsTable).values({
    initiativeId: init2.id,
    departmentId: dept.id,
    name: uid(),
    ownerId: ADMIN_USER.id,
    ownerName: "E2E Admin",
    startDate: "2025-03-01",
    targetDate: "2026-06-30",
    budget: 2_000_000,
    weight: 40,
  }).returning();

  // Milestones — weights sum to 70 (leaving room for tests to add milestones with weight up to 30)
  const [ms] = await db.insert(spmoMilestonesTable).values({
    projectId: project.id,
    name: uid(),
    weight: 40,
    progress: 50,
    status: "in_progress",
    startDate: "2025-01-01",
    dueDate: "2025-06-30",
  }).returning();

  const [ms2] = await db.insert(spmoMilestonesTable).values({
    projectId: project.id,
    name: uid(),
    weight: 30,
    progress: 0,
    status: "not_started",
    startDate: "2025-07-01",
    dueDate: "2025-12-31",
  }).returning();

  _seeds = {
    pillarId: pillar.id,
    pillar2Id: pillar2.id,
    initiativeId: init.id,
    initiative2Id: init2.id,
    projectId: project.id,
    project2Id: project2.id,
    departmentId: dept.id,
    milestoneId: ms.id,
    milestone2Id: ms2.id,
  };
  return _seeds;
}

export async function cleanupTestData() {
  if (!_seeds) return;
  const s = _seeds;

  // Delete in dependency order
  const projectIds = [s.projectId, s.project2Id];
  const milestoneIds = [s.milestoneId, s.milestone2Id];

  await db.delete(spmoEvidenceTable).where(inArray(spmoEvidenceTable.milestoneId, milestoneIds)).catch(() => {});
  await db.delete(spmoKpiMeasurementsTable).where(sql`1=1`).catch(() => {});
  await db.delete(spmoMitigationsTable).where(sql`1=1`).catch(() => {});
  await db.delete(spmoRaciTable).where(inArray(spmoRaciTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoActionsTable).where(inArray(spmoActionsTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoChangeRequestsTable).where(inArray(spmoChangeRequestsTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoDocumentsTable).where(inArray(spmoDocumentsTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoBudgetTable).where(inArray(spmoBudgetTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoProcurementTable).where(inArray(spmoProcurementTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoRisksTable).where(inArray(spmoRisksTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoMilestonesTable).where(inArray(spmoMilestonesTable.projectId, projectIds)).catch(() => {});
  await db.delete(spmoProjectsTable).where(inArray(spmoProjectsTable.id, projectIds)).catch(() => {});
  await db.delete(spmoInitiativesTable).where(inArray(spmoInitiativesTable.id, [s.initiativeId, s.initiative2Id])).catch(() => {});
  await db.delete(spmoPillarsTable).where(inArray(spmoPillarsTable.id, [s.pillarId, s.pillar2Id])).catch(() => {});
  await db.delete(spmoDepartmentsTable).where(eq(spmoDepartmentsTable.id, s.departmentId)).catch(() => {});

  // Clean activity log entries from E2E users
  await db.delete(spmoActivityLogTable).where(
    inArray(spmoActivityLogTable.userId, [ADMIN_USER.id, PM_USER.id, APPROVER_USER.id])
  ).catch(() => {});

  _seeds = null;
  _cachedApp = null;
}
