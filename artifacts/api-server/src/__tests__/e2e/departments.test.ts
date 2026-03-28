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
let createdDeptId: number;

beforeAll(async () => {
  await getTestApp();
  seeds = await seedTestData();
});

afterAll(async () => {
  // Clean up the department we created in tests (if it still exists)
  if (createdDeptId) {
    setCurrentUser(ADMIN_USER);
    await api().delete(`/api/spmo/departments/${createdDeptId}`).catch(() => {});
  }
  await cleanupTestData();
});

describe("Departments API", () => {
  it("POST /api/spmo/departments — admin creates a department", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .post("/api/spmo/departments")
      .send({
        name: "E2E Test Department",
        description: "Created by E2E test",
        color: "#FF5733",
        sortOrder: 99,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("E2E Test Department");
    expect(res.body.color).toBe("#FF5733");
    createdDeptId = res.body.id;
  });

  it("GET /api/spmo/departments — lists all departments", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().get("/api/spmo/departments");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("departments");
    expect(Array.isArray(res.body.departments)).toBe(true);

    const found = res.body.departments.find(
      (d: { id: number }) => d.id === createdDeptId,
    );
    expect(found).toBeDefined();
    expect(found.name).toBe("E2E Test Department");
    // Stats should be present
    expect(found).toHaveProperty("projectCount");
    expect(found).toHaveProperty("progress");
  });

  it("PUT /api/spmo/departments/:id — admin updates a department", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api()
      .put(`/api/spmo/departments/${createdDeptId}`)
      .send({
        name: "Updated Dept Name",
        description: "Updated description",
        color: "#00FF00",
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Dept Name");
    expect(res.body.color).toBe("#00FF00");
  });

  it("GET /api/spmo/departments/:id/portfolio — gets department portfolio", async () => {
    setCurrentUser(ADMIN_USER);

    // Use the seed department which has projects linked to it
    const res = await api().get(
      `/api/spmo/departments/${seeds.departmentId}/portfolio`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("department");
    expect(res.body).toHaveProperty("projects");
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  it("PM cannot create a department (403)", async () => {
    setCurrentUser(PM_USER);

    const res = await api()
      .post("/api/spmo/departments")
      .send({
        name: "PM Attempt Dept",
        description: "Should fail",
      });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("VIEWER cannot create a department (403)", async () => {
    setCurrentUser(VIEWER_USER);

    const res = await api()
      .post("/api/spmo/departments")
      .send({
        name: "Viewer Attempt Dept",
      });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot update a department (403)", async () => {
    setCurrentUser(PM_USER);

    const res = await api()
      .put(`/api/spmo/departments/${createdDeptId}`)
      .send({ name: "PM Update Attempt" });

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("PM cannot delete a department (403)", async () => {
    setCurrentUser(PM_USER);

    const res = await api().delete(
      `/api/spmo/departments/${createdDeptId}`,
    );

    expect(res.status).toBe(403);
    setCurrentUser(ADMIN_USER);
  });

  it("DELETE /api/spmo/departments/:id — admin deletes a department", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete(
      `/api/spmo/departments/${createdDeptId}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Confirm deletion returns 404
    const check = await api().get("/api/spmo/departments");
    const found = check.body.departments.find(
      (d: { id: number }) => d.id === createdDeptId,
    );
    expect(found).toBeUndefined();

    // Prevent afterAll from trying to delete again
    createdDeptId = 0;
  });

  it("DELETE /api/spmo/departments/:id — returns 404 for non-existent", async () => {
    setCurrentUser(ADMIN_USER);

    const res = await api().delete("/api/spmo/departments/999999");

    expect(res.status).toBe(404);
  });
});
