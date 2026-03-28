import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestApp,
  api,
  seedTestData,
  cleanupTestData,
  setCurrentUser,
  ADMIN_USER,
  PM_USER,
  APPROVER_USER,
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

describe("Milestones & Evidence E2E", () => {
  // ── Evidence upload ──────────────────────────────────────────
  let evidenceId: number;

  describe("evidence management", () => {
    it("should upload evidence to a milestone", async () => {
      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/evidence`)
        .send({
          fileName: "test-report.pdf",
          objectPath: "/uploads/e2e/test-report.pdf",
          contentType: "application/pdf",
          description: "E2E test evidence",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.fileName).toBe("test-report.pdf");
      expect(res.body.objectPath).toBe("/uploads/e2e/test-report.pdf");
      expect(res.body.milestoneId).toBe(seeds.milestoneId);
      evidenceId = res.body.id;
    });

    it("should delete evidence", async () => {
      // Upload a second piece of evidence to delete
      const upload = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/evidence`)
        .send({
          fileName: "to-delete.pdf",
          objectPath: "/uploads/e2e/to-delete.pdf",
        });
      expect(upload.status).toBe(201);

      const res = await api().delete(`/api/spmo/evidence/${upload.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Submit guards ────────────────────────────────────────────
  describe("milestone submission guards", () => {
    it("should not submit if progress < 100", async () => {
      // milestoneId has progress=50 from seed
      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/submit`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/progress must be 100/i);
    });

    it("should not submit without evidence (milestone2 has none)", async () => {
      // First set milestone2 progress to 100
      await api()
        .put(`/api/spmo/milestones/${seeds.milestone2Id}`)
        .send({ progress: 100, status: "in_progress" });

      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestone2Id}/submit`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/evidence/i);
    });
  });

  // ── Full approval flow ───────────────────────────────────────
  describe("milestone approval flow", () => {
    it("should set milestone progress to 100 and submit successfully", async () => {
      // Update progress to 100
      const update = await api()
        .put(`/api/spmo/milestones/${seeds.milestoneId}`)
        .send({ progress: 100 });
      expect(update.status).toBe(200);

      // Evidence was already uploaded above, so submit should work
      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/submit`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("submitted");
      expect(res.body.submittedAt).toBeTruthy();
    });

    it("PM cannot approve their own milestone (role check)", async () => {
      setCurrentUser(PM_USER);

      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/approve`)
        .send();

      // PM role is "project-manager", not "admin" or "approver"
      expect(res.status).toBe(403);

      setCurrentUser(ADMIN_USER);
    });

    it("viewer cannot approve milestones", async () => {
      setCurrentUser(VIEWER_USER);

      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/approve`)
        .send();

      expect(res.status).toBe(403);

      setCurrentUser(ADMIN_USER);
    });

    it("should reject milestone with comment (as approver)", async () => {
      setCurrentUser(APPROVER_USER);

      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/reject`)
        .send({ reason: "Insufficient documentation — please add test results" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("rejected");
      expect(res.body.rejectionReason).toMatch(/Insufficient documentation/);
      expect(res.body.rejectedById).toBe(APPROVER_USER.id);

      setCurrentUser(ADMIN_USER);
    });

    it("should re-submit after rejection and then approve", async () => {
      // Re-submit as admin (milestone is now rejected, progress is still 100, evidence exists)
      const submit = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/submit`)
        .send();

      expect(submit.status).toBe(200);
      expect(submit.body.status).toBe("submitted");

      // Approve as approver
      setCurrentUser(APPROVER_USER);

      const approve = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/approve`)
        .send();

      expect(approve.status).toBe(200);
      expect(approve.body.status).toBe("approved");
      expect(approve.body.approvedById).toBe(APPROVER_USER.id);
      expect(approve.body.approvedAt).toBeTruthy();

      setCurrentUser(ADMIN_USER);
    });

    it("cannot submit an already-approved milestone", async () => {
      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestoneId}/submit`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot submit/i);
    });

    it("cannot approve a non-submitted milestone", async () => {
      // milestone2 is in_progress, not submitted
      setCurrentUser(APPROVER_USER);

      const res = await api()
        .post(`/api/spmo/milestones/${seeds.milestone2Id}/approve`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only submitted/i);

      setCurrentUser(ADMIN_USER);
    });
  });
});
