import { Router } from "express";
import multer from "multer";
import { XMLParser } from "fast-xml-parser";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoDepartmentsTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoKpisTable,
  spmoKpiMeasurementsTable,
  spmoRisksTable,
  spmoMitigationsTable,
  spmoBudgetTable,
  spmoProcurementTable,
  spmoProgrammeConfigTable,
  spmoProjectWeeklyReportsTable,
  spmoChangeRequestsTable,
  spmoRaciTable,
  spmoActionsTable,
} from "@workspace/db";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Auth helper ────────────────────────────────────────────────────────────

function requireAuth(req: any, res: any): string | null {
  const userId = (req as any).userId as string | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorised" }); return null; }
  return userId;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function xe(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlField(name: string, val: unknown): string {
  return `    <${name}>${xe(val)}</${name}>\n`;
}

function xmlRow(tag: string, row: Record<string, unknown>): string {
  let s = `  <${tag}>\n`;
  for (const [k, v] of Object.entries(row)) {
    s += xmlField(k, v);
  }
  s += `  </${tag}>\n`;
  return s;
}

function xmlSection(sectionTag: string, rowTag: string, rows: Record<string, unknown>[]): string {
  let s = `<${sectionTag}>\n`;
  for (const row of rows) s += xmlRow(rowTag, row);
  s += `</${sectionTag}>\n`;
  return s;
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

router.get("/spmo/data/export", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const [config, pillars, departments, initiatives, projects, milestones,
      kpis, measurements, risks, mitigations, budgets, procurement,
      weeklyReports, changeRequests, raci, actions] = await Promise.all([
      db.select().from(spmoProgrammeConfigTable),
      db.select().from(spmoPillarsTable),
      db.select().from(spmoDepartmentsTable),
      db.select().from(spmoInitiativesTable),
      db.select().from(spmoProjectsTable),
      db.select().from(spmoMilestonesTable),
      db.select().from(spmoKpisTable),
      db.select().from(spmoKpiMeasurementsTable),
      db.select().from(spmoRisksTable),
      db.select().from(spmoMitigationsTable),
      db.select().from(spmoBudgetTable),
      db.select().from(spmoProcurementTable),
      db.select().from(spmoProjectWeeklyReportsTable),
      db.select().from(spmoChangeRequestsTable),
      db.select().from(spmoRaciTable),
      db.select().from(spmoActionsTable),
    ]);

    const now = new Date().toISOString();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<spmo-backup version="1.0" exported-at="${xe(now)}">\n\n`;

    xml += xmlSection("programme-config", "config", config as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("pillars", "pillar", pillars as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("departments", "department", departments as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("initiatives", "initiative", initiatives as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("projects", "project", projects as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("milestones", "milestone", milestones as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("kpis", "kpi", kpis as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("kpi-measurements", "measurement", measurements as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("risks", "risk", risks as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("mitigations", "mitigation", mitigations as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("budget-entries", "budget-entry", budgets as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("procurement", "procurement-item", procurement as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("weekly-reports", "weekly-report", weeklyReports as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("change-requests", "change-request", changeRequests as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("raci", "raci-entry", raci as Record<string, unknown>[]);
    xml += "\n";
    xml += xmlSection("actions", "action", actions as Record<string, unknown>[]);
    xml += "\n";

    xml += `</spmo-backup>\n`;

    const date = now.slice(0, 10);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="spmo-backup-${date}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error("[export] Failed:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

// ─── IMPORT ──────────────────────────────────────────────────────────────────

const ARRAY_TAGS = new Set([
  "config", "pillar", "department", "initiative", "project", "milestone",
  "kpi", "measurement", "risk", "mitigation", "budget-entry", "procurement-item",
  "weekly-report", "change-request", "raci-entry", "action",
]);

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function toBool(v: unknown): boolean {
  return v === "true" || v === true || v === 1;
}

function coerce(row: Record<string, unknown>, numFields: string[], boolFields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (numFields.includes(k)) out[k] = toNum(v);
    else if (boolFields.includes(k)) out[k] = toBool(v);
    else out[k] = toStr(v);
  }
  return out;
}

function getRows(parsed: Record<string, unknown>, sectionTag: string, rowTag: string): Record<string, unknown>[] {
  const backup = parsed["spmo-backup"] as Record<string, unknown> | undefined;
  if (!backup) return [];
  const section = backup[sectionTag] as Record<string, unknown> | undefined;
  if (!section) return [];
  const rows = section[rowTag];
  if (!rows) return [];
  if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  return [rows as Record<string, unknown>];
}

function buildInsertSql(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(", ");
  const valuesList = rows.map(row => {
    const vals = cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      if (typeof v === "number") return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    return `(${vals.join(", ")})`;
  }).join(",\n  ");
  return `INSERT INTO ${table} (${colList}) VALUES\n  ${valuesList};`;
}

router.post("/spmo/data/import", upload.single("file"), async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const xmlText = req.file.buffer.toString("utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (tagName: string) => ARRAY_TAGS.has(tagName),
    parseTagValue: true,
    allowBooleanAttributes: true,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlText) as Record<string, unknown>;
  } catch (e) {
    res.status(400).json({ error: "Invalid XML file" });
    return;
  }

  const backup = parsed["spmo-backup"] as Record<string, unknown> | undefined;
  if (!backup) {
    res.status(400).json({ error: "Not a valid SPMO backup file" });
    return;
  }

  try {
    const configRows = getRows(parsed, "programme-config", "config").map(r =>
      coerce(r, ["id","fiscalYearStart","projectAtRiskThreshold","projectDelayedThreshold","milestoneAtRiskThreshold","weeklyResetDay","defaultPlanningWeight","defaultTenderingWeight","defaultExecutionWeight","defaultClosureWeight"], [])
    );
    const pillarRows = getRows(parsed, "pillars", "pillar").map(r =>
      coerce(r, ["id","weight","sortOrder"], [])
    );
    const deptRows = getRows(parsed, "departments", "department").map(r =>
      coerce(r, ["id","sortOrder"], [])
    );
    const initiativeRows = getRows(parsed, "initiatives", "initiative").map(r =>
      coerce(r, ["id","pillarId","weight","budget","sortOrder"], [])
    );
    const projectRows = getRows(parsed, "projects", "project").map(r =>
      coerce(r, ["id","initiativeId","departmentId","weight","budget","budgetSpent"], [])
    );
    const milestoneRows = getRows(parsed, "milestones", "milestone").map(r =>
      coerce(r, ["id","projectId","weight","effortDays","progress"], [])
    );
    const kpiRows = getRows(parsed, "kpis", "kpi").map(r =>
      coerce(r, ["id","projectId","pillarId","initiativeId","baseline","target","actual","nextYearTarget","target2030","prevActual","target2026","target2027","target2028","target2029","actual2026","actual2027","actual2028","actual2029"], ["milestoneDone"])
    );
    const measurementRows = getRows(parsed, "kpi-measurements", "measurement").map(r =>
      coerce(r, ["id","kpiId","value"], [])
    );
    const riskRows = getRows(parsed, "risks", "risk").map(r =>
      coerce(r, ["id","pillarId","projectId","riskScore"], [])
    );
    const mitigationRows = getRows(parsed, "mitigations", "mitigation").map(r =>
      coerce(r, ["id","riskId"], [])
    );
    const budgetRows = getRows(parsed, "budget-entries", "budget-entry").map(r =>
      coerce(r, ["id","projectId","pillarId","allocated","spent","fiscalYear","fiscalQuarter"], [])
    );
    const procurementRows = getRows(parsed, "procurement", "procurement-item").map(r =>
      coerce(r, ["id","projectId","contractValue"], [])
    );
    const weeklyRows = getRows(parsed, "weekly-reports", "weekly-report").map(r =>
      coerce(r, ["id","projectId"], [])
    );
    const crRows = getRows(parsed, "change-requests", "change-request").map(r =>
      coerce(r, ["id","projectId","budgetImpact","timelineImpact"], [])
    );
    const raciRows = getRows(parsed, "raci", "raci-entry").map(r =>
      coerce(r, ["id","projectId","milestoneId"], [])
    );
    const actionRows = getRows(parsed, "actions", "action").map(r =>
      coerce(r, ["id","projectId","milestoneId","assigneeId"], [])
    );

    await db.execute(sql.raw(`SET session_replication_role = replica`));

    try {
      await db.execute(sql.raw(`
        TRUNCATE TABLE
          spmo_actions, spmo_raci, spmo_change_requests, spmo_project_weekly_reports,
          spmo_procurement, spmo_budget_entries, spmo_mitigations, spmo_risks,
          spmo_kpi_measurements, spmo_kpis, spmo_milestones, spmo_projects,
          spmo_initiatives, spmo_departments, spmo_pillars, spmo_programme_config
        CASCADE
      `));

      const execInsert = async (table: string, rows: Record<string, unknown>[]) => {
        if (rows.length === 0) return;
        const stmt = buildInsertSql(table, rows);
        await db.execute(sql.raw(stmt));
      };

      await execInsert("spmo_programme_config", configRows);
      await execInsert("spmo_pillars", pillarRows);
      await execInsert("spmo_departments", deptRows);
      await execInsert("spmo_initiatives", initiativeRows);
      await execInsert("spmo_projects", projectRows);
      await execInsert("spmo_milestones", milestoneRows);
      await execInsert("spmo_kpis", kpiRows);
      await execInsert("spmo_kpi_measurements", measurementRows);
      await execInsert("spmo_risks", riskRows);
      await execInsert("spmo_mitigations", mitigationRows);
      await execInsert("spmo_budget_entries", budgetRows);
      await execInsert("spmo_procurement", procurementRows);
      await execInsert("spmo_project_weekly_reports", weeklyRows);
      await execInsert("spmo_change_requests", crRows);
      await execInsert("spmo_raci", raciRows);
      await execInsert("spmo_actions", actionRows);

      const seqTables: [string, string][] = [
        ["spmo_pillars_id_seq", "spmo_pillars"],
        ["spmo_departments_id_seq", "spmo_departments"],
        ["spmo_initiatives_id_seq", "spmo_initiatives"],
        ["spmo_projects_id_seq", "spmo_projects"],
        ["spmo_milestones_id_seq", "spmo_milestones"],
        ["spmo_kpis_id_seq", "spmo_kpis"],
        ["spmo_kpi_measurements_id_seq", "spmo_kpi_measurements"],
        ["spmo_risks_id_seq", "spmo_risks"],
        ["spmo_mitigations_id_seq", "spmo_mitigations"],
        ["spmo_budget_entries_id_seq", "spmo_budget_entries"],
        ["spmo_procurement_id_seq", "spmo_procurement"],
        ["spmo_project_weekly_reports_id_seq", "spmo_project_weekly_reports"],
        ["spmo_change_requests_id_seq", "spmo_change_requests"],
        ["spmo_raci_id_seq", "spmo_raci"],
        ["spmo_actions_id_seq", "spmo_actions"],
      ];

      for (const [seq, tbl] of seqTables) {
        await db.execute(sql.raw(
          `SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${tbl}), 1), true)`
        ));
      }

    } finally {
      await db.execute(sql.raw(`SET session_replication_role = DEFAULT`));
    }

    const summary = {
      config: configRows.length,
      pillars: pillarRows.length,
      departments: deptRows.length,
      initiatives: initiativeRows.length,
      projects: projectRows.length,
      milestones: milestoneRows.length,
      kpis: kpiRows.length,
      measurements: measurementRows.length,
      risks: riskRows.length,
      mitigations: mitigationRows.length,
      budgetEntries: budgetRows.length,
      procurement: procurementRows.length,
      weeklyReports: weeklyRows.length,
      changeRequests: crRows.length,
      raci: raciRows.length,
      actions: actionRows.length,
    };

    res.json({ ok: true, summary });
  } catch (err) {
    console.error("[import] Failed:", err);
    res.status(500).json({ error: "Import failed", detail: String(err) });
  }
});

export default router;
