import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestApp,
  api,
  setCurrentUser,
  seedTestData,
  cleanupTestData,
  ADMIN_USER,
  PM_USER,
  APPROVER_USER,
  VIEWER_USER,
  type TestSeeds,
} from "./helpers.js";

describe("Auth & Authorization E2E", () => {
  let seeds: TestSeeds;

  beforeAll(async () => {
    await getTestApp();
    seeds = await seedTestData();
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── Unauthenticated ─────────────────────────────────────────

  it("returns 401 when user has no id", async () => {
    // Simulate unauthenticated by setting a user with no id
    setCurrentUser({ id: "", email: "", firstName: "", lastName: "", role: "" });
    const res = await api().get("/api/spmo/pillars");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/[Aa]uthentication/);
    setCurrentUser(ADMIN_USER);
  });

  // ── Admin access ────────────────────────────────────────────

  it("admin can access admin-only endpoints (diagnostics)", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/admin/diagnostics");
    expect(res.status).toBe(200);
  });

  it("admin can create a pillar", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post("/api/spmo/pillars")
      .send({ name: "Auth Test Pillar", weight: 0 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");

    // Cleanup: delete the pillar we just created
    await api().delete(`/api/spmo/pillars/${res.body.id}`);
  });

  it("admin can delete a pillar", async () => {
    setCurrentUser(ADMIN_USER);
    // Create one to delete
    const create = await api()
      .post("/api/spmo/pillars")
      .send({ name: "Auth Delete Pillar", weight: 0 });
    expect(create.status).toBe(201);

    const del = await api().delete(`/api/spmo/pillars/${create.body.id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
  });

  it("admin can update programme config", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .put("/api/spmo/programme-config")
      .send({ programmeName: "E2E Test Programme" });
    expect(res.status).toBe(200);
    expect(res.body.programmeName).toBe("E2E Test Programme");
  });

  // ── PM restrictions ─────────────────────────────────────────

  it("PM cannot access admin-only endpoints (diagnostics)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/admin/diagnostics");
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot create a pillar (admin-only)", async () => {
    setCurrentUser(PM_USER);
    const res = await api()
      .post("/api/spmo/pillars")
      .send({ name: "PM Pillar Attempt", weight: 0 });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot delete a pillar (admin-only)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().delete(`/api/spmo/pillars/${seeds.pillarId}`);
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot update programme config (admin-only)", async () => {
    setCurrentUser(PM_USER);
    const res = await api()
      .put("/api/spmo/programme-config")
      .send({ programmeName: "PM Attempt" });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot delete a project (admin-only)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().delete(`/api/spmo/projects/${seeds.project2Id}`);
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  // ── Approver can approve milestones ─────────────────────────

  it("approver role can call the approve endpoint (status guard may reject but not 403)", async () => {
    setCurrentUser(APPROVER_USER);
    // The milestone is not in "submitted" status, so we expect a 400 (status guard),
    // NOT a 403 (permission denied). This proves the approver passes role check.
    const res = await api()
      .post(`/api/spmo/milestones/${seeds.milestoneId}/approve`)
      .send({});
    // Should be 400 ("Only submitted milestones can be approved") — not 403
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/submitted/i);
    setCurrentUser(ADMIN_USER);
  });

  it("approver role can call the reject endpoint (status guard may reject but not 403)", async () => {
    setCurrentUser(APPROVER_USER);
    const res = await api()
      .post(`/api/spmo/milestones/${seeds.milestoneId}/reject`)
      .send({ reason: "test" });
    // Should fail on status guard, not on permission
    expect([400, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  // ── Viewer restrictions ─────────────────────────────────────

  it("viewer can read pillars", async () => {
    setCurrentUser(VIEWER_USER);
    const res = await api().get("/api/spmo/pillars");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("pillars");
    setCurrentUser(ADMIN_USER);
  });

  it("viewer gets 403 on create pillar", async () => {
    setCurrentUser(VIEWER_USER);
    const res = await api()
      .post("/api/spmo/pillars")
      .send({ name: "Viewer Pillar", weight: 0 });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("viewer gets 403 on create initiative", async () => {
    setCurrentUser(VIEWER_USER);
    const res = await api()
      .post("/api/spmo/initiatives")
      .send({
        pillarId: seeds.pillarId,
        name: "Viewer Init",
        startDate: "2025-01-01",
        targetDate: "2026-12-31",
      });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("viewer gets 403 on create project", async () => {
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

  it("viewer gets 403 on update project", async () => {
    setCurrentUser(VIEWER_USER);
    const res = await api()
      .put(`/api/spmo/projects/${seeds.projectId}`)
      .send({ name: "Viewer Update" });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("viewer gets 403 on delete initiative", async () => {
    setCurrentUser(VIEWER_USER);
    const res = await api().delete(`/api/spmo/initiatives/${seeds.initiativeId}`);
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });
});
