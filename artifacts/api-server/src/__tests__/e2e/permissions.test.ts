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

describe("Per-Project Permissions E2E", () => {
  let seeds: TestSeeds;

  beforeAll(async () => {
    await getTestApp();
    seeds = await seedTestData();
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── Grant project access ─────────────────────────────────────

  it("admin can grant project access to PM user", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post(`/api/spmo/projects/${seeds.project2Id}/access`)
      .send({
        userId: PM_USER.id,
        userName: `${PM_USER.firstName} ${PM_USER.lastName}`,
        userEmail: PM_USER.email,
        canEditDetails: true,
        canManageMilestones: true,
        canManageRisks: false,
        canManageBudget: false,
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("projectId", seeds.project2Id);
    expect(res.body).toHaveProperty("userId", PM_USER.id);
    expect(res.body.canEditDetails).toBe(true);
    expect(res.body.canManageMilestones).toBe(true);
    expect(res.body.canManageRisks).toBe(false);
    expect(res.body.canManageBudget).toBe(false);
  });

  // ── List project access grants ───────────────────────────────

  it("admin can list project access grants", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get(`/api/spmo/projects/${seeds.project2Id}/access`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("grants");
    expect(Array.isArray(res.body.grants)).toBe(true);
    const pmGrant = res.body.grants.find(
      (g: any) => g.userId === PM_USER.id,
    );
    expect(pmGrant).toBeDefined();
    expect(pmGrant.canEditDetails).toBe(true);
    expect(pmGrant.canManageMilestones).toBe(true);
  });

  // ── Update permission flags ──────────────────────────────────

  it("admin can update permission flags via PATCH", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .patch(`/api/spmo/projects/${seeds.project2Id}/access/${PM_USER.id}`)
      .send({
        canManageRisks: true,
        canManageBudget: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.canManageRisks).toBe(true);
    expect(res.body.canManageBudget).toBe(true);
    // Previously set flags should remain unchanged
    expect(res.body.canEditDetails).toBe(true);
    expect(res.body.canManageMilestones).toBe(true);
  });

  it("PATCH with no permission fields returns 400", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .patch(`/api/spmo/projects/${seeds.project2Id}/access/${PM_USER.id}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("PATCH for non-existent grant returns 404", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .patch(`/api/spmo/projects/${seeds.project2Id}/access/non-existent-user`)
      .send({ canEditDetails: true });
    expect(res.status).toBe(404);
  });

  // ── my-project-access ────────────────────────────────────────

  it("PM can see their project access grants via my-project-access", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/my-project-access");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("admin", false);
    expect(Array.isArray(res.body.grants)).toBe(true);
    const grant = res.body.grants.find(
      (g: any) => g.projectId === seeds.project2Id,
    );
    expect(grant).toBeDefined();
    expect(grant.canManageRisks).toBe(true);
    setCurrentUser(ADMIN_USER);
  });

  it("admin my-project-access returns admin: true", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/my-project-access");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("admin", true);
  });

  // ── PM owner has full permissions automatically ──────────────

  it("PM owner can update their own project (no explicit grant needed)", async () => {
    // project1 is owned by PM_USER
    setCurrentUser(PM_USER);
    const res = await api()
      .put(`/api/spmo/projects/${seeds.projectId}`)
      .send({ name: "PM Owner Update Test" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("PM Owner Update Test");
    setCurrentUser(ADMIN_USER);
  });

  it("PM owner can create milestones on their own project", async () => {
    setCurrentUser(PM_USER);
    const res = await api()
      .post("/api/spmo/milestones")
      .send({
        projectId: seeds.projectId,
        name: "PM Owner Milestone",
        weight: 10,
        startDate: "2025-08-01",
        dueDate: "2025-09-30",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");

    // Cleanup
    setCurrentUser(ADMIN_USER);
    await api().delete(`/api/spmo/milestones/${res.body.id}`);
  });

  // ── PM non-owner needs explicit grant ────────────────────────

  it("PM non-owner without grant cannot update project", async () => {
    // First revoke the grant we created earlier
    setCurrentUser(ADMIN_USER);
    await api().delete(`/api/spmo/projects/${seeds.project2Id}/access/${PM_USER.id}`);

    // Now PM_USER has no grant for project2 and is not the owner
    setCurrentUser(PM_USER);
    const res = await api()
      .put(`/api/spmo/projects/${seeds.project2Id}`)
      .send({ name: "PM Non-Owner Attempt" });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  // ── Admin bypasses all permission checks ─────────────────────

  it("admin can update any project regardless of ownership", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .put(`/api/spmo/projects/${seeds.projectId}`)
      .send({ name: "Admin Override Test" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Admin Override Test");
  });

  it("admin can create milestones on any project", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post("/api/spmo/milestones")
      .send({
        projectId: seeds.project2Id,
        name: "Admin Milestone",
        weight: 10,
        startDate: "2025-08-01",
        dueDate: "2025-09-30",
      });
    expect(res.status).toBe(201);
    // Cleanup
    await api().delete(`/api/spmo/milestones/${res.body.id}`);
  });

  // ── Specific permission flags ────────────────────────────────

  describe("specific permission flags", () => {
    beforeAll(async () => {
      // Grant PM_USER access to project2 with only canManageMilestones
      setCurrentUser(ADMIN_USER);
      await api()
        .post(`/api/spmo/projects/${seeds.project2Id}/access`)
        .send({
          userId: PM_USER.id,
          userName: `${PM_USER.firstName} ${PM_USER.lastName}`,
          canManageMilestones: true,
          canManageRisks: false,
          canManageBudget: false,
          canEditDetails: false,
        });
    });

    afterAll(async () => {
      // Clean up the grant
      setCurrentUser(ADMIN_USER);
      await api().delete(`/api/spmo/projects/${seeds.project2Id}/access/${PM_USER.id}`);
    });

    it("PM with canManageMilestones can create milestones on granted project", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .post("/api/spmo/milestones")
        .send({
          projectId: seeds.project2Id,
          name: "Granted Milestone",
          weight: 5,
          startDate: "2025-08-01",
          dueDate: "2025-09-30",
        });
      expect(res.status).toBe(201);
      // Cleanup
      setCurrentUser(ADMIN_USER);
      await api().delete(`/api/spmo/milestones/${res.body.id}`);
    });

    it("PM without canManageRisks cannot create risks on granted project", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .post("/api/spmo/risks")
        .send({
          projectId: seeds.project2Id,
          title: "Unauthorized Risk",
          likelihood: "medium",
          impact: "high",
        });
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });

    it("PM without canManageBudget cannot create budget items on granted project", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .post("/api/spmo/budget")
        .send({
          projectId: seeds.project2Id,
          category: "Testing",
          description: "Unauthorized Budget",
          planned: 100000,
        });
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });

    it("PM without canEditDetails cannot update project details", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .put(`/api/spmo/projects/${seeds.project2Id}`)
        .send({ name: "Unauthorized Update" });
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });
  });

  // ── Revoke access ────────────────────────────────────────────

  it("admin can revoke project access", async () => {
    // First grant access
    setCurrentUser(ADMIN_USER);
    await api()
      .post(`/api/spmo/projects/${seeds.project2Id}/access`)
      .send({
        userId: PM_USER.id,
        userName: `${PM_USER.firstName} ${PM_USER.lastName}`,
        canEditDetails: true,
      });

    // Revoke it
    const del = await api().delete(
      `/api/spmo/projects/${seeds.project2Id}/access/${PM_USER.id}`,
    );
    expect(del.status).toBe(200);
    expect(del.body).toHaveProperty("ok", true);

    // Verify it's gone
    const list = await api().get(`/api/spmo/projects/${seeds.project2Id}/access`);
    const pmGrant = list.body.grants.find((g: any) => g.userId === PM_USER.id);
    expect(pmGrant).toBeUndefined();
  });

  // ── Non-admin cannot manage access ───────────────────────────

  it("PM cannot list project access (admin only)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get(`/api/spmo/projects/${seeds.projectId}/access`);
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot grant project access (admin only)", async () => {
    setCurrentUser(PM_USER);
    const res = await api()
      .post(`/api/spmo/projects/${seeds.projectId}/access`)
      .send({
        userId: VIEWER_USER.id,
        canEditDetails: true,
      });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot revoke project access (admin only)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().delete(
      `/api/spmo/projects/${seeds.projectId}/access/${VIEWER_USER.id}`,
    );
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });
});
