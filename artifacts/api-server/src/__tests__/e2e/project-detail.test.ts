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
} from "./helpers";

let seeds: TestSeeds;

// IDs created during tests
let changeRequestId: number;
let actionId: number;
let raciId: number;

beforeAll(async () => {
  await getTestApp();
  seeds = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("Change Requests", () => {
  it("POST /api/spmo/change-requests — creates a change request", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/change-requests")
      .send({
        projectId: seeds.projectId,
        title: "E2E Scope Change",
        description: "Increase scope for E2E testing",
        changeType: "scope",
        impact: "Medium impact on timeline",
        budgetImpact: 50000,
        timelineImpact: 14,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.title).toBe("E2E Scope Change");
    expect(res.body.changeType).toBe("scope");
    expect(res.body.status).toBe("draft");
    expect(res.body.projectId).toBe(seeds.projectId);
    changeRequestId = res.body.id;
  });

  it("GET /api/spmo/change-requests — lists change requests for a project", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .get("/api/spmo/change-requests")
      .query({ projectId: seeds.projectId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("changeRequests");
    const found = res.body.changeRequests.find(
      (cr: { id: number }) => cr.id === changeRequestId,
    );
    expect(found).toBeDefined();
    expect(found.title).toBe("E2E Scope Change");
  });

  it("GET /api/spmo/change-requests/:id — gets a single change request", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get(
      `/api/spmo/change-requests/${changeRequestId}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(changeRequestId);
  });

  it("PATCH /api/spmo/change-requests/:id — updates change request status", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .patch(`/api/spmo/change-requests/${changeRequestId}`)
      .send({
        status: "approved",
        reviewComments: "Approved by E2E test",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.reviewedById).toBe(ADMIN_USER.id);
  });

  it("VIEWER cannot create a change request (403)", async () => {
    setCurrentUser(VIEWER_USER);

    const res = await api()
      .post("/api/spmo/change-requests")
      .send({
        projectId: seeds.projectId,
        title: "Viewer CR",
        changeType: "other",
      });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("DELETE /api/spmo/change-requests/:id — deletes change request", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete(
      `/api/spmo/change-requests/${changeRequestId}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Confirm it is gone
    const check = await api().get(
      `/api/spmo/change-requests/${changeRequestId}`,
    );
    expect(check.status).toBe(404);
  });
});

describe("Action Items", () => {
  it("POST /api/spmo/actions — creates an action item", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/actions")
      .send({
        projectId: seeds.projectId,
        milestoneId: seeds.milestoneId,
        title: "E2E Action Item",
        description: "Action created in E2E test",
        assigneeId: PM_USER.id,
        assigneeName: "E2E ProjectManager",
        dueDate: "2026-06-30",
        priority: "high",
        status: "open",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.title).toBe("E2E Action Item");
    expect(res.body.priority).toBe("high");
    expect(res.body.status).toBe("open");
    actionId = res.body.id;
  });

  it("GET /api/spmo/actions — lists actions for project", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .get("/api/spmo/actions")
      .query({ projectId: seeds.projectId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("actions");
    const found = res.body.actions.find(
      (a: { id: number }) => a.id === actionId,
    );
    expect(found).toBeDefined();
  });

  it("PATCH /api/spmo/actions/:id — updates status and assignee", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .patch(`/api/spmo/actions/${actionId}`)
      .send({
        status: "in_progress",
        assigneeId: ADMIN_USER.id,
        assigneeName: "E2E Admin",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_progress");
    expect(res.body.assigneeId).toBe(ADMIN_USER.id);
  });

  it("PATCH /api/spmo/actions/:id — marks action as done", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .patch(`/api/spmo/actions/${actionId}`)
      .send({ status: "done" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("done");
  });

  it("VIEWER cannot create an action (403)", async () => {
    setCurrentUser(VIEWER_USER);

    const res = await api()
      .post("/api/spmo/actions")
      .send({
        projectId: seeds.projectId,
        title: "Viewer Action",
        priority: "low",
      });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("DELETE /api/spmo/actions/:id — deletes action", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete(`/api/spmo/actions/${actionId}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("RACI Matrix", () => {
  it("POST /api/spmo/raci — creates a RACI entry", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/raci")
      .send({
        projectId: seeds.projectId,
        milestoneId: seeds.milestoneId,
        userId: PM_USER.id,
        userName: "E2E ProjectManager",
        role: "responsible",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.role).toBe("responsible");
    expect(res.body.userId).toBe(PM_USER.id);
    raciId = res.body.id;
  });

  it("POST /api/spmo/raci — upserts existing entry (same milestone + user)", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/raci")
      .send({
        projectId: seeds.projectId,
        milestoneId: seeds.milestoneId,
        userId: PM_USER.id,
        userName: "E2E ProjectManager",
        role: "accountable",
      });

    // Upsert returns 200, not 201
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("accountable");
    expect(res.body.id).toBe(raciId);
  });

  it("GET /api/spmo/raci — lists RACI entries for project", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .get("/api/spmo/raci")
      .query({ projectId: seeds.projectId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("raci");
    expect(Array.isArray(res.body.raci)).toBe(true);
    const found = res.body.raci.find(
      (r: { id: number }) => r.id === raciId,
    );
    expect(found).toBeDefined();
  });

  it("GET /api/spmo/raci — returns 400 without projectId", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get("/api/spmo/raci");

    expect(res.status).toBe(400);
  });

  it("VIEWER cannot create RACI entry (403)", async () => {
    setCurrentUser(VIEWER_USER);

    const res = await api()
      .post("/api/spmo/raci")
      .send({
        projectId: seeds.projectId,
        milestoneId: seeds.milestoneId,
        userId: VIEWER_USER.id,
        role: "informed",
      });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("DELETE /api/spmo/raci/:id — deletes RACI entry", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete(`/api/spmo/raci/${raciId}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("Weekly Reports", () => {
  it("PUT /api/spmo/projects/:id/weekly-report — submits a weekly report", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .put(`/api/spmo/projects/${seeds.projectId}/weekly-report`)
      .send({
        keyAchievements: "Completed E2E test setup",
        nextSteps: "Run full regression suite",
      });

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(seeds.projectId);
    expect(res.body.keyAchievements).toBe("Completed E2E test setup");
    expect(res.body.nextSteps).toBe("Run full regression suite");
    expect(res.body).toHaveProperty("weekStart");
  });

  it("GET /api/spmo/projects/:id/weekly-report — gets current weekly report", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get(
      `/api/spmo/projects/${seeds.projectId}/weekly-report`,
    );

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(seeds.projectId);
    expect(res.body.keyAchievements).toBe("Completed E2E test setup");
    expect(res.body.nextSteps).toBe("Run full regression suite");
  });

  it("PUT /api/spmo/projects/:id/weekly-report — upserts (updates same week)", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .put(`/api/spmo/projects/${seeds.projectId}/weekly-report`)
      .send({
        keyAchievements: "Updated achievements",
        nextSteps: "Updated next steps",
      });

    expect(res.status).toBe(200);
    expect(res.body.keyAchievements).toBe("Updated achievements");
  });

  it("GET /api/spmo/projects/:id/weekly-report/history — gets report history", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get(
      `/api/spmo/projects/${seeds.projectId}/weekly-report/history`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("reports");
    expect(Array.isArray(res.body.reports)).toBe(true);
    expect(res.body.reports.length).toBeGreaterThanOrEqual(1);
  });

  it("VIEWER can read weekly report (auth only)", async () => {
    setCurrentUser(VIEWER_USER);

    const res = await api().get(
      `/api/spmo/projects/${seeds.projectId}/weekly-report`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("keyAchievements");
    setCurrentUser(ADMIN_USER);
  });
});
