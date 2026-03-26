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

  // Reset each sequence individually — spmo_programme_config uses a plain default (no sequence)
  const seqTables: [string, string][] = [
    ['spmo_pillars_id_seq',           'spmo_pillars'],
    ['spmo_departments_id_seq',       'spmo_departments'],
    ['spmo_initiatives_id_seq',       'spmo_initiatives'],
    ['spmo_projects_id_seq',          'spmo_projects'],
    ['spmo_milestones_id_seq',        'spmo_milestones'],
    ['spmo_kpis_id_seq',              'spmo_kpis'],
    ['spmo_risks_id_seq',             'spmo_risks'],
    ['spmo_budget_entries_id_seq',    'spmo_budget_entries'],
    ['spmo_procurement_id_seq',       'spmo_procurement'],
    ['spmo_kpi_measurements_id_seq',  'spmo_kpi_measurements'],
    ['spmo_evidence_id_seq',          'spmo_evidence'],
    ['spmo_actions_id_seq',           'spmo_actions'],
    ['spmo_change_requests_id_seq',   'spmo_change_requests'],
    ['spmo_raci_id_seq',              'spmo_raci'],
    ['spmo_mitigations_id_seq',       'spmo_mitigations'],
  ];
  for (const [seq, tbl] of seqTables) {
    try {
      await db.execute(sql.raw(
        `SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${tbl}), 1))`
      ));
    } catch (e: any) {
      console.warn(`[seed] Could not reset sequence ${seq}: ${e.message}`);
    }
  }

  console.log(`[seed] Loaded ${loaded} rows successfully.`);
}
