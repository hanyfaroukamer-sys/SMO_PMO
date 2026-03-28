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

describe("Admin & Config E2E", () => {
  let seeds: TestSeeds;

  beforeAll(async () => {
    await getTestApp();
    seeds = await seedTestData();
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── Programme Config ─────────────────────────────────────────

  it("GET /api/spmo/programme-config returns config", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/programme-config");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("programmeName");
  });

  it("any authenticated user can read programme config", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/programme-config");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("programmeName");
    setCurrentUser(ADMIN_USER);
  });

  it("PUT /api/spmo/programme-config updates vision and mission", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .put("/api/spmo/programme-config")
      .send({
        vision: "E2E Test Vision Statement",
        mission: "E2E Test Mission Statement",
      });
    expect(res.status).toBe(200);
    expect(res.body.vision).toBe("E2E Test Vision Statement");
    expect(res.body.mission).toBe("E2E Test Mission Statement");
  });

  it("PUT /api/spmo/programme-config updates thresholds", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .put("/api/spmo/programme-config")
      .send({
        projectAtRiskThreshold: 7,
        projectDelayedThreshold: 15,
        milestoneAtRiskThreshold: 8,
      });
    expect(res.status).toBe(200);
    expect(res.body.projectAtRiskThreshold).toBe(7);
    expect(res.body.projectDelayedThreshold).toBe(15);
    expect(res.body.milestoneAtRiskThreshold).toBe(8);
  });

  it("PM cannot update programme config (403)", async () => {
    setCurrentUser(PM_USER);
    const res = await api()
      .put("/api/spmo/programme-config")
      .send({ vision: "PM Attempt" });
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  // ── Admin Diagnostics ────────────────────────────────────────

  it("GET /api/spmo/admin/diagnostics returns system info for admin", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/admin/diagnostics");
    expect(res.status).toBe(200);
    // Should contain database status and table counts
    expect(res.body).toHaveProperty("database");
    expect(res.body).toHaveProperty("tableCounts");
  });

  it("PM cannot access diagnostics (403)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/admin/diagnostics");
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("viewer cannot access diagnostics (403)", async () => {
    setCurrentUser(VIEWER_USER);
    const res = await api().get("/api/spmo/admin/diagnostics");
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  // ── Admin Users Access ───────────────────────────────────────

  it("GET /api/spmo/admin/users-access returns user access overview", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/admin/users-access");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("users");
    expect(Array.isArray(res.body.users)).toBe(true);
    // Each user entry should have ownedProjects and accessGrants arrays
    if (res.body.users.length > 0) {
      const user = res.body.users[0];
      expect(user).toHaveProperty("ownedProjects");
      expect(user).toHaveProperty("accessGrants");
      expect(Array.isArray(user.ownedProjects)).toBe(true);
      expect(Array.isArray(user.accessGrants)).toBe(true);
    }
  });

  it("PM cannot access users-access (403)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/admin/users-access");
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  // ── Admin Users List ─────────────────────────────────────────

  it("GET /api/spmo/admin/users returns user list for admin", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/admin/users");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("users");
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("PM cannot access users list (403)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/admin/users");
    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  // ── Pending Approvals ────────────────────────────────────────

  it("GET /api/spmo/pending-approvals returns pending items", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/pending-approvals");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("PM can also read pending approvals (authenticated endpoint)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/pending-approvals");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    setCurrentUser(ADMIN_USER);
  });

  // ── Search ───────────────────────────────────────────────────

  it("GET /api/spmo/search?q=test returns search results", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/search?q=test");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("results");
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it("search with short query returns empty results", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api().get("/api/spmo/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it("search results contain expected fields", async () => {
    setCurrentUser(ADMIN_USER);
    // Search for "E2E" which should match our seeded data descriptions
    const res = await api().get("/api/spmo/search?q=E2E");
    expect(res.status).toBe(200);
    if (res.body.results.length > 0) {
      const result = res.body.results[0];
      expect(result).toHaveProperty("type");
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("link");
    }
  });

  it("PM can use search (authenticated endpoint)", async () => {
    setCurrentUser(PM_USER);
    const res = await api().get("/api/spmo/search?q=test");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("results");
    setCurrentUser(ADMIN_USER);
  });

  // ── Unauthenticated access ───────────────────────────────────

  it("unauthenticated user cannot access admin diagnostics", async () => {
    setCurrentUser({ id: "", email: "", firstName: "", lastName: "", role: "" });
    const res = await api().get("/api/spmo/admin/diagnostics");
    expect(res.status).toBe(401);
    setCurrentUser(ADMIN_USER);
  });

  it("unauthenticated user cannot read programme config", async () => {
    setCurrentUser({ id: "", email: "", firstName: "", lastName: "", role: "" });
    const res = await api().get("/api/spmo/programme-config");
    expect(res.status).toBe(401);
    setCurrentUser(ADMIN_USER);
  });
});
