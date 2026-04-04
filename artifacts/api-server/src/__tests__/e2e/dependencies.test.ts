import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestApp,
  api,
  setCurrentUser,
  seedTestData,
  cleanupTestData,
  ADMIN_USER,
  VIEWER_USER,
  type TestSeeds,
} from "./helpers";

let seeds: TestSeeds;
let depIdAB: number;

beforeAll(async () => {
  await getTestApp();
  seeds = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("Dependencies API", () => {
  it("POST /api/spmo/dependencies — creates a milestone-to-milestone dependency", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/dependencies")
      .send({
        sourceType: "milestone",
        sourceId: seeds.milestoneId,
        targetType: "milestone",
        targetId: seeds.milestone2Id,
        depType: "ms-ms",
        sourceThreshold: 100,
        lagDays: 0,
        isHard: true,
        notes: "E2E test dependency",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.sourceId).toBe(seeds.milestoneId);
    expect(res.body.targetId).toBe(seeds.milestone2Id);
    expect(res.body.depType).toBe("ms-ms");
    depIdAB = res.body.id;
  });

  it("POST /api/spmo/dependencies — rejects duplicate dependency (409)", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/dependencies")
      .send({
        sourceType: "milestone",
        sourceId: seeds.milestoneId,
        targetType: "milestone",
        targetId: seeds.milestone2Id,
        depType: "ms-ms",
      });

    expect(res.status).toBe(409);
  });

  it("POST /api/spmo/dependencies — rejects self-referencing dependency", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/dependencies")
      .send({
        sourceType: "milestone",
        sourceId: seeds.milestoneId,
        targetType: "milestone",
        targetId: seeds.milestoneId,
        depType: "ms-ms",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/same/i);
  });

  it("POST /api/spmo/dependencies — detects cycle (B→A when A→B exists)", async () => {
    setCurrentUser(ADMIN_USER);

    // A→B already exists (milestoneId → milestone2Id). Try B→A.
    const res = await api()
      .post("/api/spmo/dependencies")
      .send({
        sourceType: "milestone",
        sourceId: seeds.milestone2Id,
        targetType: "milestone",
        targetId: seeds.milestoneId,
        depType: "ms-ms",
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/circular/i);
  });

  it("VIEWER cannot create a dependency (403)", async () => {
    setCurrentUser(VIEWER_USER);

    const res = await api()
      .post("/api/spmo/dependencies")
      .send({
        sourceType: "milestone",
        sourceId: seeds.milestoneId,
        targetType: "milestone",
        targetId: seeds.milestone2Id,
        depType: "ms-ms",
      });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("GET /api/spmo/dependencies — lists all dependencies", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get("/api/spmo/dependencies");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dependencies");
    expect(Array.isArray(res.body.dependencies)).toBe(true);

    const found = res.body.dependencies.find(
      (d: { id: number }) => d.id === depIdAB,
    );
    expect(found).toBeDefined();
    expect(found.sourceName).toBeTruthy();
    expect(found.targetName).toBeTruthy();
  });

  it("GET /api/spmo/dependencies/resolve — resolves dependencies for a target", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .get("/api/spmo/dependencies/resolve")
      .query({
        targetId: seeds.milestone2Id,
        targetType: "milestone",
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
  });

  it("GET /api/spmo/dependencies/resolve — returns 400 without required params", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get("/api/spmo/dependencies/resolve");

    expect(res.status).toBe(400);
  });

  it("GET /api/spmo/dependencies/resolve-project — resolves all project dependencies", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .get("/api/spmo/dependencies/resolve-project")
      .query({ projectId: seeds.projectId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("resolutions");
    // Should have entries for milestones in this project
    expect(typeof res.body.resolutions).toBe("object");
  });

  it("GET /api/spmo/dependencies/cascade — analyzes cascade impact", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .get("/api/spmo/dependencies/cascade")
      .query({ sourceId: seeds.milestoneId });

    expect(res.status).toBe(200);
    // cascade analysis returns some structure
    expect(res.body).toBeDefined();
  });

  it("GET /api/spmo/dependencies/cascade — returns 400 without sourceId", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get("/api/spmo/dependencies/cascade");

    expect(res.status).toBe(400);
  });

  it("DELETE /api/spmo/dependencies/:id — deletes a dependency", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete(`/api/spmo/dependencies/${depIdAB}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Confirm it is gone from the list
    const list = await api().get("/api/spmo/dependencies");
    const found = list.body.dependencies.find(
      (d: { id: number }) => d.id === depIdAB,
    );
    expect(found).toBeUndefined();
  });

  it("DELETE /api/spmo/dependencies/:id — returns 404 for non-existent", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete("/api/spmo/dependencies/999999");

    expect(res.status).toBe(404);
  });
});
