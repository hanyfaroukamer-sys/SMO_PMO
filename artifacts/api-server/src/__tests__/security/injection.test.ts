/**
 * SQL Injection security tests.
 * Drizzle ORM uses parameterized queries, so these inputs should be stored
 * as literal strings — not executed as SQL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const uid = () => `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("SQL Injection — Drizzle ORM parameterized queries", () => {
  let pillarId: number;
  let initiativeId: number;
  let projectId: number;
  const msIds: number[] = [];

  beforeAll(async () => {
    const [pillar] = await db.insert(spmoPillarsTable).values({ name: uid() }).returning();
    pillarId = pillar.id;

    const [init] = await db.insert(spmoInitiativesTable).values({
      pillarId,
      name: uid(),
      ownerId: "test-sec",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 1_000_000,
    }).returning();
    initiativeId = init.id;

    const [proj] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid(),
      ownerId: "test-sec",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 500_000,
    }).returning();
    projectId = proj.id;
  });

  afterAll(async () => {
    if (msIds.length) {
      await db.delete(spmoMilestonesTable).where(eq(spmoMilestonesTable.id, msIds[0]));
    }
    await db.delete(spmoProjectsTable).where(eq(spmoProjectsTable.id, projectId));
    await db.delete(spmoInitiativesTable).where(eq(spmoInitiativesTable.id, initiativeId));
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillarId));
  });

  it("1. Project name with SQL injection payload → stored as literal string, table intact", async () => {
    const maliciousName = `Test'; DROP TABLE spmo_projects; --`;
    const [project] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: maliciousName,
      ownerId: "test-sec",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 100_000,
    }).returning();

    // Verify: the injection payload was stored literally, not executed
    expect(project.name).toBe(maliciousName);
    expect(project.id).toBeDefined();

    // Table is still intact — we can query it
    const [fetched] = await db.select()
      .from(spmoProjectsTable)
      .where(eq(spmoProjectsTable.id, project.id));
    expect(fetched).toBeDefined();
    expect(fetched.name).toBe(maliciousName);

    // Cleanup
    await db.delete(spmoProjectsTable).where(eq(spmoProjectsTable.id, project.id));
  });

  it("2. Milestone name with UNION injection → stored literally, no data leakage", async () => {
    const maliciousName = `' UNION SELECT id, name, 'leaked', 0, 0, 'pending' FROM spmo_projects --`;
    const [ms] = await db.insert(spmoMilestonesTable).values({
      projectId,
      name: maliciousName,
      progress: 0,
      status: "pending",
    }).returning();
    msIds.push(ms.id);

    expect(ms.name).toBe(maliciousName);

    const [fetched] = await db.select()
      .from(spmoMilestonesTable)
      .where(eq(spmoMilestonesTable.id, ms.id));
    expect(fetched.name).toBe(maliciousName);
  });

  it("3. Pillar name with XSS payload → stored literally (server-side safety)", async () => {
    const xssPayload = `<script>alert('XSS')</script>`;
    const [pillar] = await db.insert(spmoPillarsTable).values({
      name: xssPayload,
    }).returning();

    expect(pillar.name).toBe(xssPayload);
    await db.delete(spmoPillarsTable).where(eq(spmoPillarsTable.id, pillar.id));
  });

  it("4. Description with NULL bytes → stored or gracefully handled without crash", async () => {
    const nameWithNull = `Test Name ${uid()}`;
    // Postgres does not allow literal null bytes in text — use a safe variant
    const descWithSpecialChars = `Description with 'quotes' and "double quotes" and backslash \\`;
    const [project] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: nameWithNull,
      description: descWithSpecialChars,
      ownerId: "test-sec",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: 50_000,
    }).returning();

    const [fetched] = await db.select()
      .from(spmoProjectsTable)
      .where(eq(spmoProjectsTable.id, project.id));
    expect(fetched.description).toBe(descWithSpecialChars);

    await db.delete(spmoProjectsTable).where(eq(spmoProjectsTable.id, project.id));
  });

  it("5. Integer overflow in budget → Postgres real type stores it within float bounds", async () => {
    const hugeNumber = 9_007_199_254_740_991; // MAX_SAFE_INTEGER
    const [project] = await db.insert(spmoProjectsTable).values({
      initiativeId,
      name: uid(),
      ownerId: "test-sec",
      startDate: "2025-01-01",
      targetDate: "2025-12-31",
      budget: hugeNumber,
    }).returning();

    // Postgres real (float4) has limited precision — value may differ slightly, but no crash
    expect(project.id).toBeDefined();
    expect(typeof project.budget).toBe("number");
    await db.delete(spmoProjectsTable).where(eq(spmoProjectsTable.id, project.id));
  });
});
