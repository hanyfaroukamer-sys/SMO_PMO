import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
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
  spmoActionsTable,
  spmoProgrammeConfigTable,
  spmoActivityLogTable,
} from "@workspace/db";

const router = Router();

// ─── AUTH ────────────────────────────────────────────────────────────────────

type AuthUser = { id: string; role?: string | null } | undefined;
function getAuthUser(req: Request): AuthUser { return req.user as AuthUser; }
function requireAuth(req: Request, res: Response): string | null {
  const user = getAuthUser(req);
  if (!user?.id) { res.status(401).json({ error: "Authentication required" }); return null; }
  return user.id;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function cellStr(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value;
  if (v == null) return null;
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text).trim() || null;
  return String(v).trim() || null;
}

function cellNum(row: ExcelJS.Row, col: number): number | null {
  const v = row.getCell(col).value;
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function cellDate(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value;
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().split("T")[0];
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

function cellInt(row: ExcelJS.Row, col: number): number | null {
  const n = cellNum(row, col);
  return n == null ? null : Math.round(n);
}

function getSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | null {
  return wb.getWorksheet(name) ?? null;
}

interface SkipEntry { sheet: string; row: number; reason: string }

// ─── TEMPLATE SHEET DEFINITIONS ──────────────────────────────────────────────

const SHEETS = [
  {
    name: "Programme Config",
    headers: ["programme_name", "vision", "mission", "reporting_currency"],
    example: ["National Strategy Programme 2025-2030", "World-class government authority", "Drive transformation across pillars and enablers", "SAR"],
    notes: "Single row. Defines the programme-level settings.",
  },
  {
    name: "Departments",
    headers: ["name", "description", "color"],
    example: ["Technology and Digitalization", "IT and digital transformation", "#2563EB"],
    notes: "Color as hex (e.g. #2563EB). Used for department tagging on projects.",
  },
  {
    name: "Pillars",
    headers: ["name", "description", "pillar_type", "weight", "color"],
    example: ["Customer Experience", "Customer journey optimization and satisfaction", "pillar", "8", "#7C3AED"],
    notes: "pillar_type: pillar or enabler. Weight: relative importance (0-100).",
  },
  {
    name: "Initiatives",
    headers: ["pillar_name", "initiative_code", "name", "description", "owner_name", "start_date", "target_date", "budget", "status"],
    example: ["Customer Experience", "I-01", "Border Crossing Experience", "Fast lane and trusted traveler programs", "PMO Office", "2024-01-01", "2028-06-30", "67000000", "active"],
    notes: "pillar_name must match a name from the Pillars sheet. Dates as YYYY-MM-DD. Budget in base currency. Status: active/on_hold/completed/cancelled.",
  },
  {
    name: "Projects",
    headers: ["initiative_name", "project_code", "department_name", "name", "description", "owner_name", "start_date", "target_date", "budget", "budget_capex", "budget_opex", "status"],
    example: ["Border Crossing Experience", "P01", "Technology and Digitalization", "Trusted traveler program", "Digital ID enrollment system", "A. Al Shrhan", "2025-01-01", "2027-06-30", "12000000", "8000000", "4000000", "active"],
    notes: "initiative_name must match Initiatives sheet. department_name must match Departments sheet (optional). Status: active/on_hold/completed/cancelled.",
  },
  {
    name: "Milestones",
    headers: ["project_name", "name", "description", "weight", "effort_days", "progress", "status", "phase_gate", "assignee_name", "start_date", "due_date"],
    example: ["Trusted traveler program", "Planning & Requirements", "Scope and requirements definition", "30", "20", "0", "pending", "planning", "A. Al Shrhan", "2025-01-01", "2025-04-01"],
    notes: "project_name must match Projects sheet. Status: pending/in_progress/submitted/approved/rejected. phase_gate: planning/tendering/closure (optional). Weight: relative importance within project.",
  },
  {
    name: "KPIs",
    headers: ["type", "name", "description", "unit", "pillar_name", "project_name", "baseline", "target", "actual", "kpi_type", "direction", "measurement_period", "target_2026", "target_2027", "target_2028", "target_2029", "target_2030"],
    example: ["strategic", "Customer Satisfaction Index", "Composite CSAT score including NPS", "%", "Customer Experience", "", "90", "92.8", "0", "rate", "higher", "annual", "90", "90", "90", "90", "92.8"],
    notes: "type: strategic/operational. kpi_type: cumulative/rate/milestone/reduction. direction: higher/lower. pillar_name/project_name: lookup (leave blank if N/A).",
  },
  {
    name: "KPI Measurements",
    headers: ["kpi_name", "measured_at", "value", "notes", "recorded_by_name"],
    example: ["Customer Satisfaction Index", "2025-03-31", "91.2", "Q1 2025 survey results", "Hany Al-Rashidi"],
    notes: "kpi_name must match a name from KPIs sheet. measured_at as YYYY-MM-DD.",
  },
  {
    name: "Risks",
    headers: ["pillar_name", "project_name", "title", "description", "category", "probability", "impact", "risk_score", "owner", "status"],
    example: ["Customer Experience", "Trusted traveler program", "Stakeholder disagreement delays journey map", "Conflicting priorities between operations and CX teams", "operational", "medium", "high", "12", "Head of CX", "open"],
    notes: "probability: low/medium/high/critical. impact: low/medium/high/critical. status: open/mitigated/accepted/closed. pillar_name/project_name optional lookups.",
  },
  {
    name: "Mitigations",
    headers: ["risk_title", "description", "status", "due_date"],
    example: ["Stakeholder disagreement delays journey map", "Run joint CX-Operations workshop series", "in_progress", "2026-06-30"],
    notes: "risk_title must match a title from Risks sheet. status: planned/in_progress/completed.",
  },
  {
    name: "Budget Entries",
    headers: ["project_name", "pillar_name", "category", "description", "allocated", "spent", "currency", "period", "fiscal_year", "fiscal_quarter"],
    example: ["Trusted traveler program", "Customer Experience", "capex", "Journey mapping consulting tools", "3500000", "1200000", "SAR", "Q1-Q2 2026", "2026", "1"],
    notes: "project_name/pillar_name: lookups. category: free text (e.g. capex/opex/consulting). Amounts in base currency.",
  },
  {
    name: "Procurement",
    headers: ["project_name", "title", "stage", "vendor", "contract_value", "currency", "notes", "award_date", "completion_date"],
    example: ["Trusted traveler program", "Biometric Gates Supply & Install", "contract_awarded", "NEC Arabia", "18000000", "SAR", "Phase 1 - 12 gates", "2025-09-15", "2026-11-30"],
    notes: "stage: rfp_draft/rfp_issued/evaluation/awarded/completed. project_name must match Projects sheet.",
  },
  {
    name: "Actions",
    headers: ["project_name", "milestone_name", "title", "description", "assignee_name", "due_date", "priority", "status"],
    example: ["Trusted traveler program", "Planning & Requirements", "Finalize survey instrument", "Update NPS questionnaire for digital touchpoints", "Hany Al-Rashidi", "2026-05-15", "high", "open"],
    notes: "priority: low/medium/high/urgent. status: open/in_progress/done/cancelled. milestone_name optional (leave blank if project-level action).",
  },
];

// ─── GET /api/spmo/import/template ──────────────────────────────────────────

router.get("/spmo/import/template", async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const wb = new ExcelJS.Workbook();
  wb.creator = "StrategyPMO";
  wb.created = new Date();

  // README sheet
  const readme = wb.addWorksheet("_README");
  readme.getColumn(1).width = 80;
  readme.getCell("A1").value = "StrategyPMO — Data Import Template";
  readme.getCell("A1").font = { bold: true, size: 16 };
  readme.getCell("A3").value = "Instructions:";
  readme.getCell("A3").font = { bold: true, size: 12 };
  readme.getCell("A4").value = "1. Fill in each sheet with your data. Row 1 is the header — do NOT modify it.";
  readme.getCell("A5").value = "2. Row 2 (gray italic) is an example — delete or overwrite it with your real data.";
  readme.getCell("A6").value = "3. Sheets are loaded in order (Pillars before Initiatives, etc). Name lookups must match exactly.";
  readme.getCell("A7").value = "4. Dates must be YYYY-MM-DD format (e.g. 2025-01-15).";
  readme.getCell("A8").value = "5. Budget/financial values in base currency units (e.g. 12000000 not 12M).";
  readme.getCell("A9").value = "6. Leave optional fields blank — do not write 'N/A' or 'null'.";
  readme.getCell("A10").value = "7. Upload via Admin > Import > Upload Excel Template.";
  readme.getCell("A12").value = "Sheet Reference:";
  readme.getCell("A12").font = { bold: true, size: 12 };
  let readmeRow = 13;
  for (const s of SHEETS) {
    readme.getCell(`A${readmeRow}`).value = `• ${s.name}: ${s.notes}`;
    readmeRow++;
  }

  // Data sheets
  for (const sheetDef of SHEETS) {
    const ws = wb.addWorksheet(sheetDef.name.slice(0, 31));

    // Header row
    const headerRow = ws.getRow(1);
    sheetDef.headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.alignment = { horizontal: "center" };
    });
    headerRow.commit();

    // Example row
    const exampleRow = ws.getRow(2);
    sheetDef.example.forEach((v, i) => {
      const cell = exampleRow.getCell(i + 1);
      cell.value = v;
      cell.font = { italic: true, color: { argb: "FF999999" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    });
    exampleRow.commit();

    // Auto-width columns
    sheetDef.headers.forEach((h, i) => {
      const exLen = sheetDef.example[i]?.length ?? 0;
      ws.getColumn(i + 1).width = Math.max(h.length, exLen, 12) + 4;
    });

    // Freeze header row
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=strategypmo-template.xlsx");
  await wb.xlsx.write(res);
  res.end();
});

// ─── POST /api/spmo/import/bulk ─────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.originalname.toLowerCase().endsWith(".xlsx"));
  },
});

