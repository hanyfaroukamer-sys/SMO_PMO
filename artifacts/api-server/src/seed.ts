import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

export async function seedIfEmpty(): Promise<void> {
  const forceReseed = process.env.FORCE_RESEED === "1" || process.env.FORCE_RESEED === "true";

  if (!forceReseed) {
    const res = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM spmo_pillars)  AS pillars,
        (SELECT count(*)::int FROM spmo_projects) AS projects
    `);
    const { pillars, projects } = res.rows[0] as { pillars: number; projects: number };

    if (pillars >= 9 && projects >= 50) {
      console.log(`[seed] Data already present (${pillars} pillars, ${projects} projects) — skipping full seed.`);
      return;
    }

    console.log(`[seed] Incomplete data detected (${pillars} pillars, ${projects} projects) — reloading full dataset...`);
  } else {
    console.log("[seed] FORCE_RESEED=1 — forcing full dataset reload...");
  }

  // Truncate all SPMO tables before reloading (CASCADE handles FK order)
  await db.execute(sql`
    TRUNCATE TABLE
      spmo_raci,
      spmo_mitigations,
      spmo_change_requests,
      spmo_actions,
      spmo_evidence,
      spmo_kpi_measurements,
      spmo_procurement,
      spmo_budget_entries,
      spmo_risks,
      spmo_kpis,
      spmo_milestones,
      spmo_projects,
      spmo_initiatives,
      spmo_programme_config,
      spmo_pillars,
      spmo_departments
    RESTART IDENTITY CASCADE
  `);
  console.log("[seed] All SPMO tables truncated.");

  const demoMode = process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
  const seedFile = demoMode ? "seed-demo.sql" : "seed-full.sql";
  console.log(`[seed] Loading ${demoMode ? "DEMO (NSA)" : "full (KFCA)"} dataset from ${seedFile}…`);

  let seedPath: string;
  if (typeof __dirname !== "undefined") {
    seedPath = resolve(__dirname, seedFile);
  } else {
    const { fileURLToPath } = await import("url");
    seedPath = resolve(dirname(fileURLToPath(import.meta.url)), seedFile);
  }
  if (!existsSync(seedPath)) {
    console.log(`[seed] ${seedFile} not found at ${seedPath} — skipping.`);
    return;
  }
  const seedSql = readFileSync(seedPath, "utf-8");

  // Extract INSERT statements — seed-full.sql inserts tables in FK-safe order
  const statements = seedSql
    .split("\n")
    .filter((line) => line.trim().startsWith("INSERT INTO"))
    .map((line) => line.trim());

  let loaded = 0;
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
    loaded++;
  }

  // Reset all sequences to avoid PK collisions on future inserts
  await db.execute(sql`
    SELECT setval('spmo_pillars_id_seq',             COALESCE((SELECT MAX(id) FROM spmo_pillars), 1));
    SELECT setval('spmo_departments_id_seq',          COALESCE((SELECT MAX(id) FROM spmo_departments), 1));
    SELECT setval('spmo_programme_config_id_seq',     COALESCE((SELECT MAX(id) FROM spmo_programme_config), 1));
    SELECT setval('spmo_initiatives_id_seq',          COALESCE((SELECT MAX(id) FROM spmo_initiatives), 1));
    SELECT setval('spmo_projects_id_seq',             COALESCE((SELECT MAX(id) FROM spmo_projects), 1));
    SELECT setval('spmo_milestones_id_seq',           COALESCE((SELECT MAX(id) FROM spmo_milestones), 1));
    SELECT setval('spmo_kpis_id_seq',                 COALESCE((SELECT MAX(id) FROM spmo_kpis), 1));
    SELECT setval('spmo_risks_id_seq',                COALESCE((SELECT MAX(id) FROM spmo_risks), 1));
    SELECT setval('spmo_budget_entries_id_seq',       COALESCE((SELECT MAX(id) FROM spmo_budget_entries), 1));
    SELECT setval('spmo_procurement_id_seq',          COALESCE((SELECT MAX(id) FROM spmo_procurement), 1));
    SELECT setval('spmo_kpi_measurements_id_seq',     COALESCE((SELECT MAX(id) FROM spmo_kpi_measurements), 1));
    SELECT setval('spmo_evidence_id_seq',             COALESCE((SELECT MAX(id) FROM spmo_evidence), 1));
    SELECT setval('spmo_actions_id_seq',              COALESCE((SELECT MAX(id) FROM spmo_actions), 1));
    SELECT setval('spmo_change_requests_id_seq',      COALESCE((SELECT MAX(id) FROM spmo_change_requests), 1));
    SELECT setval('spmo_raci_id_seq',                 COALESCE((SELECT MAX(id) FROM spmo_raci), 1));
    SELECT setval('spmo_mitigations_id_seq',          COALESCE((SELECT MAX(id) FROM spmo_mitigations), 1));
  `);

  console.log(`[seed] Loaded ${loaded} rows successfully.`);
}
