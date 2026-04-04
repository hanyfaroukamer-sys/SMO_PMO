import { Router } from "express";
import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import { db } from "@workspace/db";
import {
  spmoKpisTable,
  spmoRisksTable,
  spmoBudgetTable,
  spmoProgrammeConfigTable,
  spmoProjectsTable,
  spmoInitiativesTable,
  spmoPillarsTable,
  spmoMilestonesTable,
  spmoDepartmentsTable,
  spmoProjectWeeklyReportsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { calcProgrammeProgress, computeStatus } from "../lib/spmo-calc";
import { getCachedAssessment } from "../lib/assessment-cache";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  const user = (req as Request & { user?: { id?: string } }).user;
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user.id;
}

// ─── McKinsey/BCG Colour Palette ─────────────────────────────────────────────
const C = {
  primary: "#1E3A5F",
  navy: "#1E3A5F",
  accent: "#2563EB",
  dark: "#0F172A",
  mid: "#475569",
  secondary: "#475569",
  light: "#94A3B8",
  bg: "#F8FAFC",
  border: "#E2E8F0",
  green: "#16A34A",
  amber: "#D97706",
  red: "#DC2626",
  lightGreen: "#DCFCE7",
  lightAmber: "#FEF3C7",
  lightRed: "#FEE2E2",
  white: "#FFFFFF",
};

// PPTX hex colours (no #)
const PC = {
  primary: "1E3A5F",
  dark: "0F172A",
  grey: "475569",
  light: "94A3B8",
  bg: "F8FAFC",
  green: "16A34A",
  amber: "D97706",
  red: "DC2626",
  white: "FFFFFF",
  border: "E2E8F0",
};

function statusColor(status: string): string {
  if (status === "on_track" || status === "completed") return C.green;
  if (status === "at_risk") return C.amber;
  if (status === "delayed") return C.red;
  return C.secondary;
}

function statusPtxColor(status: string): string {
  if (status === "on_track" || status === "completed") return PC.green;
  if (status === "at_risk") return PC.amber;
  if (status === "delayed") return PC.red;
  return PC.grey;
}

function statusLabel(status: string): string {
  if (status === "on_track") return "On Track";
  if (status === "at_risk") return "At Risk";
  if (status === "delayed") return "Delayed";
  if (status === "completed") return "Completed";
  if (status === "not_started") return "Not Started";
  return status;
}

function kpiStatusColor(status: string): string {
  if (status === "on_track" || status === "achieved") return C.green;
  if (status === "at_risk") return C.amber;
  if (status === "critical") return C.red;
  return C.secondary;
}

function kpiStatusPtxColor(status: string): string {
  if (status === "on_track" || status === "achieved") return PC.green;
  if (status === "at_risk") return PC.amber;
  if (status === "critical") return PC.red;
  return PC.grey;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSAR(v: number, cur: string = "SAR"): string {
  if (v >= 1_000_000_000) return `${cur} ${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${cur} ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${cur} ${(v / 1_000).toFixed(0)}K`;
  return `${cur} ${v.toFixed(0)}`;
}

function statusLabelUpper(status: string): string {
  if (status === "on_track") return "ON TRACK";
  if (status === "at_risk") return "AT RISK";
  if (status === "delayed") return "DELAYED";
  if (status === "completed") return "COMPLETED";
  if (status === "not_started") return "NOT STARTED";
  return status.toUpperCase();
}

const SEVERITY_ORDER: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
function sevNum(s: string | null): number { return SEVERITY_ORDER[s ?? ""] ?? 0; }
function sevColor(s: string | null): string {
  if (s === "high" || s === "critical") return C.red;
  if (s === "medium") return C.amber;
  return C.green;
}
function sevPtxColor(s: string | null): string {
  if (s === "high" || s === "critical") return PC.red;
  if (s === "medium") return PC.amber;
  return "16A34A";
}

// ─── Gather all report data ────────────────────────────────────────────────────
async function gatherReportData() {
  const [programmeResult, configs, allProjects, allInitiatives, allKpis, allRisks, allPillars, allMilestones, allDepartments, allWeeklyReports] =
    await Promise.all([
      calcProgrammeProgress(),
      db.select().from(spmoProgrammeConfigTable).limit(1),
      db.select().from(spmoProjectsTable),
      db.select().from(spmoInitiativesTable),
      db.select().from(spmoKpisTable),
      db.select().from(spmoRisksTable),
      db.select().from(spmoPillarsTable),
      db.select().from(spmoMilestonesTable),
      db.select().from(spmoDepartmentsTable),
      db.select().from(spmoProjectWeeklyReportsTable).orderBy(desc(spmoProjectWeeklyReportsTable.createdAt)),
    ]);

  const { programmeProgress, pillarSummaries } = programmeResult;
  const config = configs[0];

  const totalAllocated = allProjects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalSpent = allProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);

  const statusCounts = { on_track: 0, at_risk: 0, delayed: 0, completed: 0, not_started: 0 };
  for (const p of allProjects) {
    const ms = allMilestones.filter((m) => m.projectId === p.id);
    const prog = ms.length === 0 ? 0 : ms.reduce((s, m) => s + (m.progress ?? 0), 0) / ms.length;
    const s = computeStatus(prog, p.startDate, p.targetDate, p.budget ?? 0, p.budgetSpent ?? 0, prog);
    const k = s.status as keyof typeof statusCounts;
    if (k in statusCounts) statusCounts[k]++;
    else statusCounts.not_started++;
  }

  const topRisks = [...allRisks]
    .sort((a, b) => (sevNum(b.impact) * sevNum(b.probability)) - (sevNum(a.impact) * sevNum(a.probability)))
    .slice(0, 5);

  const aiAssessment = await getCachedAssessment();

  const initiativeRows = allInitiatives.map((init) => {
    const pillar = allPillars.find((pl) => pl.id === init.pillarId);
    const projects = allProjects.filter((p) => p.initiativeId === init.id);
    const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
    const spent = projects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
    const avg =
      projects.length === 0
        ? 0
        : projects.reduce((s, p) => {
            const ms = allMilestones.filter((m) => m.projectId === p.id);
            const pr = ms.length === 0 ? 0 : ms.reduce((a, m) => a + (m.progress ?? 0), 0) / ms.length;
            return s + pr;
          }, 0) / projects.length;
    const s = computeStatus(avg, init.startDate, init.targetDate, totalBudget, spent, avg);
    return {
      id: init.id,
      name: init.name,
      pillarName: pillar?.name ?? "—",
      progress: Math.round(avg),
      spi: s.spi,
      status: s.status,
      budget: totalBudget,
      reason: s.reason,
    };
  });

  // Department-level stats
  const departmentStats = allDepartments.map((dept) => {
    const deptProjects = allProjects.filter((p) => p.departmentId === dept.id);
    const deptOnTrack = deptProjects.filter((p) => {
      const ms = allMilestones.filter((m) => m.projectId === p.id);
      const prog = ms.length === 0 ? 0 : ms.reduce((s, m) => s + (m.progress ?? 0), 0) / ms.length;
      const s = computeStatus(prog, p.startDate, p.targetDate, p.budget ?? 0, p.budgetSpent ?? 0, prog);
      return s.status === "on_track" || s.status === "completed";
    }).length;
    const avgProg = deptProjects.length === 0 ? 0 : Math.round(deptProjects.reduce((s, p) => {
      const ms = allMilestones.filter((m) => m.projectId === p.id);
      return s + (ms.length === 0 ? 0 : ms.reduce((a, m) => a + (m.progress ?? 0), 0) / ms.length);
    }, 0) / deptProjects.length);
    return { ...dept, projectCount: deptProjects.length, onTrack: deptOnTrack, avgProgress: avgProg, projects: deptProjects };
  }).filter((d) => d.projectCount > 0);

  // Latest weekly report per project
  const latestReports = new Map<number, typeof allWeeklyReports[0]>();
  for (const r of allWeeklyReports) {
    if (!latestReports.has(r.projectId)) latestReports.set(r.projectId, r);
  }

  return {
    programme: { programmeProgress, pillarSummaries },
    config,
    projects: allProjects,
    initiatives: initiativeRows,
    kpis: allKpis,
    risks: allRisks,
    topRisks,
    pillars: allPillars,
    departments: departmentStats,
    weeklyReports: latestReports,
    milestones: (() => {
      // Compute effective weights per project group
      const byProject = new Map<number, typeof allMilestones>();
      for (const m of allMilestones) {
        if (!byProject.has(m.projectId)) byProject.set(m.projectId, []);
        byProject.get(m.projectId)!.push(m);
      }
      const result: Array<typeof allMilestones[0] & { effectiveWeight: number }> = [];
      for (const [, ms] of byProject) {
        const totStored = ms.reduce((s, m) => s + (m.weight ?? 0), 0);
        const validAdmin = ms.every((m) => (m.weight ?? 0) > 0) && Math.abs(totStored - 100) <= 5;
        const totEffort = ms.reduce((s, m) => s + (m.effortDays ?? 0), 0);
        for (const m of ms) {
          let ew: number;
          if (validAdmin) ew = Math.round(((m.weight ?? 0) / totStored) * 1000) / 10;
          else if (totEffort > 0) ew = Math.round(((m.effortDays ?? 0) / totEffort) * 1000) / 10;
          else ew = Math.round((100 / ms.length) * 10) / 10;
          result.push({ ...m, effectiveWeight: ew });
        }
      }
      return result;
    })(),
    budget: { totalAllocated, totalSpent },
    statusCounts,
    aiAssessment: aiAssessment?.result ?? null,
  };
}

// ─── PDF helpers (McKinsey/BCG style) ────────────────────────────────────────

function pdfAccentBar(doc: InstanceType<typeof PDFDocument>) {
  doc.save().rect(0, 0, doc.page.width, 4).fill(C.primary).restore();
}

function pdfFooter(doc: InstanceType<typeof PDFDocument>, pageNum: number, total: number) {
  const y = doc.page.height - 22;
  doc
    .save()
    .moveTo(40, y - 4)
    .lineTo(doc.page.width - 40, y - 4)
    .lineWidth(0.5)
    .strokeColor(C.border)
    .stroke()
    .restore();
  doc
    .save()
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C.secondary)
    .text(
      `CONFIDENTIAL  ·  StrategyPMO  ·  ${formatDate(new Date())}`,
      40,
      y,
      { align: "center", width: doc.page.width - 80 },
    );
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C.secondary)
    .text(
      `Page ${pageNum} of ${total}`,
      doc.page.width - 120,
      y,
      { align: "right", width: 80 },
    )
    .restore();
}

function pdfHorizBar(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  fillColor: string,
  trackColor = "#E2E8F0",
) {
  doc.save().rect(x, y, w, h).fill(trackColor);
  if (pct > 0) doc.save().rect(x, y, Math.max((w * Math.min(pct, 100)) / 100, 2), h).fill(fillColor);
  doc.restore();
}

function pdfStatusDot(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  status: string,
) {
  doc.save().circle(x, y, 4).fill(statusColor(status)).restore();
}

