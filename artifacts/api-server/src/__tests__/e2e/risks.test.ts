import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestApp,
  api,
  seedTestData,
  cleanupTestData,
  setCurrentUser,
  ADMIN_USER,
  PM_USER,
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

describe("Risks E2E", () => {
  let riskId: number;
  let mitigationId: number;

  // ── Create ───────────────────────────────────────────────────
  describe("create risk", () => {
    it("should create a risk with computed score", async () => {
      const res = await api()
        .post("/api/spmo/risks")
        .send({
          projectId: seeds.projectId,
          title: "E2E Test Risk - Data Loss",
          description: "Risk of data loss during migration",
          category: "technical",
          probability: "high",
          impact: "critical",
          owner: "E2E Admin",
          status: "open",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.title).toBe("E2E Test Risk - Data Loss");
      expect(res.body.probability).toBe("high");
      expect(res.body.impact).toBe("critical");
      // Risk score = probability(3) * impact(4) = 12
      expect(res.body.riskScore).toBe(12);
      expect(res.body.status).toBe("open");
      riskId = res.body.id;
    });

    it("should create a low-severity risk", async () => {
      const res = await api()
        .post("/api/spmo/risks")
        .send({
          projectId: seeds.projectId,
          title: "E2E Low Risk",
          probability: "low",
          impact: "low",
        });

      expect(res.status).toBe(201);
      // Risk score = probability(1) * impact(1) = 1
      expect(res.body.riskScore).toBe(1);
    });

    it("viewer cannot create a risk", async () => {
      setCurrentUser(VIEWER_USER);

      const res = await api()
        .post("/api/spmo/risks")
        .send({
          projectId: seeds.projectId,
          title: "Should Fail",
          probability: "low",
          impact: "low",
        });

      expect(res.status).toBe(403);

      setCurrentUser(ADMIN_USER);
    });
  });

  // ── List ─────────────────────────────────────────────────────
  describe("list risks", () => {
    it("should list all risks ordered by risk score descending", async () => {
      const res = await api().get("/api/spmo/risks");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("risks");
      expect(Array.isArray(res.body.risks)).toBe(true);
      expect(res.body.risks.length).toBeGreaterThanOrEqual(2);

      // Verify descending order by riskScore
      const scores = res.body.risks.map((r: any) => r.riskScore);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it("should include mitigations array on each risk", async () => {
      const res = await api().get("/api/spmo/risks");

      expect(res.status).toBe(200);
      for (const risk of res.body.risks) {
        expect(risk).toHaveProperty("mitigations");
        expect(Array.isArray(risk.mitigations)).toBe(true);
      }
    });
  });

  // ── Update ───────────────────────────────────────────────────
  describe("update risk", () => {
    it("should update risk status and probability", async () => {
      const res = await api()
        .put(`/api/spmo/risks/${riskId}`)
        .send({
          status: "mitigated",
          probability: "medium",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("mitigated");
      expect(res.body.probability).toBe("medium");
      // Risk score recalculated: medium(2) * critical(4) = 8
      expect(res.body.riskScore).toBe(8);
    });

    it("should update risk impact and recalculate score", async () => {
      const res = await api()
        .put(`/api/spmo/risks/${riskId}`)
        .send({ impact: "medium" });

      expect(res.status).toBe(200);
      expect(res.body.impact).toBe("medium");
      // Risk score: medium(2) * medium(2) = 4
      expect(res.body.riskScore).toBe(4);
    });

    it("should return 404 for non-existent risk", async () => {
      const res = await api()
        .put("/api/spmo/risks/999999")
        .send({ title: "Does not exist" });

      expect(res.status).toBe(404);
    });
  });

  // ── Mitigations ──────────────────────────────────────────────
  describe("risk mitigations", () => {
    it("should create a mitigation for a risk", async () => {
      const res = await api()
        .post(`/api/spmo/risks/${riskId}/mitigations`)
        .send({
          description: "Implement daily backups and recovery testing",
          status: "planned",
          dueDate: "2026-06-30",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.riskId).toBe(riskId);
      expect(res.body.description).toBe("Implement daily backups and recovery testing");
      expect(res.body.status).toBe("planned");
      mitigationId = res.body.id;
    });

    it("should update a mitigation", async () => {
      const res = await api()
        .put(`/api/spmo/mitigations/${mitigationId}`)
        .send({
          status: "in_progress",
          description: "Daily backups implemented, recovery testing in progress",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("in_progress");
      expect(res.body.description).toMatch(/recovery testing in progress/);
    });

    it("should see mitigation when listing risks", async () => {
      const res = await api().get("/api/spmo/risks");

      expect(res.status).toBe(200);
      const risk = res.body.risks.find((r: any) => r.id === riskId);
      expect(risk).toBeDefined();
      expect(risk.mitigations.length).toBeGreaterThanOrEqual(1);
      expect(risk.mitigations[0].id).toBe(mitigationId);
    });

    it("should return 404 when creating mitigation for non-existent risk", async () => {
      const res = await api()
        .post("/api/spmo/risks/999999/mitigations")
        .send({ description: "Should fail" });

      expect(res.status).toBe(404);
    });
  });

  // ── Delete ───────────────────────────────────────────────────
  describe("delete risk", () => {
    it("should delete the risk", async () => {
      const res = await api().delete(`/api/spmo/risks/${riskId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 404 for deleted risk", async () => {
      const res = await api().delete(`/api/spmo/risks/${riskId}`);

      expect(res.status).toBe(404);
    });
  });

  // ── Risk score verification ──────────────────────────────────
  describe("risk score calculation matrix", () => {
    it("low x low = 1", async () => {
      const res = await api().post("/api/spmo/risks").send({
        projectId: seeds.projectId,
        title: "Score test: low x low",
        probability: "low",
        impact: "low",
      });
      expect(res.status).toBe(201);
      expect(res.body.riskScore).toBe(1);
    });

    it("medium x high = 6", async () => {
      const res = await api().post("/api/spmo/risks").send({
        projectId: seeds.projectId,
        title: "Score test: medium x high",
        probability: "medium",
        impact: "high",
      });
      expect(res.status).toBe(201);
      expect(res.body.riskScore).toBe(6);
    });

    it("critical x critical = 16", async () => {
      const res = await api().post("/api/spmo/risks").send({
        projectId: seeds.projectId,
        title: "Score test: critical x critical",
        probability: "critical",
        impact: "critical",
      });
      expect(res.status).toBe(201);
      expect(res.body.riskScore).toBe(16);
    });
  });
});