router.post("/spmo/import/bulk", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (!req.file) { res.status(400).json({ error: "No .xlsx file uploaded" }); return; }

  const mode = (req.body?.mode as string) || "append";
  if (mode === "replace") {
    const user = getAuthUser(req);
    if (user?.role !== "admin") {
      res.status(403).json({ error: "Admin role required for replace mode" });
      return;
    }
  }

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(req.file.buffer as any);

  const imported: Record<string, number> = {};
  const skipped: SkipEntry[] = [];
  const today = new Date().toISOString().split("T")[0];

  try {
    await db.transaction(async (tx: typeof db) => {
      // ── Replace mode: truncate all SPMO tables ──
      if (mode === "replace") {
        await tx.delete(spmoKpiMeasurementsTable);
        await tx.delete(spmoActionsTable);
        await tx.delete(spmoMitigationsTable);
        await tx.delete(spmoBudgetTable);
        await tx.delete(spmoProcurementTable);
        await tx.delete(spmoRisksTable);
        await tx.delete(spmoKpisTable);
        await tx.delete(spmoMilestonesTable);
        await tx.delete(spmoProjectsTable);
        await tx.delete(spmoInitiativesTable);
        await tx.delete(spmoPillarsTable);
        await tx.delete(spmoDepartmentsTable);
      }

      // ── 1. Programme Config ──
      const cfgSheet = getSheet(wb, "Programme Config");
      if (cfgSheet && cfgSheet.rowCount > 1) {
        const r = cfgSheet.getRow(2);
        const name = cellStr(r, 1);
        if (name) {
          const vals = {
            programmeName: name,
            vision: cellStr(r, 2),
            mission: cellStr(r, 3),
            reportingCurrency: cellStr(r, 4) || "SAR",
          };
          const existing = await tx.select().from(spmoProgrammeConfigTable).limit(1);
          if (existing.length > 0) {
            await tx.update(spmoProgrammeConfigTable).set(vals);
          } else {
            await tx.insert(spmoProgrammeConfigTable).values(vals);
          }
          imported["programme_config"] = 1;
        }
      }

      // ── 2. Departments ──
      const deptMap = new Map<string, number>();
      const deptSheet = getSheet(wb, "Departments");
      if (deptSheet) {
        let count = 0;
        deptSheet.eachRow((row, rowNum) => {
          if (rowNum <= 2) return; // Skip header (1) and example row (2)
          const name = cellStr(row, 1);
          if (!name) return;
          // Queue for insert — will be processed below
          (deptSheet as unknown as { _pendingRows: Array<{ name: string; desc: string | null; color: string | null; rowNum: number }> })._pendingRows =
            (deptSheet as unknown as { _pendingRows: Array<{ name: string; desc: string | null; color: string | null; rowNum: number }> })._pendingRows || [];
          (deptSheet as unknown as { _pendingRows: Array<{ name: string; desc: string | null; color: string | null; rowNum: number }> })._pendingRows.push({
            name, desc: cellStr(row, 2), color: cellStr(row, 3), rowNum,
          });
        });
        // Process departments
        const pending = (deptSheet as unknown as { _pendingRows: Array<{ name: string; desc: string | null; color: string | null; rowNum: number }> })._pendingRows || [];
        for (const d of pending) {
          const [created] = await tx.insert(spmoDepartmentsTable).values({
            name: d.name, description: d.desc, color: d.color || "#3B82F6",
          }).returning({ id: spmoDepartmentsTable.id });
          deptMap.set(d.name, created.id);
          count++;
        }
        if (count > 0) imported["departments"] = count;
      }

      // ── 3. Pillars ──
      const pillarMap = new Map<string, number>();
      const pillarSheet = getSheet(wb, "Pillars");
      if (pillarSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= pillarSheet.rowCount; rowNum++) {
          const row = pillarSheet.getRow(rowNum);
          const name = cellStr(row, 1);
          if (!name) continue;
          if (pillarMap.has(name)) {
            skipped.push({ sheet: "Pillars", row: rowNum, reason: `Duplicate pillar name '${name}'` });
            continue;
          }
          const [created] = await tx.insert(spmoPillarsTable).values({
            name,
            description: cellStr(row, 2),
            pillarType: (cellStr(row, 3) as "pillar" | "enabler") || "pillar",
            weight: cellNum(row, 4) ?? 0,
            color: cellStr(row, 5) || "#3B82F6",
          }).returning({ id: spmoPillarsTable.id });
          pillarMap.set(name, created.id);
          count++;
        }
        if (count > 0) imported["pillars"] = count;
      }

      // ── 4. Initiatives ──
      const initMap = new Map<string, number>();
      const initSheet = getSheet(wb, "Initiatives");
      if (initSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= initSheet.rowCount; rowNum++) {
          const row = initSheet.getRow(rowNum);
          const pillarName = cellStr(row, 1);
          const name = cellStr(row, 3);
          if (!name) continue;
          if (!pillarName) {
            skipped.push({ sheet: "Initiatives", row: rowNum, reason: "Pillar name is required" });
            continue;
          }
          const pillarId = pillarMap.get(pillarName);
          if (!pillarId) {
            skipped.push({ sheet: "Initiatives", row: rowNum, reason: `Pillar '${pillarName}' not found` });
            continue;
          }
          const [created] = await tx.insert(spmoInitiativesTable).values({
            pillarId,
            initiativeCode: cellStr(row, 2),
            name,
            description: cellStr(row, 4),
            ownerId: userId,
            ownerName: cellStr(row, 5),
            startDate: cellDate(row, 6) || today,
            targetDate: cellDate(row, 7) || today,
            budget: cellNum(row, 8) ?? 0,
            status: (cellStr(row, 9) as "active" | "on_hold" | "completed" | "cancelled") || "active",
          }).returning({ id: spmoInitiativesTable.id });
          initMap.set(name, created.id);
          count++;
        }
        if (count > 0) imported["initiatives"] = count;
      }

      // ── 5. Projects ──
      const projMap = new Map<string, number>();
      const projSheet = getSheet(wb, "Projects");
      if (projSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= projSheet.rowCount; rowNum++) {
          const row = projSheet.getRow(rowNum);
          const initName = cellStr(row, 1);
          const name = cellStr(row, 4);
          if (!name) continue;
          if (!initName) {
            skipped.push({ sheet: "Projects", row: rowNum, reason: "Initiative name is required" });
            continue;
          }
          const initiativeId = initMap.get(initName);
          if (!initiativeId) {
            skipped.push({ sheet: "Projects", row: rowNum, reason: `Initiative '${initName}' not found` });
            continue;
          }
          const deptName = cellStr(row, 3);
          const departmentId = deptName ? deptMap.get(deptName) ?? undefined : undefined;
          if (deptName && !departmentId) {
            skipped.push({ sheet: "Projects", row: rowNum, reason: `Department '${deptName}' not found` });
            continue;
          }
          const [created] = await tx.insert(spmoProjectsTable).values({
            initiativeId,
            projectCode: cellStr(row, 2),
            departmentId: departmentId ?? null,
            name,
            description: cellStr(row, 5),
            ownerId: userId,
            ownerName: cellStr(row, 6),
            startDate: cellDate(row, 7) || today,
            targetDate: cellDate(row, 8) || today,
            budget: cellNum(row, 9) ?? 0,
            budgetCapex: cellNum(row, 10) ?? 0,
            budgetOpex: cellNum(row, 11) ?? 0,
            status: (cellStr(row, 12) as "active" | "on_hold" | "completed" | "cancelled") || "active",
          }).returning({ id: spmoProjectsTable.id });
          projMap.set(name, created.id);
          count++;
        }
        if (count > 0) imported["projects"] = count;
      }

      // ── 6. Milestones ──
      const msMap = new Map<string, number>(); // "projectName::msName" → id
      const msSheet = getSheet(wb, "Milestones");
      if (msSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= msSheet.rowCount; rowNum++) {
          const row = msSheet.getRow(rowNum);
          const projName = cellStr(row, 1);
          const name = cellStr(row, 2);
          if (!name) continue;
          if (!projName) {
            skipped.push({ sheet: "Milestones", row: rowNum, reason: "Project name is required" });
            continue;
          }
          const projectId = projMap.get(projName);
          if (!projectId) {
            skipped.push({ sheet: "Milestones", row: rowNum, reason: `Project '${projName}' not found` });
            continue;
          }
          const [created] = await tx.insert(spmoMilestonesTable).values({
            projectId,
            name,
            description: cellStr(row, 3),
            weight: cellNum(row, 4) ?? 0,
            effortDays: cellNum(row, 5),
            progress: cellNum(row, 6) ?? 0,
            status: (cellStr(row, 7) as "pending" | "in_progress" | "submitted" | "approved" | "rejected") || "pending",
            phaseGate: (cellStr(row, 8) as "planning" | "tendering" | "closure" | null),
            assigneeName: cellStr(row, 9),
            startDate: cellDate(row, 10),
            dueDate: cellDate(row, 11),
          }).returning({ id: spmoMilestonesTable.id });
          msMap.set(`${projName}::${name}`, created.id);
          count++;
        }
        if (count > 0) imported["milestones"] = count;
      }

      // ── 7. KPIs ──
      const kpiMap = new Map<string, number>();
      const kpiSheet = getSheet(wb, "KPIs");
      if (kpiSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= kpiSheet.rowCount; rowNum++) {
          const row = kpiSheet.getRow(rowNum);
          const name = cellStr(row, 2);
          if (!name) continue;
          const pillarName = cellStr(row, 5);
          const projName = cellStr(row, 6);
          const pillarId = pillarName ? pillarMap.get(pillarName) ?? null : null;
          const projectId = projName ? projMap.get(projName) ?? null : null;
          const [created] = await tx.insert(spmoKpisTable).values({
            type: (cellStr(row, 1) as "strategic" | "operational") || "strategic",
            name,
            description: cellStr(row, 3),
            unit: cellStr(row, 4) || "",
            pillarId,
            projectId,
            baseline: cellNum(row, 7) ?? 0,
            target: cellNum(row, 8) ?? 0,
            actual: cellNum(row, 9) ?? 0,
            kpiType: (cellStr(row, 10) as "cumulative" | "rate" | "milestone" | "reduction") || "rate",
            direction: (cellStr(row, 11) as "higher" | "lower") || "higher",
            measurementPeriod: (cellStr(row, 12) as "annual" | "quarterly" | "monthly") || "annual",
            target2026: cellNum(row, 13),
            target2027: cellNum(row, 14),
            target2028: cellNum(row, 15),
            target2029: cellNum(row, 16),
            target2030: cellNum(row, 17),
          }).returning({ id: spmoKpisTable.id });
          kpiMap.set(name, created.id);
          count++;
        }
        if (count > 0) imported["kpis"] = count;
      }

      // ── 8. KPI Measurements ──
      const kpiMeasSheet = getSheet(wb, "KPI Measurements");
      if (kpiMeasSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= kpiMeasSheet.rowCount; rowNum++) {
          const row = kpiMeasSheet.getRow(rowNum);
          const kpiName = cellStr(row, 1);
          const measuredAt = cellDate(row, 2);
          const value = cellNum(row, 3);
          if (!kpiName || !measuredAt || value == null) continue;
          const kpiId = kpiMap.get(kpiName);
          if (!kpiId) {
            skipped.push({ sheet: "KPI Measurements", row: rowNum, reason: `KPI '${kpiName}' not found` });
            continue;
          }
          await tx.insert(spmoKpiMeasurementsTable).values({
            kpiId,
            measuredAt,
            value,
            notes: cellStr(row, 4),
            recordedByName: cellStr(row, 5),
          });
          count++;
        }
        if (count > 0) imported["kpi_measurements"] = count;
      }

      // ── 9. Risks ──
      const riskMap = new Map<string, number>();
      const riskSheet = getSheet(wb, "Risks");
      if (riskSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= riskSheet.rowCount; rowNum++) {
          const row = riskSheet.getRow(rowNum);
          const title = cellStr(row, 3);
          if (!title) continue;
          const pillarName = cellStr(row, 1);
          const projName = cellStr(row, 2);
          const [created] = await tx.insert(spmoRisksTable).values({
            pillarId: pillarName ? pillarMap.get(pillarName) ?? null : null,
            projectId: projName ? projMap.get(projName) ?? null : null,
            title,
            description: cellStr(row, 4),
            category: cellStr(row, 5),
            probability: (cellStr(row, 6) as "low" | "medium" | "high" | "critical") || "medium",
            impact: (cellStr(row, 7) as "low" | "medium" | "high" | "critical") || "medium",
            riskScore: cellInt(row, 8) ?? 4,
            owner: cellStr(row, 9),
            status: (cellStr(row, 10) as "open" | "mitigated" | "accepted" | "closed") || "open",
          }).returning({ id: spmoRisksTable.id });
          riskMap.set(title, created.id);
          count++;
        }
        if (count > 0) imported["risks"] = count;
      }

      // ── 10. Mitigations ──
      const mitSheet = getSheet(wb, "Mitigations");
      if (mitSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= mitSheet.rowCount; rowNum++) {
          const row = mitSheet.getRow(rowNum);
          const riskTitle = cellStr(row, 1);
          const desc = cellStr(row, 2);
          if (!riskTitle || !desc) continue;
          const riskId = riskMap.get(riskTitle);
          if (!riskId) {
            skipped.push({ sheet: "Mitigations", row: rowNum, reason: `Risk '${riskTitle}' not found` });
            continue;
          }
          await tx.insert(spmoMitigationsTable).values({
            riskId,
            description: desc,
            status: (cellStr(row, 3) as "planned" | "in_progress" | "completed") || "planned",
            dueDate: cellDate(row, 4),
          });
          count++;
        }
        if (count > 0) imported["mitigations"] = count;
      }

      // ── 11. Budget Entries ──
      const budgetSheet = getSheet(wb, "Budget Entries");
      if (budgetSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= budgetSheet.rowCount; rowNum++) {
          const row = budgetSheet.getRow(rowNum);
          const category = cellStr(row, 3);
          if (!category) continue;
          const projName = cellStr(row, 1);
          const pillarName = cellStr(row, 2);
          await tx.insert(spmoBudgetTable).values({
            projectId: projName ? projMap.get(projName) ?? null : null,
            pillarId: pillarName ? pillarMap.get(pillarName) ?? null : null,
            category,
            description: cellStr(row, 4),
            allocated: cellNum(row, 5) ?? 0,
            spent: cellNum(row, 6) ?? 0,
            currency: cellStr(row, 7) || "SAR",
            period: cellStr(row, 8) || today,
            fiscalYear: cellInt(row, 9),
            fiscalQuarter: cellInt(row, 10),
          });
          count++;
        }
        if (count > 0) imported["budget_entries"] = count;
      }

      // ── 12. Procurement ──
      const procSheet = getSheet(wb, "Procurement");
      if (procSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= procSheet.rowCount; rowNum++) {
          const row = procSheet.getRow(rowNum);
          const projName = cellStr(row, 1);
          const title = cellStr(row, 2);
          if (!projName || !title) continue;
          const projectId = projMap.get(projName);
          if (!projectId) {
            skipped.push({ sheet: "Procurement", row: rowNum, reason: `Project '${projName}' not found` });
            continue;
          }
          await tx.insert(spmoProcurementTable).values({
            projectId,
            title,
            stage: (cellStr(row, 3) as "rfp_draft" | "rfp_issued" | "evaluation" | "awarded" | "completed") || "rfp_draft",
            vendor: cellStr(row, 4),
            contractValue: cellNum(row, 5),
            currency: cellStr(row, 6) || "SAR",
            notes: cellStr(row, 7),
            awardDate: cellDate(row, 8),
            completionDate: cellDate(row, 9),
          });
          count++;
        }
        if (count > 0) imported["procurement"] = count;
      }

      // ── 13. Actions ──
      const actSheet = getSheet(wb, "Actions");
      if (actSheet) {
        let count = 0;
        for (let rowNum = 3; rowNum <= actSheet.rowCount; rowNum++) {
          const row = actSheet.getRow(rowNum);
          const projName = cellStr(row, 1);
          const title = cellStr(row, 3);
          if (!projName || !title) continue;
          const projectId = projMap.get(projName);
          if (!projectId) {
            skipped.push({ sheet: "Actions", row: rowNum, reason: `Project '${projName}' not found` });
            continue;
          }
          const msName = cellStr(row, 2);
          const milestoneId = msName ? msMap.get(`${projName}::${msName}`) ?? null : null;
          await tx.insert(spmoActionsTable).values({
            projectId,
            milestoneId,
            title,
            description: cellStr(row, 4),
            assigneeName: cellStr(row, 5),
            dueDate: cellDate(row, 6),
            priority: (cellStr(row, 7) as "low" | "medium" | "high" | "urgent") || "medium",
            status: (cellStr(row, 8) as "open" | "in_progress" | "done" | "cancelled") || "open",
            createdById: userId,
          });
          count++;
        }
        if (count > 0) imported["actions"] = count;
      }

      // ── Activity log ──
      const totalRows = Object.values(imported).reduce((s, n) => s + n, 0);
      await tx.insert(spmoActivityLogTable).values({
        actorId: userId,
        action: "created",
        entityType: "programme",
        entityId: 0,
        entityName: `Bulk import (${mode}): ${totalRows} rows across ${Object.keys(imported).length} tables`,
      });
    });

    res.json({ success: true, imported, skipped });
  } catch (err) {
    req.log.error({ err }, "Bulk import failed");
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Bulk import failed", detail: msg });
  }
});

export default router;