function pdfKpiBox(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  label: string,
  color: string,
) {
  doc.save().rect(x, y, w, h).fill(C.white).restore();
  doc.save().rect(x, y, w, 3).fill(color).restore();
  doc.save().rect(x, y, w, h).lineWidth(0.5).strokeColor(C.border).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(26).fillColor(C.dark).text(value, x + 10, y + 14, { width: w - 20, align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor(C.mid).text(label.toUpperCase(), x + 10, y + 48, { width: w - 20, align: "center" });
}

// ─── PDF REPORT (McKinsey/BCG Executive Style) ─────────────────────────────
router.post("/pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const requireAuthCheck = requireAuth(req, res);
    if (!requireAuthCheck) return;

    const data = await gatherReportData();
    const currency = data.config?.reportingCurrency ?? "SAR";

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Strategy-Weekly-Report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    doc.pipe(res);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 40;
    const MARGIN = M; // alias for backward compat
    const CW = W - M * 2; // content width

    // Precompute key metrics
    const progPct = Math.round(data.programme.programmeProgress);
    const totalProjects = data.projects.length || 1;
    const onTrackProjects = data.statusCounts.on_track + data.statusCounts.completed;
    const budgetPct = data.budget.totalAllocated > 0
      ? Math.round((data.budget.totalSpent / data.budget.totalAllocated) * 100) : 0;
    const activeRisks = data.risks.filter((r) => r.status === "open").length;
    const pillarsAhead = data.programme.pillarSummaries.filter((ps) => ps.progress > 50).length;
    const pillarsLagging = data.programme.pillarSummaries.filter((ps) => ps.progress < 25).length;
    const delayedProjects = data.statusCounts.delayed;
    const atRiskProjects = data.statusCounts.at_risk;

    // Enriched project list with computed status
    const projectRows = data.projects.map((p) => {
      const ms = data.milestones.filter((m) => m.projectId === p.id);
      const prog = ms.length === 0 ? 0 : Math.round(ms.reduce((s, m) => s + (m.progress ?? 0), 0) / ms.length);
      const s = computeStatus(prog, p.startDate, p.targetDate, p.budget ?? 0, p.budgetSpent ?? 0, prog);
      const cpi = (p.budget ?? 0) > 0 && (p.budgetSpent ?? 0) > 0
        ? ((prog / 100) * (p.budget ?? 0)) / (p.budgetSpent ?? 0) : 1;
      return { ...p, progress: prog, computedStatus: s.status, cpi, spi: s.spi };
    });
    // Sort: delayed first, then at-risk, then on-track
    const statusOrder: Record<string, number> = { delayed: 0, at_risk: 1, not_started: 2, on_track: 3, completed: 4 };
    projectRows.sort((a, b) => (statusOrder[a.computedStatus] ?? 5) - (statusOrder[b.computedStatus] ?? 5));

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1: COVER
    // ══════════════════════════════════════════════════════════════════════════
    pdfAccentBar(doc);
    // Clean white cover with minimal text
    const programmeName = data.config?.programmeName ?? "National Transformation Programme";
    doc
      .font("Helvetica-Bold")
      .fontSize(36)
      .fillColor(C.dark)
      .text(programmeName, M, H * 0.30, { align: "center", width: CW });
    doc
      .font("Helvetica")
      .fontSize(16)
      .fillColor(C.secondary)
      .text("Strategy Weekly Report", M, H * 0.30 + 50, { align: "center", width: CW });
    // Thin accent line
    doc.save().moveTo(W * 0.35, H * 0.30 + 80).lineTo(W * 0.65, H * 0.30 + 80).lineWidth(1).strokeColor(C.primary).stroke().restore();
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(C.secondary)
      .text(`${formatDate(new Date())}`, M, H * 0.30 + 96, { align: "center", width: CW });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(C.secondary)
      .text("CONFIDENTIAL", M, H * 0.30 + 120, { align: "center", width: CW });

    // ── PAGE 2: Programme Overview ────────────────────────────────────────────
    doc.addPage();
    pdfAccentBar(doc);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(C.dark)
      .text("Programme Overview", M, 20);

    // Summary cards
    const cardW = 168;
    const cardH = 72;
    const cardY = 52;
    const totalInitiatives = data.programme.pillarSummaries.reduce((s, p) => s + p.initiativeCount, 0);
    const onTrackInitiatives = data.initiatives.filter((i) => i.status === "on_track").length;

    const cards = [
      { label: "Strategy Progress", value: `${Math.round(data.programme.programmeProgress)}%`, color: C.primary },
      { label: "Initiatives", value: `${totalInitiatives}`, sub: `${onTrackInitiatives} on track`, color: C.green },
      { label: "Projects", value: `${data.projects.length}`, sub: `${data.statusCounts.on_track} on track`, color: "#059669" },
      {
        label: "Budget Used",
        value: `${budgetPct}%`,
        sub: `${(data.budget.totalSpent / 1_000_000).toFixed(0)}M / ${(data.budget.totalAllocated / 1_000_000).toFixed(0)}M`,
        color: budgetPct > 80 ? C.red : C.amber,
      },
    ];

    cards.forEach((c, i) => {
      const x = M + i * (cardW + 12);
      doc.save().roundedRect(x, cardY, cardW, cardH, 6).fill(C.bg).stroke(C.border).restore();
      doc.save().rect(x, cardY, 4, cardH).fill(c.color).restore();
      doc.font("Helvetica").fontSize(10).fillColor(C.mid).text(c.label, x + 12, cardY + 10, { width: cardW - 18 });
      doc.font("Helvetica-Bold").fontSize(24).fillColor(C.dark).text(c.value, x + 12, cardY + 24, { width: cardW - 18 });
      if (c.sub) {
        doc.font("Helvetica").fontSize(10).fillColor(C.mid).text(c.sub, x + 12, cardY + 52, { width: cardW - 18 });
      }
    });

    // Project status distribution (text-based legend)
    const statY = cardY + cardH + 16;
    const leftW = (W - M * 2) * 0.45;

    doc
      .save()
      .roundedRect(M, statY, leftW, 170, 6)
      .fill(C.bg)
      .stroke(C.border)
      .restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(C.dark)
      .text("Project Status Distribution", M + 12, statY + 10);

    const total = data.projects.length || 1;
    const statusItems = [
      { label: "On Track", key: "on_track", color: C.green },
      { label: "At Risk", key: "at_risk", color: C.amber },
      { label: "Delayed", key: "delayed", color: C.red },
      { label: "Completed", key: "completed", color: "#16A34A" },
      { label: "Not Started", key: "not_started", color: C.secondary },
    ];

    statusItems.forEach((si, idx) => {
      const cnt = data.statusCounts[si.key as keyof typeof data.statusCounts] ?? 0;
      const pct = Math.round((cnt / total) * 100);
      const ry = statY + 32 + idx * 24;
      doc.save().roundedRect(M + 12, ry + 3, 10, 10, 2).fill(si.color).restore();
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(`${si.label}`, M + 28, ry, { width: 90 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(`${cnt}`, M + 125, ry, { width: 30, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text(`(${pct}%)`, M + 162, ry, { width: 40 });
    });

    // Pillar progress bars
    const pillarX = M + leftW + 16;
    const pillarW = W - M - pillarX;
    doc
      .save()
      .roundedRect(pillarX, statY, pillarW, 170, 6)
      .fill(C.bg)
      .stroke(C.border)
      .restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(C.dark)
      .text("Pillar Progress", pillarX + 12, statY + 10);

    data.programme.pillarSummaries.forEach((ps, idx) => {
      const py = statY + 32 + idx * 32;
      const barW = pillarW - 100;
      doc.font("Helvetica").fontSize(9).fillColor(C.dark).text(ps.pillar.name.slice(0, 22), pillarX + 12, py, { width: 130, ellipsis: true });
      pdfHorizBar(doc, pillarX + 12, py + 14, barW - 20, 10, ps.progress, ps.pillar.color ?? C.primary);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark).text(`${Math.round(ps.progress)}%`, pillarX + barW - 4, py + 12, { width: 36 });
    });

    // ── PAGE: Department Overview ──
    if (data.departments.length > 0) {
      doc.addPage();
      pdfAccentBar(doc);
      doc.font("Helvetica-Bold").fontSize(20).fillColor(C.dark).text("Department Overview", M, 20);
      doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text("Project distribution and health by department", M, 44);

      // Legend at the top — one row explaining all colors
      const legY = 62;
      const legItems = [
        { label: "On Track", color: C.green },
        { label: "At Risk", color: C.amber },
        { label: "Delayed", color: C.red },
        { label: "Completed", color: "#059669" },
        { label: "Not Started", color: C.secondary },
      ];
      let legX = M;
      legItems.forEach((l) => {
        doc.save().roundedRect(legX, legY, 10, 10, 2).fill(l.color).restore();
        doc.font("Helvetica").fontSize(9).fillColor(C.dark).text(l.label, legX + 14, legY, { width: 70 });
        legX += 85;
      });

      // Table header
      const deptTableY = legY + 22;
      const deptCols = [M, M + 200, M + 340, M + 490, M + CW - 70];
      doc.save().rect(M, deptTableY, CW, 22).fill(C.primary).restore();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.white);
      doc.text("Department", deptCols[0] + 8, deptTableY + 6, { width: 190 });
      doc.text("Status Distribution", deptCols[1] + 8, deptTableY + 6, { width: 140 });
      doc.text("Avg Progress", deptCols[2] + 8, deptTableY + 6, { width: 140 });
      doc.text("Projects", deptCols[3] + 8, deptTableY + 6, { width: 60, align: "center" });

      let deptOverY = deptTableY + 24;
      const deptRowH = 32;

      for (const dept of data.departments.slice(0, 14)) {
        if (deptOverY + deptRowH > H - 40) { doc.addPage(); pdfAccentBar(doc); deptOverY = 30; }

        const deptProjectRows = projectRows.filter((p: any) => p.departmentId === dept.id);
        const dOnTrack = deptProjectRows.filter((p: any) => p.computedStatus === "on_track").length;
        const dAtRisk = deptProjectRows.filter((p: any) => p.computedStatus === "at_risk").length;
        const dDelayed = deptProjectRows.filter((p: any) => p.computedStatus === "delayed").length;
        const dCompleted = deptProjectRows.filter((p: any) => p.computedStatus === "completed").length;
        const dTotal = dept.projectCount || 1;

        // Alternating row background
        const rowBg = (data.departments.indexOf(dept) % 2 === 0) ? C.white : C.bg;
        doc.save().rect(M, deptOverY, CW, deptRowH).fill(rowBg).restore();

        // Department name
        doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(dept.name, deptCols[0] + 8, deptOverY + 9, { width: 190 });

        // Stacked status bar (clean, proportional)
        const barX = deptCols[1] + 8;
        const barW = 130;
        const barH = 14;
        const barY = deptOverY + 9;
        doc.save().roundedRect(barX, barY, barW, barH, 3).fill(C.border).restore();
        let segX = barX;
        const barSegs = [
          { count: dOnTrack, color: C.green },
          { count: dAtRisk, color: C.amber },
          { count: dDelayed, color: C.red },
          { count: dCompleted, color: "#059669" },
        ];
        barSegs.forEach((seg) => {
          const segW = (seg.count / dTotal) * barW;
          if (segW >= 2) {
            doc.save().rect(segX, barY, segW, barH).fill(seg.color).restore();
            // Show count inside segment if wide enough
            if (segW > 14) {
              doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white).text(String(seg.count), segX, barY + 2, { width: segW, align: "center" });
            }
            segX += segW;
          }
        });

        // Average progress with bar
        const progBarX = deptCols[2] + 8;
        const progBarW = 100;
        doc.save().roundedRect(progBarX, barY, progBarW, barH, 3).fill(C.border).restore();
        const progColor = dept.avgProgress >= 70 ? C.green : dept.avgProgress >= 40 ? C.amber : C.red;
        doc.save().roundedRect(progBarX, barY, Math.max((dept.avgProgress / 100) * progBarW, 2), barH, 3).fill(progColor).restore();
        doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(`${dept.avgProgress}%`, progBarX + progBarW + 8, barY + 1, { width: 40 });

        // Project count
        doc.font("Helvetica-Bold").fontSize(12).fillColor(C.primary).text(String(dept.projectCount), deptCols[3] + 8, deptOverY + 8, { width: 60, align: "center" });

        deptOverY += deptRowH;
      }
    }

    // ── PAGE 3: Project Portfolio Table ─────────────────────────────────────
    {
      doc.addPage();
      pdfAccentBar(doc);
      doc.font("Helvetica-Bold").fontSize(20).fillColor(C.dark).text("Project Portfolio", M, 20);

      // Column widths for A4 landscape (762pt content area) — 9 columns
      const ptColWidths = [24, 50, 180, 65, 50, 65, 65, 80, 183];
      const ptColX: number[] = [];
      { let cx = M; for (const w of ptColWidths) { ptColX.push(cx); cx += w; } }
      const ptHeaders = ["#", "Code", "Project Name", "Status", "Progress", "Start", "End", "Budget", "Owner"];
      const ptRowH = 28;
      const ptHeaderH = 22;
      const ptDeptHeaderH = 22;
      const navy = "#1E3A5F";

      const drawPortfolioHeader = (yPos: number) => {
        doc.save().rect(M, yPos, CW, ptHeaderH).fill(navy).restore();
        ptHeaders.forEach((h, i) => {
          doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white).text(h, ptColX[i] + 3, yPos + 7, { width: ptColWidths[i] - 6, align: "left" });
        });
        return yPos + ptHeaderH;
      };

      const drawDeptHeader = (yPos: number, deptName: string, deptCount: number, deptAvg: number) => {
        doc.save().rect(M, yPos, CW, ptDeptHeaderH).fill(navy).restore();
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.white).text(
          `Department: ${deptName} — ${deptCount} projects, avg ${deptAvg}% progress`,
          M + 6, yPos + 6, { width: CW - 12 }
        );
        return yPos + ptDeptHeaderH;
      };

      // Format date as DD MMM YY
      const fmtDateShort = (d: Date | string | null | undefined): string => {
        if (!d) return "—";
        const dt = typeof d === "string" ? new Date(d) : d;
        if (isNaN(dt.getTime())) return "—";
        const day = String(dt.getDate()).padStart(2, "0");
        const mon = dt.toLocaleString("en-GB", { month: "short" }).toUpperCase();
        const yr = String(dt.getFullYear()).slice(2);
        return `${day} ${mon} ${yr}`;
      };

      let ptY = 50;

      // Group projects by department
      const deptGroups = data.departments.map((dept) => {
        const deptProjs = projectRows.filter((p: any) => p.departmentId === dept.id);
        // Sort within department: delayed first, at-risk, on-track, completed
        deptProjs.sort((a: any, b: any) => (statusOrder[a.computedStatus] ?? 5) - (statusOrder[b.computedStatus] ?? 5));
        const avg = deptProjs.length === 0 ? 0 : Math.round(deptProjs.reduce((s: number, p: any) => s + p.progress, 0) / deptProjs.length);
        return { name: dept.name, projects: deptProjs, avg };
      }).filter((g) => g.projects.length > 0);

      // Also include projects with no department
      const unassignedProjs = projectRows.filter((p: any) => !data.departments.some((d) => d.id === p.departmentId));
      if (unassignedProjs.length > 0) {
        unassignedProjs.sort((a: any, b: any) => (statusOrder[a.computedStatus] ?? 5) - (statusOrder[b.computedStatus] ?? 5));
        const avg = Math.round(unassignedProjs.reduce((s: number, p: any) => s + p.progress, 0) / unassignedProjs.length);
        deptGroups.push({ name: "Unassigned", projects: unassignedProjs, avg });
      }

      let globalIdx = 0;
      for (const group of deptGroups) {
        // Check if department header + column header + at least 1 row fits
        const neededH = ptDeptHeaderH + ptHeaderH + ptRowH;
        if (ptY + neededH > H - 40) {
          doc.addPage();
          pdfAccentBar(doc);
          ptY = 30;
        }

        // Department header
        ptY = drawDeptHeader(ptY, group.name, group.projects.length, group.avg);
        // Column headers
        ptY = drawPortfolioHeader(ptY);

        group.projects.forEach((p: any, localIdx: number) => {
          // Page overflow: new page with dept header repeated + column header
          if (ptY + ptRowH > H - 40) {
            doc.addPage();
            pdfAccentBar(doc);
            ptY = drawDeptHeader(30, group.name + " (cont.)", group.projects.length, group.avg);
            ptY = drawPortfolioHeader(ptY);
          }

          const rowBg = localIdx % 2 === 0 ? C.white : C.bg;
          doc.save().rect(M, ptY, CW, ptRowH).fill(rowBg).restore();

          const textY = ptY + 9;
          globalIdx++;

          // # (row number)
          doc.font("Helvetica").fontSize(8).fillColor(C.dark).text(String(globalIdx), ptColX[0] + 3, textY, { width: ptColWidths[0] - 6 });

          // Code (bold 10pt)
          doc.font("Helvetica-Bold").fontSize(8).fillColor(C.dark).text((p.projectCode ?? "—").slice(0, 8), ptColX[1] + 3, textY, { width: ptColWidths[1] - 6 });

          // Project Name (truncated 30 chars)
          doc.font("Helvetica").fontSize(8).fillColor(C.dark).text((p.name ?? "").slice(0, 30), ptColX[2] + 3, textY, { width: ptColWidths[2] - 6 });

          // Status — colored rectangle with white text
          const sColor = statusColor(p.computedStatus);
          const sLabel = statusLabelUpper(p.computedStatus);
          doc.save().roundedRect(ptColX[3] + 3, ptY + 6, ptColWidths[3] - 6, 16, 3).fill(sColor).restore();
          doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white).text(sLabel, ptColX[3] + 5, ptY + 10, { width: ptColWidths[3] - 10, align: "center" });

          // Progress — colored box with percentage
          const pColor = statusColor(p.computedStatus);
          doc.save().roundedRect(ptColX[4] + 3, ptY + 6, ptColWidths[4] - 6, 16, 3).fill(pColor).restore();
          doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white).text(`${p.progress}%`, ptColX[4] + 3, ptY + 10, { width: ptColWidths[4] - 6, align: "center" });

          // Start Date (DD MMM YY)
          doc.font("Helvetica").fontSize(8).fillColor(C.dark).text(fmtDateShort(p.startDate), ptColX[5] + 3, textY, { width: ptColWidths[5] - 6 });

          // End Date (DD MMM YY)
          doc.font("Helvetica").fontSize(8).fillColor(C.dark).text(fmtDateShort(p.targetDate), ptColX[6] + 3, textY, { width: ptColWidths[6] - 6 });

          // Budget (currency XM format)
          const budgetVal = p.budget ?? 0;
          const budgetStr = fmtSAR(budgetVal, currency);
          doc.font("Helvetica").fontSize(8).fillColor(C.dark).text(budgetStr, ptColX[7] + 3, textY, { width: ptColWidths[7] - 6 });

          // Owner (truncated 20 chars)
          doc.font("Helvetica").fontSize(8).fillColor(C.dark).text((p.ownerName ?? "—").slice(0, 20), ptColX[8] + 3, textY, { width: ptColWidths[8] - 6 });

          ptY += ptRowH;
        });

        // Gap between departments
        ptY += 8;
      }
    }

    // ── PAGE 4: Budget & KPIs ─────────────────────────────────────────────────
    doc.addPage();
    pdfAccentBar(doc);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(C.dark).text("Budget Health & Strategic KPIs", M, 20);

    const leftW4 = (W - M * 2) * 0.42;
    const rightX4 = M + leftW4 + 16;
    const rightW4 = W - rightX4 - M;
    const panelTop4 = 50;

    // Budget panel — constrained height for overflow protection
    const budgetPanelH = Math.min(280, 30 + data.programme.pillarSummaries.length * 28);
    doc.save().roundedRect(M, panelTop4, leftW4, budgetPanelH, 6).fill(C.bg).stroke(C.border).restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.dark).text("Budget by Pillar", M + 12, panelTop4 + 10);

    const barAreaW = leftW4 - 120;
    const pillarBudgets = data.programme.pillarSummaries.map((ps) => {
      const inits = data.initiatives.filter((i) => i.pillarName === ps.pillar.name);
      const allocated = inits.reduce((s, i) => s + i.budget, 0);
      const pillarProjects = data.projects.filter((p) => inits.some((i) => i.id === p.initiativeId));
      const spent = pillarProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
      return { name: ps.pillar.name, allocated, spent, color: ps.pillar.color ?? C.primary };
    });
    const maxPillarBudget = Math.max(...pillarBudgets.map((p) => p.allocated), 1);

    pillarBudgets.slice(0, 8).forEach((pb, idx) => {
      const by = panelTop4 + 28 + idx * 26;
      doc.font("Helvetica").fontSize(9).fillColor(C.dark).text(pb.name.slice(0, 15), M + 8, by, { width: 80, ellipsis: true });
      const bw = barAreaW - 10;
      const allocW = (pb.allocated / maxPillarBudget) * bw;
      const spentW = pb.allocated > 0 ? (pb.spent / pb.allocated) * allocW : 0;
      const barStartX = M + 92;
      doc.save().roundedRect(barStartX, by + 10, bw, 10, 3).fill("#BFDBFE").restore();
      doc.save().roundedRect(barStartX, by + 10, Math.max(spentW, 2), 10, 3).fill(pb.color).restore();
      const allocM = (pb.allocated / 1_000_000).toFixed(0);
      const spentM = (pb.spent / 1_000_000).toFixed(0);
      doc.font("Helvetica").fontSize(8).fillColor(C.secondary).text(`${spentM}M / ${allocM}M`, barStartX + bw + 3, by + 9, { width: 55 });
    });

    // Budget totals
    const totalY4 = panelTop4 + 28 + Math.min(pillarBudgets.length, 8) * 26 + 6;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark).text(
      `Total Allocated: ${(data.budget.totalAllocated / 1_000_000).toFixed(1)}M   |   Spent: ${(data.budget.totalSpent / 1_000_000).toFixed(1)}M   |   Utilisation: ${Math.round((data.budget.totalSpent / Math.max(data.budget.totalAllocated, 1)) * 100)}%`,
      M + 12, totalY4, { width: leftW4 - 24 }
    );

    // KPI panel — matches budget panel height
    doc.save().roundedRect(rightX4, panelTop4, rightW4, budgetPanelH, 6).fill(C.bg).stroke(C.border).restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.dark).text("Strategic KPIs", rightX4 + 12, panelTop4 + 10);

    const kpiCols = [rightX4 + 12, rightX4 + 140, rightX4 + 190, rightX4 + 235];
    doc.save().rect(rightX4, panelTop4 + 28, rightW4, 16).fill("#F1F5F9").restore();
    ["KPI Name", "Actual", "Target", "Status"].forEach((h, i) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.secondary).text(h, kpiCols[i] + 2, panelTop4 + 33, { width: 80 });
    });

    let kpiY4 = panelTop4 + 46;
    data.kpis.slice(0, 7).forEach((kpi, idx) => {
      const bg = idx % 2 === 0 ? C.white : C.bg;
      doc.save().rect(rightX4, kpiY4, rightW4, 18).fill(bg).restore();
      doc.font("Helvetica").fontSize(8).fillColor(C.dark).text((kpi.name ?? "").slice(0, 22), kpiCols[0] + 2, kpiY4 + 5, { width: 110, ellipsis: true });
      doc.font("Helvetica").fontSize(8).fillColor(C.dark).text(String(kpi.actual ?? "—"), kpiCols[1] + 2, kpiY4 + 5, { width: 45 });
      doc.font("Helvetica").fontSize(8).fillColor(C.dark).text(String(kpi.target ?? "—"), kpiCols[2] + 2, kpiY4 + 5, { width: 45 });
      const sc = kpiStatusColor(kpi.status ?? "");
      doc.save().roundedRect(kpiCols[3] + 2, kpiY4 + 3, 45, 12, 3).fill(sc).restore();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white).text((kpi.status ?? "").replace("_", " ").slice(0, 9), kpiCols[3] + 5, kpiY4 + 6, { width: 42 });
      kpiY4 += 18;
    });

    // ── PAGE 5: Risk Summary (single landscape page, left/right layout) ────
    doc.addPage();
    pdfAccentBar(doc);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(C.dark).text("Risk Summary", M, 20);
    doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text("Open risks by score and department distribution", M, 44);

    const halfW = (W - M * 2) / 2;
    const leftX = M;
    const rightX5 = M + halfW + 8;
    const rightW5 = halfW - 8;
    const panelTop5 = 62;

    // ── LEFT HALF: Top Risks Table + Heat Map ──

    // -- Top Risks by Score table --
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.primary).text("Top Risks by Score", leftX, panelTop5);
    const openRisksSorted = [...data.risks]
      .filter((r) => r.status === "open")
      .sort((a, b) => (sevNum(b.impact) * sevNum(b.probability)) - (sevNum(a.impact) * sevNum(a.probability)))
      .slice(0, 8);

    const tblY = panelTop5 + 14;
    const tblColX = [leftX, leftX + 16, leftX + 130, leftX + 210, leftX + 260, leftX + 310, leftX + 340];
    const tblColW = [16, 114, 80, 50, 50, 30, halfW - 340];
    const tblHeaders = ["#", "Risk Title", "Project", "Prob", "Impact", "Score", "Owner"];
    const tblRowH = 16;

    // Header row
    doc.save().rect(leftX, tblY, halfW, tblRowH).fill(C.primary).restore();
    tblHeaders.forEach((h, i) => {
      doc.font("Helvetica-Bold").fontSize(7).fillColor(C.white).text(h, tblColX[i] + 2, tblY + 4, { width: tblColW[i] - 4 });
    });

    let tblCurY = tblY + tblRowH;
    openRisksSorted.forEach((risk, idx) => {
      const score = sevNum(risk.impact) * sevNum(risk.probability);
      const rowBg = idx % 2 === 0 ? C.white : C.bg;
      doc.save().rect(leftX, tblCurY, halfW, tblRowH).fill(rowBg).restore();

      const proj = data.projects.find((p) => p.id === risk.projectId);
      const projName = proj ? `${proj.projectCode ? proj.projectCode + ": " : ""}${(proj.name ?? "").slice(0, 12)}` : "—";
      const scoreColor = score >= 12 ? C.red : score >= 6 ? C.amber : C.green;

      doc.font("Helvetica").fontSize(7).fillColor(C.dark).text(String(idx + 1), tblColX[0] + 2, tblCurY + 4, { width: tblColW[0] - 4 });
      doc.font("Helvetica").fontSize(7).fillColor(C.dark).text((risk.title ?? "").slice(0, 20), tblColX[1] + 2, tblCurY + 4, { width: tblColW[1] - 4 });
      doc.font("Helvetica").fontSize(7).fillColor(C.dark).text(projName, tblColX[2] + 2, tblCurY + 4, { width: tblColW[2] - 4 });
      doc.font("Helvetica").fontSize(7).fillColor(C.dark).text((risk.probability ?? "—").slice(0, 8), tblColX[3] + 2, tblCurY + 4, { width: tblColW[3] - 4 });
      doc.font("Helvetica").fontSize(7).fillColor(C.dark).text((risk.impact ?? "—").slice(0, 8), tblColX[4] + 2, tblCurY + 4, { width: tblColW[4] - 4 });
      doc.font("Helvetica-Bold").fontSize(7).fillColor(scoreColor).text(String(score), tblColX[5] + 2, tblCurY + 4, { width: tblColW[5] - 4 });
      doc.font("Helvetica").fontSize(7).fillColor(C.dark).text((risk.owner ?? "—").slice(0, 14), tblColX[6] + 2, tblCurY + 4, { width: tblColW[6] - 4 });

      tblCurY += tblRowH;
    });

    // -- Risk Heat Map (Probability x Impact) below the table --
    const hmY = tblCurY + 14;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.primary).text("Risk Heat Map (Probability \u00D7 Impact)", leftX, hmY);

    const probLevels = ["low", "medium", "high", "critical"];
    const impactLevels = ["low", "medium", "high", "critical"];
    const riskMatrix: number[][] = probLevels.map((prob) =>
      impactLevels.map((imp) =>
        data.risks.filter((r) => r.status === "open" && r.probability === prob && r.impact === imp).length
      )
    );

    const cellW = 50;
    const cellH = 35;
    const hmLabelW = 55;
    const hmGridX = leftX + hmLabelW;
    let hmCurY = hmY + 16;

    // X-axis header labels (bottom labels drawn after grid, but also top for clarity)
    // Draw grid rows: top = critical (index 3), bottom = low (index 0)
    for (let ri = probLevels.length - 1; ri >= 0; ri--) {
      const probLabel = probLevels[ri].charAt(0).toUpperCase() + probLevels[ri].slice(1);
      // Y-axis label (left side)
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.secondary).text(
        probLabel, leftX, hmCurY + cellH / 2 - 5, { width: hmLabelW - 4, align: "right" }
      );

      for (let ci = 0; ci < impactLevels.length; ci++) {
        const count = riskMatrix[ri][ci];
        const probScore = ri + 1;
        const impScore = ci + 1;
        const score = probScore * impScore;

        let cellBg: string;
        let cellTextColor: string;
        if (score >= 12) {
          cellBg = C.red; cellTextColor = C.white;
        } else if (score >= 6) {
          cellBg = C.amber; cellTextColor = C.white;
        } else {
          cellBg = C.green; cellTextColor = C.white;
        }

        const cx = hmGridX + ci * cellW;
        doc.save().rect(cx, hmCurY, cellW, cellH).fill(cellBg).restore();
        doc.save().rect(cx, hmCurY, cellW, cellH).lineWidth(0.5).strokeColor(C.border).stroke().restore();
        doc.font("Helvetica-Bold").fontSize(14).fillColor(cellTextColor).text(
          String(count), cx, hmCurY + cellH / 2 - 8, { width: cellW, align: "center" }
        );
      }
      hmCurY += cellH;
    }

    // X-axis labels below grid
    impactLevels.forEach((imp, ci) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.secondary).text(
        imp.charAt(0).toUpperCase() + imp.slice(1),
        hmGridX + ci * cellW, hmCurY + 3, { width: cellW, align: "center" }
      );
    });
    // Axis titles
    doc.font("Helvetica").fontSize(8).fillColor(C.secondary).text(
      "Impact -->", hmGridX, hmCurY + 14, { width: 4 * cellW, align: "center" }
    );

    // ── RIGHT HALF: Department Risk Criticality ──
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.primary).text("Department Risk Criticality", rightX5, panelTop5);
    doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text("Open risks by department", rightX5, panelTop5 + 14);

    // Legend
    const riskLegItems = [
      { label: "Critical", color: C.red },
      { label: "High", color: C.amber },
      { label: "Medium", color: "#3B82F6" },
      { label: "Low", color: C.secondary },
    ];
    let riskLegX = rightX5;
    const legRowY = panelTop5 + 28;
    riskLegItems.forEach((l) => {
      doc.save().roundedRect(riskLegX, legRowY, 10, 10, 2).fill(l.color).restore();
      doc.font("Helvetica").fontSize(8).fillColor(C.dark).text(l.label, riskLegX + 13, legRowY, { width: 50 });
      riskLegX += 65;
    });

    // Compute department risk data
    const deptRiskData = data.departments.map((dept) => {
      const deptRisks = data.risks.filter((r) => {
        const proj = data.projects.find((p) => p.id === r.projectId);
        return proj && proj.departmentId === dept.id && r.status === "open";
      });
      const critical = deptRisks.filter((r) => sevNum(r.impact) * sevNum(r.probability) >= 12).length;
      const high = deptRisks.filter((r) => { const s = sevNum(r.impact) * sevNum(r.probability); return s >= 6 && s < 12; }).length;
      const medium = deptRisks.filter((r) => { const s = sevNum(r.impact) * sevNum(r.probability); return s >= 3 && s < 6; }).length;
      const low = deptRisks.filter((r) => sevNum(r.impact) * sevNum(r.probability) < 3).length;
      return { name: dept.name, total: deptRisks.length, critical, high, medium, low };
    }).filter((d) => d.total > 0).sort((a, b) => b.total - a.total);

    const maxRiskCount = Math.max(...deptRiskData.map((d) => d.total), 1);
    const deptBarH = 20;
    const deptBarMaxW = rightW5 - 130;
    const deptNameW = 100;
    let deptRiskY = legRowY + 18;

    for (const dept of deptRiskData.slice(0, 14)) {
      if (deptRiskY + deptBarH + 6 > H - 40) break;

      // Department name (left, truncated)
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(
        dept.name.slice(0, 22), rightX5, deptRiskY + 3, { width: deptNameW, ellipsis: true }
      );

      // Stacked bar (scaled to max)
      const barX = rightX5 + deptNameW + 4;
      const barTotalW = (dept.total / maxRiskCount) * deptBarMaxW;
      doc.save().roundedRect(barX, deptRiskY, Math.max(barTotalW, 2), deptBarH, 3).fill(C.border).restore();

      let segOff = 0;
      const segs = [
        { count: dept.critical, color: C.red },
        { count: dept.high, color: C.amber },
        { count: dept.medium, color: "#3B82F6" },
        { count: dept.low, color: C.secondary },
      ];
      segs.forEach((seg) => {
        if (seg.count > 0) {
          const segW = (seg.count / dept.total) * barTotalW;
          doc.save().rect(barX + segOff, deptRiskY, Math.max(segW, 4), deptBarH).fill(seg.color).restore();
          if (segW > 18) {
            doc.font("Helvetica-Bold").fontSize(9).fillColor(C.white).text(
              String(seg.count), barX + segOff, deptRiskY + 4, { width: segW, align: "center" }
            );
          }
          segOff += segW;
        }
      });

      // Total count after bar
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(
        String(dept.total), barX + barTotalW + 6, deptRiskY + 3, { width: 30 }
      );

      deptRiskY += deptBarH + 6;
    }

    // ── PAGE: Escalations & Critical Issues ──
    doc.addPage();
    pdfAccentBar(doc);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(C.dark).text("Escalations & Critical Issues", 40, 50);

    const critRisks = data.risks.filter((r) => r.status === "open" && r.riskScore >= 12);
    if (critRisks.length > 0) {
      let supY = 85;
      doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text("Items requiring executive decision or intervention:", 40, supY);
      supY += 20;
      critRisks.slice(0, 8).forEach((r, i) => {
        const rProj = data.projects.find((p) => p.id === r.projectId);
        const rProjLabel = rProj ? `${rProj.projectCode ? rProj.projectCode + ": " : ""}${rProj.name}` : "";
        doc.rect(40, supY, 530, 35).fill(i % 2 === 0 ? "#FFFFFF" : C.bg);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.red).text(`${i + 1}.`, 45, supY + 4, { width: 20 });
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark).text(r.title, 62, supY + 4, { width: 300 });
        doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(`${rProjLabel ? rProjLabel + " · " : ""}Score: ${r.riskScore} · ${r.probability}/${r.impact} · Owner: ${r.owner ?? "—"}`, 62, supY + 18, { width: 500 });
        supY += 38;
      });
    } else {
      doc.font("Helvetica").fontSize(11).fillColor(C.green).text("No critical escalations this week.", 40, 100);
    }

    // ── DETAIL PAGES start below (appendix per-dept removed) ──

    /* REMOVED: Per-department project details appendix — redundant with
       the per-project detail pages for at-risk/delayed projects below.
    for (const dept of data.departments) {
      doc.addPage();
      pdfAccentBar(doc);
      doc.font("Helvetica-Bold").fontSize(16).fillColor(C.dark).text(`${dept.name} — Project Details`, 40, 50);
      doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(`${dept.projectCount} projects · Average progress ${dept.avgProgress}%`, 40, 72);

      let projY = 100;
      for (const p of dept.projects.slice(0, 8)) {
        const ms = data.milestones.filter((m) => m.projectId === p.id);
        const prog = ms.length === 0 ? 0 : Math.round(ms.reduce((s, m) => s + (m.progress ?? 0), 0) / ms.length);
        const s = computeStatus(prog, p.startDate, p.targetDate, p.budget ?? 0, p.budgetSpent ?? 0, prog);
        const report = data.weeklyReports.get(p.id);
        const topRisks = data.risks.filter((r) => r.projectId === p.id && r.status === "open").sort((a, b) => b.riskScore - a.riskScore).slice(0, 2);
        const spentPct = (p.budget ?? 0) > 0 ? Math.round(((p.budgetSpent ?? 0) / (p.budget ?? 0)) * 100) : 0;
        const fmtBudget = (n: number) => fmtSAR(n, currency);

        // Project header row
        doc.rect(40, projY, W - 80, 28).fill(C.bg);
        doc.rect(40, projY, 5, 28).fill(statusColor(s.status));
        doc.font("Helvetica-Bold").fontSize(11).fillColor(C.dark).text(`${p.projectCode ?? ""} ${p.name}`.trim(), 52, projY + 7, { width: 320 });
        doc.font("Helvetica-Bold").fontSize(10).fillColor(statusColor(s.status)).text(statusLabel(s.status).toUpperCase(), 380, projY + 8, { width: 70 });
        doc.font("Helvetica-Bold").fontSize(12).fillColor(C.dark).text(`${prog}%`, 460, projY + 6, { width: 50, align: "right" });
        pdfHorizBar(doc, 520, projY + 10, 180, 8, prog, statusColor(s.status));
        doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text(`${fmtBudget(p.budget ?? 0)} · ${spentPct}% spent · Owner: ${p.ownerName ?? "—"}`, 52, projY + 22, { width: 400 });
        projY += 32;

        // Achievements from weekly report
        if (report) {
          const achievements = (report as any).keyAchievements || (report as any).statusReason || (report as any).notes || "";
          const nextSteps = (report as any).nextSteps || (report as any).completionReason || "";
          if (achievements) {
            doc.font("Helvetica-Bold").fontSize(9).fillColor(C.primary).text("ACHIEVEMENTS", 52, projY + 2);
            doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(achievements.slice(0, 250), 52, projY + 14, { width: W - 130 });
            projY += 14 + Math.ceil(Math.min(achievements.length, 250) / 80) * 14;
          }
          if (nextSteps) {
            doc.font("Helvetica-Bold").fontSize(9).fillColor(C.primary).text("NEXT STEPS", 52, projY + 2);
            doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(nextSteps.slice(0, 250), 52, projY + 14, { width: W - 130 });
            projY += 14 + Math.ceil(Math.min(nextSteps.length, 250) / 80) * 14;
          }
        } else {
          doc.font("Helvetica").fontSize(10).fillColor(C.light).text("No weekly report submitted this period.", 52, projY + 2);
          projY += 16;
        }

        // Risks for this project
        if (topRisks.length > 0) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor(C.red).text("RISKS", 52, projY + 2);
          topRisks.forEach((r, idx) => {
            doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(`${idx + 1}. ${r.title} (Score: ${r.riskScore}, Owner: ${r.owner ?? "—"})`, 52, projY + 14 + idx * 14, { width: W - 130 });
          });
          projY += 14 + topRisks.length * 14;
        }

        projY += 16; // gap between projects
        if (projY > doc.page.height - 80) { doc.addPage(); pdfAccentBar(doc); projY = 50; }
      }
    }
    END OF REMOVED APPENDIX */

    // ── DETAIL PAGES: At-Risk and Delayed Projects (full page each) ──
    {
      const detNavy = "#1E3A5F";
      const detMid = "#475569";
      const detLight = "#94A3B8";
      const detBg = "#F8FAFC";
      const detBorder = "#E2E8F0";
      const detLightRed = "#FEE2E2";

      const flaggedProjects = projectRows.filter((p: any) => p.computedStatus === "delayed" || p.computedStatus === "at_risk");
      for (const p of flaggedProjects) {
        doc.addPage();
        pdfAccentBar(doc);

        const ms = data.milestones.filter((m: any) => m.projectId === p.id);
        const report = data.weeklyReports.get(p.id);
        const projRisks = data.risks.filter((r: any) => r.projectId === p.id && r.status === "open").sort((a: any, b: any) => b.riskScore - a.riskScore);
        const spentPct = (p.budget ?? 0) > 0 ? Math.round(((p.budgetSpent ?? 0) / (p.budget ?? 0)) * 100) : 0;
        const budgetVal = p.budget ?? 0;
        const budgetStr = fmtSAR(budgetVal, currency);

        // ── Header area (top 90pt) ──
        // Left: project code + name
        doc.font("Helvetica-Bold").fontSize(16).fillColor(C.dark).text(`${p.projectCode ?? ""} ${p.name}`.trim(), M, 18, { width: W - M - 160 });

        // Right: status badge (100x24)
        const badgeColor = (p as any).computedStatus === "delayed" ? C.red : C.amber;
        const badgeLabel = statusLabelUpper((p as any).computedStatus);
        doc.save().roundedRect(W - M - 100, 18, 100, 24, 4).fill(badgeColor).restore();
        doc.font("Helvetica-Bold").fontSize(11).fillColor(C.white).text(badgeLabel, W - M - 100, 23, { width: 100, align: "center" });

        // Metrics row: 4 boxes side by side
        const metY = 50;
        const metBoxW = (CW - 24) / 4;
        // Progress box
        const progColor = statusColor((p as any).computedStatus);
        doc.save().roundedRect(M, metY, 40, 24, 3).fill(progColor).restore();
        doc.font("Helvetica-Bold").fontSize(11).fillColor(C.white).text(`${(p as any).progress}%`, M, metY + 6, { width: 40, align: "center" });
        // Budget
        doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(`${budgetStr} (${spentPct}% spent)`, M + 50, metY + 6, { width: metBoxW - 10 });
        // Timeline
        const startStr = p.startDate ? formatDate(new Date(p.startDate)) : "—";
        const endStr = p.targetDate ? formatDate(new Date(p.targetDate)) : "—";
        doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(`Start: ${startStr}  --  End: ${endStr}`, M + metBoxW + 58, metY + 6, { width: metBoxW * 1.5 });
        // Owner
        doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(`Owner: ${p.ownerName ?? "—"}`, W - M - 180, metY + 6, { width: 180 });

        // ── Milestones table (starting at ~110pt) ──
        let detY = 110;
        if (ms.length > 0) {
          doc.font("Helvetica-Bold").fontSize(11).fillColor(detNavy).text("Milestones", M, detY - 16);

          // Column layout for milestones
          const msColX = [M, M + 280, M + 380, M + 460, M + 540];
          const msColW = [280, 100, 80, 80, CW - 540 + M];
          const msHeaders = ["Milestone", "Due Date", "Progress", "Status", "Weight"];
          const msHeaderH = 20;
          const msRowH = 22;
          const today = new Date();

          // Header
          doc.save().rect(M, detY, CW, msHeaderH).fill(detNavy).restore();
          msHeaders.forEach((h, i) => {
            doc.font("Helvetica-Bold").fontSize(9).fillColor(C.white).text(h, msColX[i] + 4, detY + 5, { width: msColW[i] - 8 });
          });
          detY += msHeaderH;

          ms.forEach((m: any, idx: number) => {
            if (detY + msRowH > H - 100) return; // leave space for content below

            const dueDateObj = m.dueDate ? new Date(m.dueDate) : null;
            const isOverdue = dueDateObj && dueDateObj < today && m.status !== "approved" && m.status !== "completed";
            const daysOverdue = isOverdue && dueDateObj ? Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24)) : 0;

            // Row background: light red for delayed/overdue milestones, else alternating
            const rowBg = isOverdue ? detLightRed : (idx % 2 === 0 ? C.white : detBg);
            doc.save().rect(M, detY, CW, msRowH).fill(rowBg).restore();

            // Milestone name (with red dot prefix if overdue)
            const mName = m.name.slice(0, 40);
            if (isOverdue) {
              doc.save().circle(M + 8, detY + msRowH / 2, 3).fill(C.red).restore();
              doc.font("Helvetica").fontSize(9).fillColor(C.dark).text(mName, M + 16, detY + 5, { width: msColW[0] - 20 });
            } else {
              doc.font("Helvetica").fontSize(9).fillColor(C.dark).text(mName, M + 4, detY + 5, { width: msColW[0] - 8 });
            }

            // Due date
            const dueDateStr = dueDateObj ? formatDate(dueDateObj) : "—";
            if (isOverdue) {
              doc.font("Helvetica-Bold").fontSize(9).fillColor(C.red).text(dueDateStr, msColX[1] + 4, detY + 3, { width: msColW[1] - 8 });
              if (daysOverdue > 0) {
                doc.font("Helvetica").fontSize(8).fillColor(C.red).text(`${daysOverdue}d overdue`, msColX[1] + 4, detY + 13, { width: msColW[1] - 8 });
              }
            } else {
              doc.font("Helvetica").fontSize(9).fillColor(C.dark).text(dueDateStr, msColX[1] + 4, detY + 5, { width: msColW[1] - 8 });
            }

            // Progress
            doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark).text(`${m.progress ?? 0}%`, msColX[2] + 4, detY + 5, { width: msColW[2] - 8, align: "center" });

            // Status
            const mStatusColor = statusColor(m.status);
            doc.save().roundedRect(msColX[3] + 4, detY + 4, msColW[3] - 8, 14, 3).fill(mStatusColor).restore();
            doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white).text(statusLabel(m.status), msColX[3] + 6, detY + 7, { width: msColW[3] - 12, align: "center" });

            // Weight
            doc.font("Helvetica").fontSize(9).fillColor(detMid).text(((m as any).effectiveWeight ?? m.weight) != null ? `${Math.round((m as any).effectiveWeight ?? m.weight ?? 0)}%` : "—", msColX[4] + 4, detY + 5, { width: msColW[4] - 8 });

            detY += msRowH;
          });
          detY += 12;
        }

        // ── Two-column layout: Achievements (60%) | Next Steps (40%) ──
        const leftColW = CW * 0.6 - 8;
        const rightColX = M + CW * 0.6 + 8;
        const rightColW = CW * 0.4 - 8;
        const twoColY = detY;

        // Key Achievements (left column)
        doc.font("Helvetica-Bold").fontSize(11).fillColor(detNavy).text("Key Achievements", M, twoColY);
        doc.save().moveTo(M, twoColY + 14).lineTo(M + leftColW, twoColY + 14).lineWidth(0.5).strokeColor(detBorder).stroke().restore();
        let leftY = twoColY + 20;
        if (report) {
          const achievements = (report as any).keyAchievements || (report as any).statusReason || (report as any).notes || "No details provided.";
          doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(achievements, M, leftY, { width: leftColW, lineGap: 3 });
          leftY += doc.heightOfString(achievements, { width: leftColW, lineGap: 3 });
        } else {
          doc.font("Helvetica").fontSize(10).fillColor(detLight).text("No weekly report submitted", M, leftY, { width: leftColW });
          leftY += 16;
        }

        // Next Steps (right column)
        doc.font("Helvetica-Bold").fontSize(11).fillColor(detNavy).text("Next Steps", rightColX, twoColY);
        doc.save().moveTo(rightColX, twoColY + 14).lineTo(rightColX + rightColW, twoColY + 14).lineWidth(0.5).strokeColor(detBorder).stroke().restore();
        let rightY = twoColY + 20;
        if (report) {
          const nextSteps = (report as any).nextSteps || (report as any).completionReason || "No next steps provided.";
          doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(nextSteps, rightColX, rightY, { width: rightColW, lineGap: 3 });
          rightY += doc.heightOfString(nextSteps, { width: rightColW, lineGap: 3 });
        } else {
          doc.font("Helvetica").fontSize(10).fillColor(detLight).text("No weekly report submitted", rightColX, rightY, { width: rightColW });
          rightY += 16;
        }

        detY = Math.max(leftY, rightY) + 16;

        // ── Risks section ──
        if (projRisks.length > 0 && detY < H - 60) {
          doc.font("Helvetica-Bold").fontSize(11).fillColor(detNavy).text(`Active Risks (${projRisks.length})`, M, detY);
          doc.save().moveTo(M, detY + 14).lineTo(W - M, detY + 14).lineWidth(0.5).strokeColor(detBorder).stroke().restore();
          detY += 20;

          projRisks.slice(0, 8).forEach((r: any) => {
            if (detY + 20 > H - 40) return;
            // Colored left bar (5px) based on score
            const riskBarColor = r.riskScore >= 12 ? C.red : r.riskScore >= 6 ? C.amber : C.green;
            doc.save().rect(M, detY, 5, 20).fill(riskBarColor).restore();
            // Title + score + owner
            doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(r.title, M + 12, detY + 4, { width: 350 });
            doc.font("Helvetica").fontSize(10).fillColor(detMid).text(`Score: ${r.riskScore}`, M + 370, detY + 4, { width: 80 });
            doc.font("Helvetica").fontSize(10).fillColor(detMid).text(`Owner: ${r.owner ?? "—"}`, M + 460, detY + 4, { width: 200 });
            detY += 20;
          });
        }
      }
    }

    // Add footers to all pages
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      pdfFooter(doc, i + 1, range.count);
    }

    doc.end();
  } catch (err) {
    req.log?.error?.({ err }, "PDF generation error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  }
});

