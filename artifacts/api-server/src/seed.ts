import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

export async function seedIfEmpty(): Promise<void> {
  const res = await db.execute(sql`SELECT count(*)::int AS n FROM spmo_pillars`);
  const n = (res.rows[0] as { n: number }).n;

  if (n > 0) {
    console.log("[seed] Data already present — skipping full seed.");
    return;
  }

  console.log("[seed] Empty database — loading full dataset...");

  await db.execute(sql`SET session_replication_role = replica`);
  try {
    let seedPath: string;
    if (typeof __dirname !== "undefined") {
      seedPath = resolve(__dirname, "seed-full.sql");
    } else {
      const { fileURLToPath } = await import("url");
      seedPath = resolve(dirname(fileURLToPath(import.meta.url)), "seed-full.sql");
    }
    if (!existsSync(seedPath)) {
      console.log(`[seed] seed-full.sql not found at ${seedPath} — skipping.`);
      return;
    }
    const seedSql = readFileSync(seedPath, "utf-8");

    const statements = seedSql
      .split("\n")
      .filter((line) => line.trim().startsWith("INSERT INTO"))
      .map((line) => line.trim());

    let loaded = 0;
    for (const stmt of statements) {
      await db.execute(sql.raw(stmt));
      loaded++;
    }

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
  } finally {
    await db.execute(sql`SET session_replication_role = DEFAULT`);
  }
}
