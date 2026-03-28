import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestApp,
  api,
  seedTestData,
  cleanupTestData,
  setCurrentUser,
  ADMIN_USER,
  VIEWER_USER,
  type TestSeeds,
} from "./helpers";

let seeds: TestSeeds;

beforeAll(async () => {
  await getTestApp();
  seeds = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("Budget & Financials E2E", () => {
  // ── Budget entries ───────────────────────────────────────────
  let budgetId1: number;
  let budgetId2: number;

  describe("budget CRUD", () => {
    it("should create a budget entry", async () => {
      const res = await api()
        .post("/api/spmo/budget")
        .send({
          projectId: seeds.projectId,
          pillarId: seeds.pillarId,
          category: "Software Licenses",
          description: "Annual SaaS licenses",
          allocated: 500_000,
          spent: 120_000,
          period: "2026-Q1",
          fiscalYear: 2026,
          fiscalQuarter: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.category).toBe("Software Licenses");
      expect(res.body.allocated).toBe(500_000);
      expect(res.body.spent).toBe(120_000);
      expect(res.body.period).toBe("2026-Q1");
      budgetId1 = res.body.id;
    });

    it("should create a second budget entry", async () => {
      const res = await api()
        .post("/api/spmo/budget")
        .send({
          projectId: seeds.projectId,
          pillarId: seeds.pillarId,
          category: "Consulting",
          description: "External consultants",
          allocated: 300_000,
          spent: 200_000,
          period: "2026-Q1",
          fiscalYear: 2026,
          fiscalQuarter: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.category).toBe("Consulting");
      budgetId2 = res.body.id;
    });

    it("viewer cannot create budget entries", async () => {
      setCurrentUser(VIEWER_USER);

      const res = await api()
        .post("/api/spmo/budget")
        .send({
          projectId: seeds.projectId,
          category: "Should Fail",
          allocated: 1000,
          spent: 0,
          period: "2026-Q1",
        });

      expect(res.status).toBe(403);

      setCurrentUser(ADMIN_USER);
    });
  });

  describe("list and filter budget", () => {
    it("should list budget entries for a project", async () => {
      const res = await api().get(`/api/spmo/budget?projectId=${seeds.projectId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("entries");
      expect(Array.isArray(res.body.entries)).toBe(true);
      expect(res.body.entries.length).toBeGreaterThanOrEqual(2);
      expect(res.body).toHaveProperty("totalAllocated");
      expect(res.body).toHaveProperty("totalSpent");
      expect(res.body).toHaveProperty("utilizationPct");
    });

    it("should compute correct totals for project filter", async () => {
      const res = await api().get(`/api/spmo/budget?projectId=${seeds.projectId}`);

      expect(res.status).toBe(200);
      // 500000 + 300000 = 800000 allocated
      expect(res.body.totalAllocated).toBe(800_000);
      // 120000 + 200000 = 320000 spent
      expect(res.body.totalSpent).toBe(320_000);
      // utilization = (320000 / 800000) * 100 = 40.0%
      expect(res.body.utilizationPct).toBe(40);
    });

    it("should list all budget entries without project filter", async () => {
      const res = await api().get("/api/spmo/budget");

      expect(res.status).toBe(200);
      // Without projectId, returns aggregated from projects
      expect(res.body).toHaveProperty("totalAllocated");
      expect(res.body).toHaveProperty("totalSpent");
      expect(res.body).toHaveProperty("entries");
    });

    it("should filter budget by pillar", async () => {
      const res = await api().get(`/api/spmo/budget?pillarId=${seeds.pillarId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalAllocated");
      expect(res.body).toHaveProperty("entries");
    });
  });

  describe("update budget entry", () => {
    it("should update allocated and spent amounts", async () => {
      const res = await api()
        .put(`/api/spmo/budget/${budgetId1}`)
        .send({
          allocated: 600_000,
          spent: 250_000,
          description: "Updated license budget",
        });

      expect(res.status).toBe(200);
      expect(res.body.allocated).toBe(600_000);
      expect(res.body.spent).toBe(250_000);
    });

    it("should return 404 for non-existent budget entry", async () => {
      const res = await api()
        .put("/api/spmo/budget/999999")
        .send({ allocated: 100 });

      expect(res.status).toBe(404);
    });
  });

  describe("delete budget entry", () => {
    it("should delete a budget entry", async () => {
      const res = await api().delete(`/api/spmo/budget/${budgetId2}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 404 for deleted budget entry", async () => {
      const res = await api().delete(`/api/spmo/budget/${budgetId2}`);

      expect(res.status).toBe(404);
    });

    it("totals should update after deletion", async () => {
      const res = await api().get(`/api/spmo/budget?projectId=${seeds.projectId}`);

      expect(res.status).toBe(200);
      // Only budgetId1 remains: allocated=600000, spent=250000
      expect(res.body.totalAllocated).toBe(600_000);
      expect(res.body.totalSpent).toBe(250_000);
    });
  });

  // ── Procurement ──────────────────────────────────────────────
  let procId: number;
  let procId2: number;

  describe("procurement CRUD", () => {
    it("should create a procurement record", async () => {
      const res = await api()
        .post("/api/spmo/procurement")
        .send({
          projectId: seeds.projectId,
          title: "Cloud Infrastructure RFP",
          stage: "rfp_draft",
          vendor: "TBD",
          contractValue: 1_000_000,
          currency: "SAR",
          notes: "Major cloud migration procurement",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.title).toBe("Cloud Infrastructure RFP");
      expect(res.body.stage).toBe("rfp_draft");
      expect(res.body.contractValue).toBe(1_000_000);
      procId = res.body.id;
    });

    it("should create a second procurement record", async () => {
      const res = await api()
        .post("/api/spmo/procurement")
        .send({
          projectId: seeds.projectId,
          title: "Security Audit Services",
          stage: "evaluation",
          vendor: "SecureCo",
          contractValue: 250_000,
        });

      expect(res.status).toBe(201);
      expect(res.body.stage).toBe("evaluation");
      procId2 = res.body.id;
    });

    it("viewer cannot create procurement", async () => {
      setCurrentUser(VIEWER_USER);

      const res = await api()
        .post("/api/spmo/procurement")
        .send({
          projectId: seeds.projectId,
          title: "Should Fail",
          stage: "rfp_draft",
        });

      expect(res.status).toBe(403);

      setCurrentUser(ADMIN_USER);
    });
  });

  describe("list procurement", () => {
    it("should list all procurement records", async () => {
      const res = await api().get("/api/spmo/procurement");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("procurement");
      expect(Array.isArray(res.body.procurement)).toBe(true);
      expect(res.body.procurement.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter procurement by project", async () => {
      const res = await api().get(
        `/api/spmo/procurement?projectId=${seeds.projectId}`
      );

      expect(res.status).toBe(200);
      for (const p of res.body.procurement) {
        expect(p.projectId).toBe(seeds.projectId);
      }
    });
  });

  describe("update procurement", () => {
    it("should update procurement stage and vendor", async () => {
      const res = await api()
        .put(`/api/spmo/procurement/${procId}`)
        .send({
          stage: "rfp_issued",
          vendor: "CloudVendor Inc.",
          notes: "RFP issued to 3 vendors",
        });

      expect(res.status).toBe(200);
      expect(res.body.stage).toBe("rfp_issued");
      expect(res.body.vendor).toBe("CloudVendor Inc.");
    });

    it("should update procurement to awarded stage", async () => {
      const res = await api()
        .put(`/api/spmo/procurement/${procId}`)
        .send({
          stage: "awarded",
          awardDate: "2026-04-15",
        });

      expect(res.status).toBe(200);
      expect(res.body.stage).toBe("awarded");
    });

    it("should return 404 for non-existent procurement", async () => {
      const res = await api()
        .put("/api/spmo/procurement/999999")
        .send({ stage: "completed" });

      expect(res.status).toBe(404);
    });
  });

  describe("delete procurement", () => {
    it("should delete a procurement record", async () => {
      const res = await api().delete(`/api/spmo/procurement/${procId2}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 404 for deleted procurement", async () => {
      const res = await api().delete(`/api/spmo/procurement/${procId2}`);

      expect(res.status).toBe(404);
    });

    it("should delete the remaining procurement record", async () => {
      const res = await api().delete(`/api/spmo/procurement/${procId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // Clean up budgetId1
  describe("final cleanup", () => {
    it("should delete the remaining budget entry", async () => {
      const res = await api().delete(`/api/spmo/budget/${budgetId1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