// ─── PPTX REPORT (mirrors PDF structure — text + tables only) ────────────────
router.post("/pptx", async (req: Request, res: Response): Promise<void> => {
  try {
    const requireAuthCheck = requireAuth(req, res);
    if (!requireAuthCheck) return;

    const data = await gatherReportData();
    const pptxCurrency = data.config?.reportingCurrency ?? "SAR";
    const PptxGen = (PptxGenJS as any).default ?? PptxGenJS;
    const pptx = new PptxGen();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "StrategyPMO";
    pptx.title = `Strategy Weekly Report — ${new Date().toISOString().slice(0, 10)}`;

    const P = { navy: "1E3A5F", dark: "0F172A", mid: "475569", light: "94A3B8", bg: "F8FAFC", border: "E2E8F0", green: "16A34A", amber: "D97706", red: "DC2626", white: "FFFFFF", blue: "3B82F6", teal: "059669" };
    const stColor = (s: string) => s === "on_track" || s === "completed" ? P.green : s === "at_risk" ? P.amber : s === "delayed" ? P.red : P.light;
    const stLabel = (s: string) => statusLabel(s).toUpperCase();
    const fmtM = (n: number) => fmtSAR(n, pptxCurrency);
    const fmtD = (d: string | Date | null) => d ? formatDate(typeof d === "string" ? new Date(d) : d) : "—";
    const bar = (s: PptxGenJS.Slide) => s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: P.navy } });
    let slideNum = 0;
    const foot = (s: PptxGenJS.Slide) => { slideNum++; s.addText(`CONFIDENTIAL · StrategyPMO · ${fmtD(new Date())}`, { x: 0.5, y: 7.1, w: 12, h: 0.3, fontSize: 8, color: P.light, align: "center" }); };

    // Precompute
    const budgetPctP = data.budget.totalAllocated > 0 ? Math.round((data.budget.totalSpent / data.budget.totalAllocated) * 100) : 0;
    const projRows = data.projects.map((p) => {
      const ms = data.milestones.filter((m) => m.projectId === p.id);
      const prog = ms.length === 0 ? 0 : Math.round(ms.reduce((s, m) => s + (m.progress ?? 0), 0) / ms.length);
      const cs = computeStatus(prog, p.startDate, p.targetDate, p.budget ?? 0, p.budgetSpent ?? 0, prog);
      return { ...p, progress: prog, cs: cs.status };
    });
    const sOrd: Record<string, number> = { delayed: 0, at_risk: 1, not_started: 2, on_track: 3, completed: 4 };
    projRows.sort((a, b) => (sOrd[a.cs] ?? 5) - (sOrd[b.cs] ?? 5));

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 1: Cover
    // ══════════════════════════════════════════════════════════════════════════
    const s1 = pptx.addSlide(); bar(s1);
    s1.addShape(pptx.ShapeType.rect, { x: 0, y: 3.15, w: "100%", h: 0.02, fill: { color: P.navy } });
    s1.addText(data.config?.programmeName ?? "National Transformation Programme", { x: 1, y: 2.0, w: 11, h: 1.0, fontSize: 32, bold: true, color: P.dark, align: "center" });
    s1.addText("Strategy Weekly Report", { x: 1, y: 3.3, w: 11, h: 0.6, fontSize: 18, color: P.mid, align: "center" });
    s1.addText(fmtD(new Date()), { x: 1, y: 4.1, w: 11, h: 0.4, fontSize: 12, color: P.light, align: "center" });
    s1.addText("CONFIDENTIAL", { x: 1, y: 4.6, w: 11, h: 0.4, fontSize: 10, bold: true, color: P.light, align: "center" });
    foot(s1);

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 2: Programme Overview (metric boxes + DOUGHNUT chart + BAR chart)
    // ══════════════════════════════════════════════════════════════════════════
    const s2 = pptx.addSlide(); bar(s2);
    s2.addText("Programme Overview", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });

    // 4 metric boxes with colored top bar
    const metricData = [
      { value: `${Math.round(data.programme.programmeProgress)}%`, label: "Programme Progress", color: P.navy },
      { value: `${data.projects.length}`, label: `Projects (${data.statusCounts.on_track} on track)`, color: P.green },
      { value: `${budgetPctP}%`, label: `Budget Used`, color: budgetPctP > 80 ? P.red : P.amber },
      { value: `${data.risks.filter((r) => r.status === "open").length}`, label: "Active Risks", color: P.red },
    ];
    metricData.forEach((m, i) => {
      const mx = 0.4 + i * 3.15;
      // Background box
      s2.addShape(pptx.ShapeType.rect, { x: mx, y: 0.8, w: 2.9, h: 1.4, fill: { color: P.bg }, line: { color: P.border, width: 0.5 } });
      // Colored top bar
      s2.addShape(pptx.ShapeType.rect, { x: mx, y: 0.8, w: 2.9, h: 0.06, fill: { color: m.color } });
      // Large number
      s2.addText(m.value, { x: mx, y: 0.95, w: 2.9, h: 0.7, fontSize: 30, bold: true, color: P.dark, align: "center" });
      // Label
      s2.addText(m.label.toUpperCase(), { x: mx, y: 1.65, w: 2.9, h: 0.4, fontSize: 9, color: P.mid, align: "center" });
    });

    // DOUGHNUT CHART: Project status distribution
    s2.addText("Project Status Distribution", { x: 0.5, y: 2.3, w: 5, h: 0.3, fontSize: 11, bold: true, color: P.navy });
    s2.addChart(pptx.ChartType.doughnut, [{
      name: "Status",
      labels: ["On Track", "At Risk", "Delayed", "Completed", "Not Started"],
      values: [data.statusCounts.on_track, data.statusCounts.at_risk, data.statusCounts.delayed, data.statusCounts.completed, data.statusCounts.not_started],
    }], {
      x: 0.5, y: 2.5, w: 5, h: 4,
      showLegend: true, legendPos: "b",
      chartColors: [P.green, P.amber, P.red, P.teal, P.light],
      dataLabelPosition: "outEnd",
      showValue: true,
    });

    // BAR CHART: Pillar progress
    const pillarLabels = data.programme.pillarSummaries.map((ps) => ps.pillar.name);
    const pillarValues = data.programme.pillarSummaries.map((ps) => Math.round(ps.progress));
    const pillarColors = data.programme.pillarSummaries.map((ps) => (ps.pillar.color ?? P.navy).replace("#", ""));
    s2.addText("Pillar Progress", { x: 6, y: 2.3, w: 6.5, h: 0.3, fontSize: 11, bold: true, color: P.navy });
    s2.addChart(pptx.ChartType.bar, [{
      name: "Progress %",
      labels: pillarLabels,
      values: pillarValues,
    }], {
      x: 6, y: 2.5, w: 6.5, h: 4,
      barDir: "bar",
      showValue: true,
      valAxisMaxVal: 100,
      catAxisLabelFontSize: 9,
      chartColors: pillarColors,
    });
    foot(s2);

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 3: Department Overview (table + STACKED BAR chart)
    // ══════════════════════════════════════════════════════════════════════════
    const s3 = pptx.addSlide(); bar(s3);
    s3.addText("Department Overview", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });

    // Department table
    const deptRows: PptxGenJS.TableRow[] = [[
      { text: "Department", options: { bold: true, fontSize: 9, fill: { color: P.navy }, color: P.white } },
      { text: "Projects", options: { bold: true, fontSize: 9, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "On Track", options: { bold: true, fontSize: 9, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "At Risk", options: { bold: true, fontSize: 9, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "Delayed", options: { bold: true, fontSize: 9, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "Avg Progress", options: { bold: true, fontSize: 9, fill: { color: P.navy }, color: P.white, align: "center" } },
    ]];
    const deptNames: string[] = [];
    const deptOnTrack: number[] = [];
    const deptAtRisk: number[] = [];
    const deptDelayed: number[] = [];
    data.departments.forEach((dept, i) => {
      const dp = projRows.filter((p) => (p as any).departmentId === dept.id);
      const rf = i % 2 === 0 ? P.white : P.bg;
      const onTrackCount = dp.filter((p) => p.cs === "on_track" || p.cs === "completed").length;
      const atRiskCount = dp.filter((p) => p.cs === "at_risk").length;
      const delayedCount = dp.filter((p) => p.cs === "delayed").length;
      deptNames.push(dept.name);
      deptOnTrack.push(onTrackCount);
      deptAtRisk.push(atRiskCount);
      deptDelayed.push(delayedCount);
      deptRows.push([
        { text: dept.name, options: { fontSize: 9, fill: { color: rf } } },
        { text: String(dept.projectCount), options: { fontSize: 9, bold: true, align: "center", fill: { color: rf } } },
        { text: String(onTrackCount), options: { fontSize: 9, align: "center", color: P.green, fill: { color: rf } } },
        { text: String(atRiskCount), options: { fontSize: 9, align: "center", color: P.amber, fill: { color: rf } } },
        { text: String(delayedCount), options: { fontSize: 9, align: "center", color: P.red, fill: { color: rf } } },
        { text: `${dept.avgProgress}%`, options: { fontSize: 9, bold: true, align: "center", fill: { color: rf } } },
      ]);
    });
    s3.addTable(deptRows, { x: 0.4, y: 0.8, w: 12.4, colW: [4, 1.2, 1.2, 1.2, 1.2, 1.5], border: { color: P.border, pt: 0.5 } });

    // STACKED BAR CHART: Department health breakdown
    if (deptNames.length > 0) {
      s3.addText("Department Health Distribution", { x: 0.5, y: 3.3, w: 12, h: 0.3, fontSize: 11, bold: true, color: P.navy });
      s3.addChart(pptx.ChartType.bar, [
        { name: "On Track", labels: deptNames, values: deptOnTrack },
        { name: "At Risk", labels: deptNames, values: deptAtRisk },
        { name: "Delayed", labels: deptNames, values: deptDelayed },
      ], {
        x: 0.5, y: 3.5, w: 12, h: 3.5,
        barDir: "bar", barGrouping: "stacked",
        showLegend: true, legendPos: "b",
        chartColors: [P.green, P.amber, P.red],
        catAxisLabelFontSize: 9,
        showValue: true,
      });
    }
    foot(s3);

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 4+: Project Portfolio GROUPED BY DEPARTMENT (mirrors PDF exactly)
    // ══════════════════════════════════════════════════════════════════════════
    {
      const headerOpts = (text: string): PptxGenJS.TableCell => ({ text, options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } });
      const colW = [0.35, 0.6, 2.4, 0.85, 0.55, 0.85, 0.85, 0.85, 1.4, 2.2, 1.8];
      const headers: PptxGenJS.TableRow = [
        headerOpts("#"), headerOpts("Code"), headerOpts("Project"), headerOpts("Status"),
        headerOpts("%"), headerOpts("Start"), headerOpts("End"), headerOpts("Budget"),
        headerOpts("Owner"), headerOpts("Achievements"), headerOpts("Next Steps"),
      ];

      // Group projects by department (same as PDF)
      const pptxDeptGroups = data.departments.map((dept) => {
        const dp = projRows.filter((p) => (p as any).departmentId === dept.id);
        dp.sort((a, b) => (sOrd[a.cs] ?? 5) - (sOrd[b.cs] ?? 5));
        const avg = dp.length === 0 ? 0 : Math.round(dp.reduce((s, p) => s + p.progress, 0) / dp.length);
        return { name: dept.name, projects: dp, avg };
      }).filter((g) => g.projects.length > 0);

      let slidePortfolio = pptx.addSlide(); bar(slidePortfolio);
      slidePortfolio.addText("Project Portfolio", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });
      let rowCount = 0;
      let globalNum = 0;
      const MAX_ROWS_PER_SLIDE = 14;

      for (const group of pptxDeptGroups) {
        // Check if we need a new slide
        if (rowCount + 2 + group.projects.length > MAX_ROWS_PER_SLIDE && rowCount > 0) {
          foot(slidePortfolio);
          slidePortfolio = pptx.addSlide(); bar(slidePortfolio);
          slidePortfolio.addText("Project Portfolio (cont.)", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });
          rowCount = 0;
        }

        // Build table rows for this department
        const tableRows: PptxGenJS.TableRow[] = [];

        // Department header row (navy, full span via merged-like approach)
        const deptHeaderCell: PptxGenJS.TableCell = { text: `${group.name} — ${group.projects.length} projects, avg ${group.avg}%`, options: { bold: true, fontSize: 9, fill: { color: P.navy }, color: P.white, colspan: 11 } };
        tableRows.push([deptHeaderCell]);

        // Column headers
        tableRows.push(headers);

        // Project rows
        group.projects.forEach((p, i) => {
          globalNum++;
          const rf = i % 2 === 0 ? P.white : P.bg;
          const sc = stColor(p.cs);
          const report = data.weeklyReports.get(p.id);
          const achieve = ((report as any)?.keyAchievements || (report as any)?.statusReason || "—").slice(0, 60);
          const next = ((report as any)?.nextSteps || (report as any)?.completionReason || "—").slice(0, 60);

          tableRows.push([
            { text: String(globalNum), options: { fontSize: 8, fill: { color: rf } } },
            { text: (p.projectCode ?? "—").slice(0, 8), options: { fontSize: 8, bold: true, fill: { color: rf } } },
            { text: (p.name ?? "").slice(0, 28), options: { fontSize: 8, fill: { color: rf } } },
            { text: stLabel(p.cs), options: { fontSize: 7, bold: true, color: P.white, fill: { color: sc }, align: "center" } },
            { text: `${p.progress}%`, options: { fontSize: 8, bold: true, fill: { color: rf }, align: "center" } },
            { text: fmtD(p.startDate), options: { fontSize: 7, fill: { color: rf } } },
            { text: fmtD(p.targetDate), options: { fontSize: 7, fill: { color: rf } } },
            { text: fmtM(p.budget ?? 0), options: { fontSize: 7, fill: { color: rf } } },
            { text: (p.ownerName ?? "—").slice(0, 14), options: { fontSize: 8, fill: { color: rf } } },
            { text: achieve, options: { fontSize: 7, fill: { color: rf } } },
            { text: next, options: { fontSize: 7, fill: { color: rf } } },
          ]);
        });

        const tableY = 0.7 + rowCount * 0.28;
        slidePortfolio.addTable(tableRows, {
          x: 0.15, y: tableY, w: 13,
          colW,
          border: { color: P.border, pt: 0.3 },
        });

        rowCount += 2 + group.projects.length;
      }
      foot(slidePortfolio);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 5: Budget & KPIs
    // ══════════════════════════════════════════════════════════════════════════
    const s5 = pptx.addSlide(); bar(s5);
    s5.addText("Budget & KPIs", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });
    s5.addText(`Total Allocated: ${fmtM(data.budget.totalAllocated)}    Spent: ${fmtM(data.budget.totalSpent)}    Utilisation: ${budgetPctP}%`, { x: 0.5, y: 0.7, w: 12, h: 0.4, fontSize: 12, bold: true, color: P.dark });
    // KPI table
    const kpiRows: PptxGenJS.TableRow[] = [[
      { text: "KPI", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
      { text: "Actual", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "Target", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "Status", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
    ]];
    data.kpis.slice(0, 12).forEach((kpi, i) => {
      const rf = i % 2 === 0 ? P.white : P.bg;
      kpiRows.push([
        { text: (kpi.name ?? "").slice(0, 40), options: { fontSize: 8, fill: { color: rf } } },
        { text: String(kpi.actual ?? "—"), options: { fontSize: 8, fill: { color: rf }, align: "center" } },
        { text: String(kpi.target ?? "—"), options: { fontSize: 8, fill: { color: rf }, align: "center" } },
        { text: (kpi.status ?? "—").replace(/_/g, " "), options: { fontSize: 8, bold: true, fill: { color: rf }, color: stColor(kpi.status ?? ""), align: "center" } },
      ]);
    });
    s5.addTable(kpiRows, { x: 0.4, y: 1.2, w: 12.4, colW: [5, 2, 2, 2], border: { color: P.border, pt: 0.5 } });
    foot(s5);

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 6: Risk Summary (table + HEAT MAP)
    // ══════════════════════════════════════════════════════════════════════════
    const s6 = pptx.addSlide(); bar(s6);
    s6.addText("Risk Summary", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });

    // Risk table (left half)
    const riskRows: PptxGenJS.TableRow[] = [[
      { text: "#", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
      { text: "Risk Title", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
      { text: "Project", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
      { text: "Prob", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "Impact", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "Score", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
      { text: "Owner", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
    ]];
    const openRisks = [...data.risks].filter((r) => r.status === "open").sort((a, b) => b.riskScore - a.riskScore);
    openRisks.slice(0, 8).forEach((r, i) => {
      const rf = i % 2 === 0 ? P.white : P.bg;
      const proj = data.projects.find((p) => p.id === r.projectId);
      const sc = r.riskScore >= 12 ? P.red : r.riskScore >= 6 ? P.amber : P.green;
      riskRows.push([
        { text: String(i + 1), options: { fontSize: 8, fill: { color: rf } } },
        { text: (r.title ?? "").slice(0, 30), options: { fontSize: 8, fill: { color: rf } } },
        { text: `${proj?.projectCode ? proj.projectCode + ": " : ""}${(proj?.name ?? "—").slice(0, 18)}`, options: { fontSize: 8, fill: { color: rf } } },
        { text: r.probability ?? "—", options: { fontSize: 8, fill: { color: rf }, align: "center" } },
        { text: r.impact ?? "—", options: { fontSize: 8, fill: { color: rf }, align: "center" } },
        { text: String(r.riskScore), options: { fontSize: 9, bold: true, color: sc, fill: { color: rf }, align: "center" } },
        { text: (r.owner ?? "—").slice(0, 12), options: { fontSize: 8, fill: { color: rf } } },
      ]);
    });
    s6.addTable(riskRows, { x: 0.3, y: 0.75, w: 7.2, colW: [0.3, 2.2, 1.5, 0.7, 0.7, 0.6, 1.2], border: { color: P.border, pt: 0.5 } });

    // HEAT MAP: Probability x Impact (right side)
    s6.addText("Risk Heat Map (Probability \u00D7 Impact)", { x: 8, y: 0.75, w: 5, h: 0.3, fontSize: 11, bold: true, color: P.navy });

    const hmProbLevels = ["critical", "high", "medium", "low"]; // top to bottom
    const hmImpactLevels = ["low", "medium", "high", "critical"]; // left to right
    const hmCellW = 1.0;
    const hmCellH = 0.8;
    const hmGridX = 9.2;
    const hmGridY = 1.2;

    // Y-axis label: "PROBABILITY"
    s6.addText("P\nR\nO\nB\nA\nB\nI\nL\nI\nT\nY", { x: 7.8, y: 1.5, w: 0.4, h: 3.2, fontSize: 7, color: P.mid, align: "center", valign: "middle" });
    // Y-axis row labels
    hmProbLevels.forEach((prob, ri) => {
      const label = prob.charAt(0).toUpperCase() + prob.slice(1);
      s6.addText(label, { x: 8.1, y: hmGridY + ri * hmCellH, w: 1.0, h: hmCellH, fontSize: 8, bold: true, color: P.mid, align: "right", valign: "middle" });
    });
    // X-axis column labels
    hmImpactLevels.forEach((imp, ci) => {
      const label = imp.charAt(0).toUpperCase() + imp.slice(1);
      s6.addText(label, { x: hmGridX + ci * hmCellW, y: hmGridY + hmProbLevels.length * hmCellH + 0.05, w: hmCellW, h: 0.3, fontSize: 8, bold: true, color: P.mid, align: "center" });
    });
    // X-axis label: "IMPACT"
    s6.addText("IMPACT -->", { x: hmGridX, y: hmGridY + hmProbLevels.length * hmCellH + 0.3, w: hmCellW * 4, h: 0.25, fontSize: 8, color: P.mid, align: "center" });

    // Grid cells
    const probScoreMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    hmProbLevels.forEach((prob, ri) => {
      hmImpactLevels.forEach((imp, ci) => {
        const count = data.risks.filter((r) => r.status === "open" && r.probability === prob && r.impact === imp).length;
        const score = probScoreMap[prob] * probScoreMap[imp];
        const cellColor = score >= 12 ? P.red : score >= 6 ? P.amber : P.green;
        const cx = hmGridX + ci * hmCellW;
        const cy = hmGridY + ri * hmCellH;

        // Colored rectangle
        s6.addShape(pptx.ShapeType.rect, {
          x: cx, y: cy, w: hmCellW, h: hmCellH,
          fill: { color: cellColor },
          line: { color: P.white, width: 1.5 },
        });
        // Count text
        s6.addText(String(count), {
          x: cx, y: cy, w: hmCellW, h: hmCellH,
          fontSize: 16, bold: true, color: P.white,
          align: "center", valign: "middle",
        });
      });
    });

    // Heat map legend
    s6.addShape(pptx.ShapeType.rect, { x: 8.2, y: 5.0, w: 0.3, h: 0.3, fill: { color: P.red } });
    s6.addText("Score >= 12 (Critical)", { x: 8.6, y: 5.0, w: 2, h: 0.3, fontSize: 8, color: P.dark });
    s6.addShape(pptx.ShapeType.rect, { x: 10.8, y: 5.0, w: 0.3, h: 0.3, fill: { color: P.amber } });
    s6.addText("Score 6-11 (Medium)", { x: 11.2, y: 5.0, w: 2, h: 0.3, fontSize: 8, color: P.dark });
    s6.addShape(pptx.ShapeType.rect, { x: 8.2, y: 5.35, w: 0.3, h: 0.3, fill: { color: P.green } });
    s6.addText("Score < 6 (Low)", { x: 8.6, y: 5.35, w: 2, h: 0.3, fontSize: 8, color: P.dark });

    foot(s6);

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 7: Weekly Achievements
    // ══════════════════════════════════════════════════════════════════════════
    const s7 = pptx.addSlide(); bar(s7);
    s7.addText("Weekly Achievements", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });
    const achievements: Array<{ code: string; name: string; text: string }> = [];
    for (const [projId, report] of data.weeklyReports) {
      const proj = data.projects.find((p) => p.id === projId);
      const text = (report as any).keyAchievements || (report as any).statusReason || "";
      if (text && proj) achievements.push({ code: proj.projectCode ?? "", name: proj.name, text });
    }
    if (achievements.length > 0) {
      achievements.slice(0, 6).forEach((a, i) => {
        const y = 0.8 + i * 1.0;
        s7.addText(`${a.code} ${a.name}`.trim(), { x: 0.5, y, w: 12, h: 0.3, fontSize: 11, bold: true, color: P.dark });
        s7.addText(a.text.slice(0, 200), { x: 0.7, y: y + 0.3, w: 11.5, h: 0.5, fontSize: 10, color: P.mid });
      });
    } else {
      s7.addText("No weekly achievements reported this period.", { x: 0.5, y: 2.5, w: 12, h: 1, fontSize: 14, color: P.light, align: "center" });
    }
    foot(s7);

    // ══════════════════════════════════════════════════════════════════════════
    // SLIDE 8: Escalations
    // ══════════════════════════════════════════════════════════════════════════
    const s8 = pptx.addSlide(); bar(s8);
    s8.addText("Escalations & Critical Issues", { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 22, bold: true, color: P.navy });
    const critRisksP = openRisks.filter((r) => r.riskScore >= 12);
    if (critRisksP.length > 0) {
      critRisksP.slice(0, 8).forEach((r, i) => {
        const proj = data.projects.find((p) => p.id === r.projectId);
        s8.addText(`${i + 1}. ${r.title}`, { x: 0.5, y: 0.8 + i * 0.7, w: 12, h: 0.3, fontSize: 11, bold: true, color: P.red });
        const pLabel = proj ? `${proj.projectCode ? proj.projectCode + ": " : ""}${proj.name}` : "—";
        s8.addText(`Score: ${r.riskScore} · ${r.probability}/${r.impact} · Project: ${pLabel} · Owner: ${r.owner ?? "—"}`, { x: 0.7, y: 1.1 + i * 0.7, w: 11.5, h: 0.25, fontSize: 9, color: P.mid });
      });
    } else {
      s8.addText("No critical escalations. All risks within acceptable thresholds.", { x: 0.5, y: 2.5, w: 12, h: 1, fontSize: 14, color: P.green, align: "center" });
    }
    foot(s8);

    // ══════════════════════════════════════════════════════════════════════════
    // Appendix: Per-department detail slides
    // ══════════════════════════════════════════════════════════════════════════
    for (const dept of data.departments) {
      const deptProjs = projRows.filter((p) => (p as any).departmentId === dept.id);
      if (deptProjs.length === 0) continue;
      const sd = pptx.addSlide(); bar(sd);
      sd.addText(`Appendix: ${dept.name}`, { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 18, bold: true, color: P.navy });
      sd.addText(`${dept.projectCount} projects · Average progress ${dept.avgProgress}%`, { x: 0.5, y: 0.6, w: 12, h: 0.3, fontSize: 10, color: P.mid });
      const appRows: PptxGenJS.TableRow[] = [[
        { text: "#", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
        { text: "Code", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
        { text: "Project", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
        { text: "Status", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
        { text: "Progress", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white, align: "center" } },
        { text: "Budget", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
        { text: "Owner", options: { bold: true, fontSize: 8, fill: { color: P.navy }, color: P.white } },
      ]];
      deptProjs.slice(0, 16).forEach((p, i) => {
        const rf = i % 2 === 0 ? P.white : P.bg;
        const sc = stColor(p.cs);
        appRows.push([
          { text: String(i + 1), options: { fontSize: 8, fill: { color: rf } } },
          { text: p.projectCode ?? "—", options: { fontSize: 8, fill: { color: rf } } },
          { text: (p.name ?? "").slice(0, 30), options: { fontSize: 8, fill: { color: rf } } },
          { text: stLabel(p.cs), options: { fontSize: 8, bold: true, color: P.white, fill: { color: sc }, align: "center" } },
          { text: `${p.progress}%`, options: { fontSize: 8, bold: true, fill: { color: rf }, align: "center" } },
          { text: fmtM(p.budget ?? 0), options: { fontSize: 8, fill: { color: rf } } },
          { text: (p.ownerName ?? "—").slice(0, 15), options: { fontSize: 8, fill: { color: rf } } },
        ]);
      });
      sd.addTable(appRows, { x: 0.3, y: 1.0, w: 12.7, colW: [0.4, 0.8, 3.5, 1.2, 1.0, 1.5, 2.0], border: { color: P.border, pt: 0.5 } });
      foot(sd);
    }

    // ── Generate and send ──
    const pptxBuffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="Strategy-Weekly-Report-${new Date().toISOString().slice(0, 10)}.pptx"`);
    res.send(pptxBuffer);
  } catch (err) {
    req.log?.error?.({ err }, "PPTX generation error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PPTX report", detail: String(err), stack: (err as Error)?.stack?.slice(0, 500) });
    }
  }
});

export default router;
