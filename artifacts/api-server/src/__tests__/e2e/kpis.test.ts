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

describe("KPIs E2E", () => {
  let strategicKpiId: number;
  let operationalKpiId: number;

  // ── Create ───────────────────────────────────────────────────
  describe("create KPIs", () => {
    it("should create a strategic KPI", async () => {
      const res = await api()
        .post("/api/spmo/kpis")
        .send({
          type: "strategic",
          name: "E2E Strategic KPI",
          unit: "%",
          target: 95,
          actual: 40,
          baseline: 20,
          pillarId: seeds.pillarId,
          description: "A strategic KPI for E2E testing",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.type).toBe("strategic");
      expect(res.body.name).toBe("E2E Strategic KPI");
      expect(res.body.unit).toBe("%");
      expect(res.body.target).toBe(95);
      expect(res.body.actual).toBe(40);
      expect(res.body.baseline).toBe(20);
      strategicKpiId = res.body.id;
    });

    it("should create an operational KPI", async () => {
      const res = await api()
        .post("/api/spmo/kpis")
        .send({
          type: "operational",
          name: "E2E Operational KPI",
          unit: "count",
          target: 500,
          actual: 100,
          projectId: seeds.projectId,
          initiativeId: seeds.initiativeId,
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe("operational");
      expect(res.body.name).toBe("E2E Operational KPI");
      operationalKpiId = res.body.id;
    });

    it("viewer cannot create a KPI", async () => {
      setCurrentUser(VIEWER_USER);

      const res = await api()
        .post("/api/spmo/kpis")
        .send({
          type: "strategic",
          name: "Should Fail",
          unit: "%",
          target: 100,
          actual: 0,
        });

      expect(res.status).toBe(403);

      setCurrentUser(ADMIN_USER);
    });
  });

  // ── List & filter ────────────────────────────────────────────
  describe("list and filter KPIs", () => {
    it("should list all KPIs", async () => {
      const res = await api().get("/api/spmo/kpis");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("kpis");
      expect(Array.isArray(res.body.kpis)).toBe(true);

      const ids = res.body.kpis.map((k: any) => k.id);
      expect(ids).toContain(strategicKpiId);
      expect(ids).toContain(operationalKpiId);
    });

    it("should filter KPIs by type=strategic", async () => {
      const res = await api().get("/api/spmo/kpis?type=strategic");

      expect(res.status).toBe(200);
      const types = res.body.kpis.map((k: any) => k.type);
      expect(types.every((t: string) => t === "strategic")).toBe(true);
    });

    it("should filter KPIs by type=operational", async () => {
      const res = await api().get("/api/spmo/kpis?type=operational");

      expect(res.status).toBe(200);
      const types = res.body.kpis.map((k: any) => k.type);
      expect(types.every((t: string) => t === "operational")).toBe(true);
    });

    it("should filter KPIs by projectId", async () => {
      const res = await api().get(`/api/spmo/kpis?projectId=${seeds.projectId}`);

      expect(res.status).toBe(200);
      const projectIds = res.body.kpis.map((k: any) => k.projectId);
      expect(projectIds.every((pid: number) => pid === seeds.projectId)).toBe(true);
    });
  });

  // ── Update ───────────────────────────────────────────────────
  describe("update KPI", () => {
    it("should update a KPI name and target", async () => {
      const res = await api()
        .put(`/api/spmo/kpis/${strategicKpiId}`)
        .send({ name: "Updated Strategic KPI", target: 99 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Strategic KPI");
      expect(res.body.target).toBe(99);
    });

    it("should track previous actual when actual changes", async () => {
      const res = await api()
        .put(`/api/spmo/kpis/${strategicKpiId}`)
        .send({ actual: 75 });

      expect(res.status).toBe(200);
      expect(res.body.actual).toBe(75);
      expect(res.body.prevActual).toBe(40); // original actual value
    });
  });

  // ── Measurements ─────────────────────────────────────────────
  describe("KPI measurements", () => {
    let measurementId: number;

    it("should add a measurement to a KPI", async () => {
      const res = await api()
        .post(`/api/spmo/kpis/${strategicKpiId}/measurements`)
        .send({
          measuredAt: "2026-03-15",
          value: 82,
          notes: "Q1 measurement",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.kpiId).toBe(strategicKpiId);
      expect(res.body.value).toBe(82);
      expect(res.body.notes).toBe("Q1 measurement");
      measurementId = res.body.id;
    });

    it("should verify KPI actual value updates after measurement", async () => {
      const res = await api().get("/api/spmo/kpis");

      expect(res.status).toBe(200);
      const kpi = res.body.kpis.find((k: any) => k.id === strategicKpiId);
      expect(kpi).toBeDefined();
      // The measurement endpoint updates the KPI's actual to the measurement value
      expect(kpi.actual).toBe(82);
    });

    it("should get KPI measurements", async () => {
      const res = await api().get(`/api/spmo/kpis/${strategicKpiId}/measurements`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("measurements");
      expect(Array.isArray(res.body.measurements)).toBe(true);
      expect(res.body.measurements.length).toBeGreaterThanOrEqual(1);
      expect(res.body.measurements[0].value).toBe(82);
    });

    it("should add a second measurement and see updated actual", async () => {
      const res = await api()
        .post(`/api/spmo/kpis/${strategicKpiId}/measurements`)
        .send({
          measuredAt: "2026-03-28",
          value: 90,
        });

      expect(res.status).toBe(201);

      // Verify the KPI actual was updated to 90
      const kpiRes = await api().get("/api/spmo/kpis");
      const kpi = kpiRes.body.kpis.find((k: any) => k.id === strategicKpiId);
      expect(kpi.actual).toBe(90);
      // prevActual should be 82 (the previous measurement value)
      expect(kpi.prevActual).toBe(82);
    });

    it("should delete a measurement", async () => {
      const res = await api().delete(
        `/api/spmo/kpis/${strategicKpiId}/measurements/${measurementId}`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Delete ───────────────────────────────────────────────────
  describe("delete KPI", () => {
    it("should delete the operational KPI", async () => {
      const res = await api().delete(`/api/spmo/kpis/${operationalKpiId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 404 for deleted KPI", async () => {
      const res = await api().delete(`/api/spmo/kpis/${operationalKpiId}`);

      expect(res.status).toBe(404);
    });

    it("should delete the strategic KPI", async () => {
      const res = await api().delete(`/api/spmo/kpis/${strategicKpiId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
