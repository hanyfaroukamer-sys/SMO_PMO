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
let createdDocId: number;

beforeAll(async () => {
  await getTestApp();
  seeds = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("Documents API", () => {
  it("POST /api/spmo/documents — creates a document", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/documents")
      .send({
        projectId: seeds.projectId,
        title: "E2E Test Charter",
        description: "A test document for E2E",
        category: "charter",
        fileName: "charter.pdf",
        contentType: "application/pdf",
        objectPath: "/uploads/e2e/charter.pdf",
        tags: ["e2e", "test"],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.title).toBe("E2E Test Charter");
    expect(res.body.category).toBe("charter");
    expect(res.body.version).toBe(1);
    expect(res.body.projectId).toBe(seeds.projectId);
    createdDocId = res.body.id;
  });

  it("GET /api/spmo/documents — lists documents", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .get("/api/spmo/documents")
      .query({ projectId: seeds.projectId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("documents");
    expect(Array.isArray(res.body.documents)).toBe(true);
    const found = res.body.documents.find(
      (d: { id: number }) => d.id === createdDocId,
    );
    expect(found).toBeDefined();
    expect(found.title).toBe("E2E Test Charter");
  });

  it("GET /api/spmo/documents/:id — gets document by ID", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get(`/api/spmo/documents/${createdDocId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdDocId);
    expect(res.body.title).toBe("E2E Test Charter");
  });

  it("GET /api/spmo/documents/:id — returns 404 for missing document", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get("/api/spmo/documents/999999");

    expect(res.status).toBe(404);
  });

  it("PATCH /api/spmo/documents/:id — updates document", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .patch(`/api/spmo/documents/${createdDocId}`)
      .send({
        title: "Updated Charter Title",
        category: "plan",
        tags: ["e2e", "updated"],
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Charter Title");
    expect(res.body.category).toBe("plan");
  });

  it("PATCH /api/spmo/documents/:id — bumps version when objectPath changes", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .patch(`/api/spmo/documents/${createdDocId}`)
      .send({
        objectPath: "/uploads/e2e/charter_v2.pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.version).toBeGreaterThanOrEqual(2);
  });

  it("VIEWER cannot create a document (403)", async () => {
    setCurrentUser(VIEWER_USER);

    const res = await api()
      .post("/api/spmo/documents")
      .send({
        projectId: seeds.projectId,
        title: "Viewer Doc",
        fileName: "viewer.pdf",
        objectPath: "/uploads/e2e/viewer.pdf",
      });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM can create a document on their own project", async () => {
    setCurrentUser(PM_USER);

    const res = await api()
      .post("/api/spmo/documents")
      .send({
        projectId: seeds.projectId,
        title: "PM Document",
        fileName: "pm-doc.pdf",
        objectPath: "/uploads/e2e/pm-doc.pdf",
        category: "report",
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("PM Document");

    // Clean up
    setCurrentUser(ADMIN_USER);
    await api().delete(`/api/spmo/documents/${res.body.id}`);
  });

  it("DELETE /api/spmo/documents/:id — deletes document", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete(`/api/spmo/documents/${createdDocId}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Confirm it is gone
    const check = await api().get(`/api/spmo/documents/${createdDocId}`);
    expect(check.status).toBe(404);
  });
});
