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

describe("Report Generation E2E", () => {
  let seeds: TestSeeds;

  beforeAll(async () => {
    await getTestApp();
    seeds = await seedTestData();
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── PDF Reports ──────────────────────────────────────────────

  it("POST /api/spmo/reports/pdf generates a PDF with correct content-type", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post("/api/spmo/reports/pdf")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    // PDF files start with %PDF
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    expect(body.slice(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("POST /api/spmo/reports/pdf returns non-empty content", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post("/api/spmo/reports/pdf")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const body = res.body as Buffer;
    // A real PDF with programme data should be at least a few KB
    expect(body.length).toBeGreaterThan(1000);
  }, 30_000);

  it("PM can generate PDF reports", async () => {
    setCurrentUser(PM_USER);
    const res = await api()
      .post("/api/spmo/reports/pdf")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  // ── PPTX Reports ─────────────────────────────────────────────

  it("POST /api/spmo/reports/pptx generates a PPTX with correct content-type", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post("/api/spmo/reports/pptx")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    // PPTX is a zip file, content-type may vary
    expect(res.headers["content-type"]).toMatch(
      /application\/(vnd\.openxmlformats|octet-stream|zip)/,
    );
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    // ZIP/PPTX files start with PK (0x50 0x4B)
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);
  }, 30_000);

  it("POST /api/spmo/reports/pptx returns non-empty content", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post("/api/spmo/reports/pptx")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const body = res.body as Buffer;
    // A real PPTX with programme data should be at least a few KB
    expect(body.length).toBeGreaterThan(1000);
  }, 30_000);

  it("PM can generate PPTX reports", async () => {
    setCurrentUser(PM_USER);
    const res = await api()
      .post("/api/spmo/reports/pptx")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  // ── Viewer can also generate reports ─────────────────────────

  it("viewer can generate PDF reports (read-only action)", async () => {
    setCurrentUser(VIEWER_USER);
    const res = await api()
      .post("/api/spmo/reports/pdf")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    setCurrentUser(ADMIN_USER);
  }, 30_000);

  // ── Unauthenticated user cannot generate reports ─────────────

  it("unauthenticated user cannot generate PDF reports", async () => {
    setCurrentUser({ id: "", email: "", firstName: "", lastName: "", role: "" });
    const res = await api().post("/api/spmo/reports/pdf").send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/[Aa]uthentication/);
    setCurrentUser(ADMIN_USER);
  });

  it("unauthenticated user cannot generate PPTX reports", async () => {
    setCurrentUser({ id: "", email: "", firstName: "", lastName: "", role: "" });
    const res = await api().post("/api/spmo/reports/pptx").send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/[Aa]uthentication/);
    setCurrentUser(ADMIN_USER);
  });

  // ── Content-Disposition header ───────────────────────────────

  it("PDF response includes Content-Disposition attachment header", async () => {
    setCurrentUser(ADMIN_USER);
    const res = await api()
      .post("/api/spmo/reports/pdf")
      .send({})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/\.pdf/);
  }, 30_000);
});
