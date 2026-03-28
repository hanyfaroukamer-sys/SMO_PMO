import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestApp,
  api,
  setCurrentUser,
  seedTestData,
  cleanupTestData,
  ADMIN_USER,
  PM_USER,
  VIEWER_USER,
  type TestSeeds,
} from "./helpers.js";

describe("Projects & Milestones CRUD E2E", () => {
  let seeds: TestSeeds;

  beforeAll(async () => {
    await getTestApp();
    seeds = await seedTestData();
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── Projects ────────────────────────────────────────────────

  describe("Projects CRUD", () => {
    let createdProjectId: number;

    it("GET /api/spmo/projects - lists all projects", async () => {
      const res = await api().get("/api/spmo/projects");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("projects");
      expect(Array.isArray(res.body.projects)).toBe(true);
      expect(res.body.projects.length).toBeGreaterThanOrEqual(2);
    });

    it("GET /api/spmo/projects?initiativeId= filters by initiative", async () => {
      const res = await api().get(`/api/spmo/projects?initiativeId=${seeds.initiativeId}`);
      expect(res.status).toBe(200);
      for (const p of res.body.projects) {
        expect(p.initiativeId).toBe(seeds.initiativeId);
      }
    });

    it("projects list includes computed fields", async () => {
      const res = await api().get("/api/spmo/projects");
      expect(res.status).toBe(200);
      if (res.body.projects.length > 0) {
        const p = res.body.projects[0];
        expect(p).toHaveProperty("progress");
        expect(p).toHaveProperty("computedStatus");
        expect(p).toHaveProperty("healthStatus");
        expect(p).toHaveProperty("currentPhase");
      }
    });

    it("POST /api/spmo/projects - admin can create a project", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api()
        .post("/api/spmo/projects")
        .send({
          initiativeId: seeds.initiativeId,
          departmentId: seeds.departmentId,
          name: "E2E CRUD Project",
          ownerId: ADMIN_USER.id,
          ownerName: "E2E Admin",
          startDate: "2025-06-01",
          targetDate: "2026-06-30",
          budget: 500_000,
          weight: 0,
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("E2E CRUD Project");
      expect(res.body.initiativeId).toBe(seeds.initiativeId);
      createdProjectId = res.body.id;
    });

    it("POST /api/spmo/projects - auto-creates phase gate milestones", async () => {
      // New project should have 4 default milestones (planning, tendering, execution, closure)
      const res = await api().get(`/api/spmo/projects/${createdProjectId}/milestones`);
      expect(res.status).toBe(200);
      expect(res.body.milestones.length).toBeGreaterThanOrEqual(4);

      const names = res.body.milestones.map((m: any) => m.name);
      expect(names).toContain("Planning & Requirements");
      expect(names).toContain("Tendering & Procurement");
      expect(names).toContain("Closure & Handover");
    });

    it("GET /api/spmo/projects/:id - returns project with milestones", async () => {
      const res = await api().get(`/api/spmo/projects/${seeds.projectId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", seeds.projectId);
      expect(res.body).toHaveProperty("name");
      expect(res.body).toHaveProperty("milestones");
      expect(Array.isArray(res.body.milestones)).toBe(true);
      expect(res.body).toHaveProperty("progress");
    });

    it("GET /api/spmo/projects/:id - returns 404 for non-existent", async () => {
      const res = await api().get("/api/spmo/projects/999999");
      expect(res.status).toBe(404);
    });

    it("PUT /api/spmo/projects/:id - admin can update project", async () => {
      const res = await api()
        .put(`/api/spmo/projects/${createdProjectId}`)
        .send({ name: "E2E CRUD Project Updated", budget: 600_000 });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("E2E CRUD Project Updated");
    });

    it("PM owner can update their own project", async () => {
      // seeds.projectId is owned by PM_USER
      setCurrentUser(PM_USER);
      const res = await api()
        .put(`/api/spmo/projects/${seeds.projectId}`)
        .send({ name: "PM Updated Project" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("PM Updated Project");
      setCurrentUser(ADMIN_USER);
    });

    it("PM non-owner cannot delete project (admin-only)", async () => {
      // seeds.project2Id is owned by ADMIN_USER, PM_USER should get 403
      setCurrentUser(PM_USER);
      const res = await api().delete(`/api/spmo/projects/${seeds.project2Id}`);
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });

    it("viewer cannot create a project", async () => {
      setCurrentUser(VIEWER_USER);
      const res = await api()
        .post("/api/spmo/projects")
        .send({
          initiativeId: seeds.initiativeId,
          name: "Viewer Project",
          startDate: "2025-01-01",
          targetDate: "2026-12-31",
        });
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });

    it("DELETE /api/spmo/projects/:id - admin can delete project", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api().delete(`/api/spmo/projects/${createdProjectId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify gone
      const check = await api().get(`/api/spmo/projects/${createdProjectId}`);
      expect(check.status).toBe(404);
    });
  });

  // ── Milestones ──────────────────────────────────────────────

  describe("Milestones CRUD", () => {
    let createdMilestoneId: number;

    it("GET /api/spmo/projects/:id/milestones - lists milestones for project", async () => {
      const res = await api().get(`/api/spmo/projects/${seeds.projectId}/milestones`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("milestones");
      expect(Array.isArray(res.body.milestones)).toBe(true);
      expect(res.body.milestones.length).toBeGreaterThanOrEqual(2);
    });

    it("milestones include evidence array", async () => {
      const res = await api().get(`/api/spmo/projects/${seeds.projectId}/milestones`);
      expect(res.status).toBe(200);
      for (const m of res.body.milestones) {
        expect(m).toHaveProperty("evidence");
        expect(Array.isArray(m.evidence)).toBe(true);
      }
    });

    it("POST /api/spmo/projects/:id/milestones - admin can create milestone", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api()
        .post(`/api/spmo/projects/${seeds.projectId}/milestones`)
        .send({
          name: "E2E Test Milestone",
          weight: 0,
          progress: 0,
          status: "pending",
          dueDate: "2026-03-31",
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("E2E Test Milestone");
      expect(res.body.projectId).toBe(seeds.projectId);
      createdMilestoneId = res.body.id;
    });

    it("PM owner can create milestones on their project", async () => {
      // seeds.projectId is owned by PM_USER
      setCurrentUser(PM_USER);
      const res = await api()
        .post(`/api/spmo/projects/${seeds.projectId}/milestones`)
        .send({
          name: "PM Milestone",
          weight: 0,
          progress: 0,
          status: "pending",
          dueDate: "2026-04-30",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("PM Milestone");

      // Cleanup: admin deletes it
      setCurrentUser(ADMIN_USER);
      await api().delete(`/api/spmo/milestones/${res.body.id}`);
    });

    it("PUT /api/spmo/milestones/:id - admin can update milestone progress and weight", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api()
        .put(`/api/spmo/milestones/${createdMilestoneId}`)
        .send({ progress: 25, weight: 0 });
      expect(res.status).toBe(200);
      expect(res.body.progress).toBe(25);
    });

    it("PUT /api/spmo/milestones/:id - PM owner can update progress only", async () => {
      // PM_USER owns seeds.projectId and createdMilestoneId is on that project
      setCurrentUser(PM_USER);
      const res = await api()
        .put(`/api/spmo/milestones/${createdMilestoneId}`)
        .send({ progress: 50 });
      expect(res.status).toBe(200);
      expect(res.body.progress).toBe(50);
      setCurrentUser(ADMIN_USER);
    });

    it("PUT /api/spmo/milestones/:id - PM cannot update restricted fields (weight, name, etc.)", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .put(`/api/spmo/milestones/${createdMilestoneId}`)
        .send({ weight: 10 });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/admin/i);
      setCurrentUser(ADMIN_USER);
    });

    it("PUT /api/spmo/milestones/:id - returns 404 for non-existent", async () => {
      const res = await api()
        .put("/api/spmo/milestones/999999")
        .send({ progress: 10 });
      expect(res.status).toBe(404);
    });

    // ── Bulk weight update ────────────────────────────────────

    it("PUT /api/spmo/projects/:id/milestones/weights - bulk update milestone weights", async () => {
      // Get current milestones for the project
      const listRes = await api().get(`/api/spmo/projects/${seeds.projectId}/milestones`);
      expect(listRes.status).toBe(200);
      const milestones = listRes.body.milestones;
      expect(milestones.length).toBeGreaterThan(0);

      // Build weights that sum to 100
      const count = milestones.length;
      const weights = milestones.map((m: any, i: number) => ({
        id: m.id,
        weight: i < count - 1
          ? Math.floor(100 / count)
          : 100 - Math.floor(100 / count) * (count - 1),
      }));

      const res = await api()
        .put(`/api/spmo/projects/${seeds.projectId}/milestones/weights`)
        .send({ weights });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("PUT /api/spmo/projects/:id/milestones/weights - rejects weights not summing to 100", async () => {
      const res = await api()
        .put(`/api/spmo/projects/${seeds.projectId}/milestones/weights`)
        .send({
          weights: [
            { id: seeds.milestoneId, weight: 10 },
            { id: seeds.milestone2Id, weight: 10 },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/100/);
    });

    // ── Delete milestone ──────────────────────────────────────

    it("DELETE /api/spmo/milestones/:id - admin can delete non-phase-gate milestone", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api().delete(`/api/spmo/milestones/${createdMilestoneId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("DELETE /api/spmo/milestones/:id - cannot delete phase-gate milestone", async () => {
      // Get milestones for seeded project created via API (has phase gates)
      // Create a fresh project to get phase-gate milestones
      const projRes = await api()
        .post("/api/spmo/projects")
        .send({
          initiativeId: seeds.initiativeId,
          name: "Phase Gate Test Project",
          ownerId: ADMIN_USER.id,
          ownerName: "E2E Admin",
          startDate: "2025-01-01",
          targetDate: "2026-12-31",
          weight: 0,
        });
      expect(projRes.status).toBe(201);
      const tmpProjectId = projRes.body.id;

      const msRes = await api().get(`/api/spmo/projects/${tmpProjectId}/milestones`);
      const phaseGateMs = msRes.body.milestones.find((m: any) => m.phaseGate != null);
      expect(phaseGateMs).toBeTruthy();

      const delRes = await api().delete(`/api/spmo/milestones/${phaseGateMs.id}`);
      expect(delRes.status).toBe(403);
      expect(delRes.body.error).toMatch(/phase gate/i);

      // Cleanup
      await api().delete(`/api/spmo/projects/${tmpProjectId}`);
    });

    it("DELETE /api/spmo/milestones/:id - returns 404 for non-existent", async () => {
      const res = await api().delete("/api/spmo/milestones/999999");
      expect(res.status).toBe(404);
    });

    it("PM non-owner cannot create milestone on unowned project", async () => {
      // seeds.project2Id is owned by ADMIN_USER
      setCurrentUser(PM_USER);
      const res = await api()
        .post(`/api/spmo/projects/${seeds.project2Id}/milestones`)
        .send({
          name: "Unauthorized Milestone",
          weight: 0,
          progress: 0,
          status: "pending",
          dueDate: "2026-06-30",
        });
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });
  });
});
