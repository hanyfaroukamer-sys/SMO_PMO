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

describe("Dashboard & Navigation E2E", () => {
  let seeds: TestSeeds;

  beforeAll(async () => {
    await getTestApp();
    seeds = await seedTestData();
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── Programme Overview ──────────────────────────────────────

  describe("GET /api/spmo/programme", () => {
    it("returns programme overview with pillarSummaries", async () => {
      const res = await api().get("/api/spmo/programme");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("programmeName");
      expect(res.body).toHaveProperty("programmeProgress");
      expect(res.body).toHaveProperty("pillarSummaries");
      expect(Array.isArray(res.body.pillarSummaries)).toBe(true);
      expect(res.body).toHaveProperty("totalMilestones");
      expect(res.body).toHaveProperty("approvedMilestones");
      expect(res.body).toHaveProperty("pendingApprovals");
      expect(res.body).toHaveProperty("activeRisks");
      expect(res.body).toHaveProperty("alertCount");
      expect(res.body).toHaveProperty("lastUpdated");
    });

    it("pillarSummaries contain expected fields", async () => {
      const res = await api().get("/api/spmo/programme");
      expect(res.status).toBe(200);

      if (res.body.pillarSummaries.length > 0) {
        const ps = res.body.pillarSummaries[0];
        expect(ps).toHaveProperty("id");
        expect(ps).toHaveProperty("name");
        expect(ps).toHaveProperty("weight");
        expect(ps).toHaveProperty("progress");
      }
    });

    it("programmeProgress is a number between 0 and 100", async () => {
      const res = await api().get("/api/spmo/programme");
      expect(res.status).toBe(200);
      expect(typeof res.body.programmeProgress).toBe("number");
      expect(res.body.programmeProgress).toBeGreaterThanOrEqual(0);
      expect(res.body.programmeProgress).toBeLessThanOrEqual(100);
    });
  });

  // ── Alerts ──────────────────────────────────────────────────

  describe("GET /api/spmo/alerts", () => {
    it("returns alerts array", async () => {
      const res = await api().get("/api/spmo/alerts");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("alerts");
      expect(Array.isArray(res.body.alerts)).toBe(true);
    });

    it("each alert has required fields", async () => {
      const res = await api().get("/api/spmo/alerts");
      expect(res.status).toBe(200);

      for (const alert of res.body.alerts) {
        expect(alert).toHaveProperty("id");
        expect(alert).toHaveProperty("severity");
        expect(["info", "warning", "critical"]).toContain(alert.severity);
        expect(alert).toHaveProperty("category");
        expect(alert).toHaveProperty("title");
        expect(alert).toHaveProperty("description");
        expect(alert).toHaveProperty("entityType");
        expect(alert).toHaveProperty("entityName");
      }
    });
  });

  // ── Activity Log ────────────────────────────────────────────

  describe("GET /api/spmo/activity-log", () => {
    it("returns paginated activity log", async () => {
      const res = await api().get("/api/spmo/activity-log");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("entries");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.entries)).toBe(true);
      expect(typeof res.body.total).toBe("number");
    });

    it("respects limit and offset params", async () => {
      const res = await api().get("/api/spmo/activity-log?limit=2&offset=0");
      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBeLessThanOrEqual(2);
    });

    it("supports entityType filter", async () => {
      const res = await api().get("/api/spmo/activity-log?entityType=pillar");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("entries");
      // All returned entries should be pillar type
      for (const entry of res.body.entries) {
        expect(entry.entityType).toBe("pillar");
      }
    });
  });

  // ── My Tasks ────────────────────────────────────────────────

  describe("GET /api/spmo/my-tasks", () => {
    it("returns tasks array for current user", async () => {
      setCurrentUser(PM_USER);
      const res = await api().get("/api/spmo/my-tasks");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("tasks");
      expect(Array.isArray(res.body.tasks)).toBe(true);
      setCurrentUser(ADMIN_USER);
    });

    it("returns tasks for admin user", async () => {
      setCurrentUser(ADMIN_USER);
      const res = await api().get("/api/spmo/my-tasks");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("tasks");
    });
  });

  // ── My Tasks Count ──────────────────────────────────────────

  describe("GET /api/spmo/my-tasks/count", () => {
    it("returns count object with expected fields", async () => {
      const res = await api().get("/api/spmo/my-tasks/count");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("critical");
      expect(res.body).toHaveProperty("high");
      expect(res.body).toHaveProperty("medium");
      expect(res.body).toHaveProperty("low");
      expect(typeof res.body.total).toBe("number");
    });

    it("count reflects role (PM sees owned project tasks)", async () => {
      setCurrentUser(PM_USER);
      const res = await api().get("/api/spmo/my-tasks/count");
      expect(res.status).toBe(200);
      expect(typeof res.body.total).toBe("number");
      setCurrentUser(ADMIN_USER);
    });
  });

  // ── Search ──────────────────────────────────────────────────

  describe("GET /api/spmo/search", () => {
    it("returns results array for a valid query", async () => {
      // Use a term that is unlikely to match anything
      const res = await api().get("/api/spmo/search?q=e2e");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("results");
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it("returns empty results for very short query", async () => {
      const res = await api().get("/api/spmo/search?q=x");
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });

    it("each result has type, id, title, and link", async () => {
      // Search for something that should match our seeded data
      const res = await api().get("/api/spmo/search?q=e2e");
      expect(res.status).toBe(200);
      for (const r of res.body.results) {
        expect(r).toHaveProperty("type");
        expect(r).toHaveProperty("id");
        expect(r).toHaveProperty("title");
        expect(r).toHaveProperty("link");
      }
    });
  });

  // ── Programme Config ────────────────────────────────────────

  describe("GET /api/spmo/programme-config", () => {
    it("returns config object", async () => {
      const res = await api().get("/api/spmo/programme-config");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("programmeName");
      expect(typeof res.body.programmeName).toBe("string");
    });

    it("config contains reporting settings", async () => {
      const res = await api().get("/api/spmo/programme-config");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("reportingCurrency");
      expect(res.body).toHaveProperty("fiscalYearStart");
    });
  });
});
