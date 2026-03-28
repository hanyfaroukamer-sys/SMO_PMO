import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestApp,
  api,
  setCurrentUser,
  seedTestData,
  cleanupTestData,
  ADMIN_USER,
  PM_USER,
  type TestSeeds,
} from "./helpers.js";

describe("Pillars & Initiatives CRUD E2E", () => {
  let seeds: TestSeeds;

  beforeAll(async () => {
    await getTestApp();
    seeds = await seedTestData();
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── Pillars ─────────────────────────────────────────────────

  describe("Pillars CRUD", () => {
    let createdPillarId: number;

    it("POST /api/spmo/pillars - admin can create a pillar", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api()
        .post("/api/spmo/pillars")
        .send({
          name: "E2E CRUD Pillar",
          description: "Created during E2E test",
          weight: 0,
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("E2E CRUD Pillar");
      expect(res.body.description).toBe("Created during E2E test");
      createdPillarId = res.body.id;
    });

    it("GET /api/spmo/pillars - lists pillars including the created one", async () => {
      const res = await api().get("/api/spmo/pillars");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pillars");
      expect(Array.isArray(res.body.pillars)).toBe(true);

      const found = res.body.pillars.find((p: any) => p.id === createdPillarId);
      expect(found).toBeTruthy();
      expect(found.name).toBe("E2E CRUD Pillar");
    });

    it("PUT /api/spmo/pillars/:id - admin can update pillar name and weight", async () => {
      const res = await api()
        .put(`/api/spmo/pillars/${createdPillarId}`)
        .send({ name: "E2E CRUD Pillar Updated", weight: 1 });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("E2E CRUD Pillar Updated");
      expect(res.body.weight).toBe(1);
    });

    it("GET /api/spmo/pillars/:id - returns pillar with initiatives", async () => {
      const res = await api().get(`/api/spmo/pillars/${seeds.pillarId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", seeds.pillarId);
      expect(res.body).toHaveProperty("name");
      expect(res.body).toHaveProperty("initiatives");
      expect(Array.isArray(res.body.initiatives)).toBe(true);
    });

    it("GET /api/spmo/pillars/:id - returns 404 for non-existent pillar", async () => {
      const res = await api().get("/api/spmo/pillars/999999");
      expect(res.status).toBe(404);
    });

    it("GET /api/spmo/pillars/:id/portfolio - returns pillar portfolio", async () => {
      const res = await api().get(`/api/spmo/pillars/${seeds.pillarId}/portfolio`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pillar");
      expect(res.body.pillar).toHaveProperty("id", seeds.pillarId);
      expect(res.body).toHaveProperty("initiatives");
      expect(Array.isArray(res.body.initiatives)).toBe(true);

      // Portfolio initiatives should have nested projects
      if (res.body.initiatives.length > 0) {
        expect(res.body.initiatives[0]).toHaveProperty("projects");
        expect(Array.isArray(res.body.initiatives[0].projects)).toBe(true);
      }
    });

    it("DELETE /api/spmo/pillars/:id - admin can delete pillar", async () => {
      const res = await api().delete(`/api/spmo/pillars/${createdPillarId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it is gone
      const check = await api().get(`/api/spmo/pillars/${createdPillarId}`);
      expect(check.status).toBe(404);
    });

    it("DELETE /api/spmo/pillars/:id - returns 404 for non-existent pillar", async () => {
      const res = await api().delete("/api/spmo/pillars/999999");
      expect(res.status).toBe(404);
    });

    // ── PM restrictions on pillars ────────────────────────────

    it("PM cannot create a pillar", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .post("/api/spmo/pillars")
        .send({ name: "PM Pillar", weight: 0 });
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });

    it("PM cannot update a pillar", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .put(`/api/spmo/pillars/${seeds.pillarId}`)
        .send({ name: "PM Update" });
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });

    it("PM cannot delete a pillar", async () => {
      setCurrentUser(PM_USER);
      const res = await api().delete(`/api/spmo/pillars/${seeds.pillarId}`);
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });
  });

  // ── Initiatives ─────────────────────────────────────────────

  describe("Initiatives CRUD", () => {
    let createdInitId: number;

    it("POST /api/spmo/initiatives - admin can create an initiative", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api()
        .post("/api/spmo/initiatives")
        .send({
          pillarId: seeds.pillarId,
          name: "E2E CRUD Initiative",
          ownerId: ADMIN_USER.id,
          startDate: "2025-06-01",
          targetDate: "2026-06-30",
          budget: 1_000_000,
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("E2E CRUD Initiative");
      expect(res.body.pillarId).toBe(seeds.pillarId);
      createdInitId = res.body.id;
    });

    it("PM can also create an initiative", async () => {
      setCurrentUser(PM_USER);
      const res = await api()
        .post("/api/spmo/initiatives")
        .send({
          pillarId: seeds.pillar2Id,
          name: "PM Initiative",
          ownerId: PM_USER.id,
          startDate: "2025-06-01",
          targetDate: "2026-06-30",
        });
      expect(res.status).toBe(201);
      // Cleanup
      setCurrentUser(ADMIN_USER);
      await api().delete(`/api/spmo/initiatives/${res.body.id}`);
    });

    it("GET /api/spmo/initiatives - lists all initiatives", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api().get("/api/spmo/initiatives");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("initiatives");
      expect(Array.isArray(res.body.initiatives)).toBe(true);

      const found = res.body.initiatives.find((i: any) => i.id === createdInitId);
      expect(found).toBeTruthy();
    });

    it("GET /api/spmo/initiatives?pillarId= filters by pillar", async () => {
      const res = await api().get(`/api/spmo/initiatives?pillarId=${seeds.pillarId}`);
      expect(res.status).toBe(200);
      for (const init of res.body.initiatives) {
        expect(init.pillarId).toBe(seeds.pillarId);
      }
    });

    it("GET /api/spmo/initiatives/:id - returns initiative with projects", async () => {
      const res = await api().get(`/api/spmo/initiatives/${seeds.initiativeId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", seeds.initiativeId);
      expect(res.body).toHaveProperty("name");
      expect(res.body).toHaveProperty("projects");
      expect(Array.isArray(res.body.projects)).toBe(true);
      expect(res.body).toHaveProperty("progress");
    });

    it("PUT /api/spmo/initiatives/:id - admin can update initiative", async () => {
      const res = await api()
        .put(`/api/spmo/initiatives/${createdInitId}`)
        .send({ name: "E2E CRUD Initiative Updated", budget: 2_000_000 });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("E2E CRUD Initiative Updated");
    });

    it("PUT /api/spmo/initiatives/:id - returns 404 for non-existent", async () => {
      const res = await api()
        .put("/api/spmo/initiatives/999999")
        .send({ name: "Nope" });
      expect(res.status).toBe(404);
    });

    it("DELETE /api/spmo/initiatives/:id - admin can delete initiative", async () => {
      const res = await api().delete(`/api/spmo/initiatives/${createdInitId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("DELETE /api/spmo/initiatives/:id - PM cannot delete (admin-only)", async () => {
      setCurrentUser(PM_USER);
      const res = await api().delete(`/api/spmo/initiatives/${seeds.initiativeId}`);
      expect(res.status).toBe(403);
      setCurrentUser(ADMIN_USER);
    });

    it("DELETE /api/spmo/initiatives/:id - returns 404 for non-existent", async () => {
      const res = await api().delete("/api/spmo/initiatives/999999");
      expect(res.status).toBe(404);
    });
  });
});
