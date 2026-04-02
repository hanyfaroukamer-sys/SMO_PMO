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
  accent: "#2563EB",
  dark: "#0F172A",
  secondary: "#475569",
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
  accent: "2563EB",
  dark: "0F172A",
  grey: "475569",
  light: "F8FAFC",
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

function fmtSAR(v: number): string {
  if (v >= 1_000_000_000) return `SAR ${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `SAR ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `SAR ${(v / 1_000).toFixed(0)}K`;
  return `SAR ${v.toFixed(0)}`;
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
    milestones: allMilestones,
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
  doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(label.toUpperCase(), x + 10, y + 48, { width: w - 20, align: "center" });
}

// ─── PDF REPORT (McKinsey/BCG Executive Style) ─────────────────────────────
router.post("/pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const requireAuthCheck = requireAuth(req, res);
    if (!requireAuthCheck) return;

    const data = await gatherReportData();

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Programme-Report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    doc.pipe(res);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 40;
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
      .text("Executive Report", M, H * 0.30 + 50, { align: "center", width: CW });
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
      .text("Programme Overview", MARGIN, 20);

    // Summary cards
    const cardW = 168;
    const cardH = 72;
    const cardY = 52;
    const totalInitiatives = data.programme.pillarSummaries.reduce((s, p) => s + p.initiativeCount, 0);
    const onTrackInitiatives = data.initiatives.filter((i) => i.status === "on_track").length;
    const budgetPct =
      data.budget.totalAllocated > 0
        ? Math.round((data.budget.totalSpent / data.budget.totalAllocated) * 100)
        : 0;

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
      const x = MARGIN + i * (cardW + 12);
      doc.save().roundedRect(x, cardY, cardW, cardH, 6).fill(C.bg).stroke(C.border).restore();
      doc.save().rect(x, cardY, 4, cardH).fill(c.color).restore();
      doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(c.label, x + 12, cardY + 10, { width: cardW - 18 });
      doc.font("Helvetica-Bold").fontSize(24).fillColor(C.dark).text(c.value, x + 12, cardY + 24, { width: cardW - 18 });
      if (c.sub) {
        doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(c.sub, x + 12, cardY + 52, { width: cardW - 18 });
      }
    });

    // Project status distribution (text-based legend)
    const statY = cardY + cardH + 16;
    const leftW = (W - MARGIN * 2) * 0.45;

    doc
      .save()
      .roundedRect(MARGIN, statY, leftW, 170, 6)
      .fill(C.bg)
      .stroke(C.border)
      .restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(C.dark)
      .text("Project Status Distribution", MARGIN + 12, statY + 10);

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
      doc.save().roundedRect(MARGIN + 12, ry + 3, 10, 10, 2).fill(si.color).restore();
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(`${si.label}`, MARGIN + 28, ry, { width: 90 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(`${cnt}`, MARGIN + 125, ry, { width: 30, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text(`(${pct}%)`, MARGIN + 162, ry, { width: 40 });
    });

    // Pillar progress bars
    const pillarX = MARGIN + leftW + 16;
    const pillarW = W - MARGIN - pillarX;
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

    // ── PAGE 3: Initiative Performance ────────────────────────────────────────
    doc.addPage();
    pdfAccentBar(doc);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(C.dark).text("Initiative Performance", MARGIN, 20);

    const cols3 = [MARGIN, MARGIN + 220, MARGIN + 370, MARGIN + 440, MARGIN + 510, MARGIN + 580];
    const headers3 = ["Initiative", "Pillar", "Progress %", "SPI", "Status", "Budget (M)"];
    const tableTop3 = 52;

    doc.save().rect(MARGIN, tableTop3, W - MARGIN * 2, 20).fill("#F1F5F9").restore();
    headers3.forEach((h, i) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.secondary).text(h, cols3[i] + 4, tableTop3 + 6, { width: 95 });
    });

    let rowY3 = tableTop3 + 22;
    data.initiatives.forEach((init, idx) => {
      if (rowY3 > doc.page.height - 60) {
        doc.addPage();
        pdfAccentBar(doc);
        rowY3 = 30;
      }
      const bg = idx % 2 === 0 ? C.white : C.bg;
      doc.save().rect(MARGIN, rowY3, W - MARGIN * 2, 20).fill(bg).restore();
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(init.name.slice(0, 28), cols3[0] + 4, rowY3 + 6, { width: 210, ellipsis: true });
      doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(init.pillarName.slice(0, 20), cols3[1] + 4, rowY3 + 6, { width: 140 });
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(`${init.progress}%`, cols3[2] + 4, rowY3 + 6, { width: 60 });
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(String(init.spi.toFixed(2)), cols3[3] + 4, rowY3 + 6, { width: 50 });

      const sc = statusColor(init.status);
      doc.save().roundedRect(cols3[4] + 4, rowY3 + 4, 52, 13, 3).fill(sc).restore();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.white).text(statusLabel(init.status).slice(0, 9), cols3[4] + 7, rowY3 + 7, { width: 48 });

      const bm = (init.budget / 1_000_000).toFixed(1);
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(bm, cols3[5] + 4, rowY3 + 6, { width: 60 });
      rowY3 += 20;
    });

    // Narrative for delayed
    const delayed = data.initiatives.filter((i) => i.status === "delayed");
    if (delayed.length > 0 && rowY3 < doc.page.height - 80) {
      rowY3 += 12;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.red).text("Delayed Initiatives:", MARGIN, rowY3);
      rowY3 += 14;
      delayed.forEach((d) => {
        doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(`• ${d.name} — SPI ${d.spi.toFixed(2)}: ${d.reason}`, MARGIN + 8, rowY3, { width: W - MARGIN * 2 - 8 });
        rowY3 += 14;
      });
    }

    // ── PAGE 4: Budget & KPIs ─────────────────────────────────────────────────
    doc.addPage();
    pdfAccentBar(doc);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(C.dark).text("Budget Health & Strategic KPIs", MARGIN, 20);

    const leftW4 = (W - MARGIN * 2) * 0.52;
    const rightX4 = MARGIN + leftW4 + 16;
    const rightW4 = W - rightX4 - MARGIN;
    const panelTop4 = 50;

    // Budget panel
    doc.save().roundedRect(MARGIN, panelTop4, leftW4, 200, 6).fill(C.bg).stroke(C.border).restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.dark).text("Budget by Pillar", MARGIN + 12, panelTop4 + 10);

    const barAreaW = leftW4 - 100;
    const pillarBudgets = data.programme.pillarSummaries.map((ps) => {
      const inits = data.initiatives.filter((i) => i.pillarName === ps.pillar.name);
      const allocated = inits.reduce((s, i) => s + i.budget, 0);
      const pillarProjects = data.projects.filter((p) => inits.some((i) => i.id === p.initiativeId));
      const spent = pillarProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
      return { name: ps.pillar.name, allocated, spent, color: ps.pillar.color ?? C.primary };
    });
    const maxPillarBudget = Math.max(...pillarBudgets.map((p) => p.allocated), 1);

    pillarBudgets.forEach((pb, idx) => {
      const by = panelTop4 + 32 + idx * 32;
      doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(pb.name.slice(0, 18), MARGIN + 12, by, { width: 90, ellipsis: true });
      const bw = barAreaW - 20;
      const allocW = (pb.allocated / maxPillarBudget) * bw;
      const spentW = pb.allocated > 0 ? (pb.spent / pb.allocated) * allocW : 0;
      doc.save().roundedRect(MARGIN + 105, by + 12, bw, 10, 3).fill("#BFDBFE").restore();
      doc.save().roundedRect(MARGIN + 105, by + 12, Math.max(spentW, 2), 10, 3).fill(pb.color).restore();
      const allocM = (pb.allocated / 1_000_000).toFixed(0);
      const spentM = (pb.spent / 1_000_000).toFixed(0);
      doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text(`${spentM}M / ${allocM}M`, MARGIN + 105 + bw + 4, by + 11, { width: 65 });
    });

    // Budget totals
    const totalY4 = panelTop4 + 32 + pillarBudgets.length * 32 + 8;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark).text(
      `Total Allocated: ${(data.budget.totalAllocated / 1_000_000).toFixed(1)}M   |   Spent: ${(data.budget.totalSpent / 1_000_000).toFixed(1)}M   |   Utilisation: ${Math.round((data.budget.totalSpent / Math.max(data.budget.totalAllocated, 1)) * 100)}%`,
      MARGIN + 12, Math.min(totalY4, panelTop4 + 185), { width: leftW4 - 24 }
    );

    // KPI panel
    doc.save().roundedRect(rightX4, panelTop4, rightW4, 200, 6).fill(C.bg).stroke(C.border).restore();
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
      doc.font("Helvetica").fontSize(7.5).fillColor(C.dark).text((kpi.name ?? "").slice(0, 22), kpiCols[0] + 2, kpiY4 + 5, { width: 110, ellipsis: true });
      doc.font("Helvetica").fontSize(7.5).fillColor(C.dark).text(String(kpi.actual ?? "—"), kpiCols[1] + 2, kpiY4 + 5, { width: 45 });
      doc.font("Helvetica").fontSize(7.5).fillColor(C.dark).text(String(kpi.target ?? "—"), kpiCols[2] + 2, kpiY4 + 5, { width: 45 });
      const sc = kpiStatusColor(kpi.status ?? "");
      doc.save().roundedRect(kpiCols[3] + 2, kpiY4 + 3, 45, 12, 3).fill(sc).restore();
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.white).text((kpi.status ?? "").replace("_", " ").slice(0, 9), kpiCols[3] + 5, kpiY4 + 6, { width: 42 });
      kpiY4 += 18;
    });

    // ── PAGE 5: Risks & AI Assessment ────────────────────────────────────────
    doc.addPage();
    pdfAccentBar(doc);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(C.dark).text("Risk Summary & AI Assessment", MARGIN, 20);

    const leftW5 = (W - MARGIN * 2) * 0.48;
    const rightX5 = MARGIN + leftW5 + 16;
    const rightW5 = W - rightX5 - MARGIN;
    const panelTop5 = 50;

    // Risks panel
    doc.save().roundedRect(MARGIN, panelTop5, leftW5, 200, 6).fill(C.bg).stroke(C.border).restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.dark).text("Top Risks by Score", MARGIN + 12, panelTop5 + 10);

    let riskY = panelTop5 + 30;
    data.topRisks.forEach((risk, idx) => {
      const score = sevNum(risk.impact) * sevNum(risk.probability);
      const sc5 = sevColor(risk.impact);
      doc.save().roundedRect(MARGIN + 12, riskY, 8, 8, 2).fill(sc5).restore();
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.dark).text(`${idx + 1}. ${risk.title}`, MARGIN + 26, riskY, { width: leftW5 - 40 });
      riskY += 14;
      doc.font("Helvetica").fontSize(7.5).fillColor(C.secondary).text(
        `Score: ${score} | ${(risk.impact ?? "—").toUpperCase()} | ${risk.status ?? "open"}`,
        MARGIN + 26, riskY, { width: leftW5 - 40 }
      );
      riskY += 13;
      if (risk.description) {
        doc.font("Helvetica").fontSize(7.5).fillColor(C.secondary).text(risk.description, MARGIN + 26, riskY, { width: leftW5 - 40, ellipsis: true });
        riskY += 13;
      }
      riskY += 4;
    });

    // AI Assessment panel
    doc.save().roundedRect(rightX5, panelTop5, rightW5, 200, 6).fill(C.bg).stroke(C.border).restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.dark).text("AI Programme Assessment", rightX5 + 12, panelTop5 + 10);

    if (data.aiAssessment) {
      const healthColor = data.aiAssessment.overallHealth === "excellent" || data.aiAssessment.overallHealth === "good"
        ? C.green : data.aiAssessment.overallHealth === "at_risk" || data.aiAssessment.overallHealth === "critical"
          ? C.red : C.amber;

      doc.save().roundedRect(rightX5 + 12, panelTop5 + 30, rightW5 - 24, 18, 4).fill(healthColor).restore();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.white).text(
        `Overall: ${data.aiAssessment.overallHealth.replace("_", " ").toUpperCase()}`,
        rightX5 + 16, panelTop5 + 35, { width: rightW5 - 32 }
      );

      doc.font("Helvetica").fontSize(8.5).fillColor(C.dark).text(
        data.aiAssessment.summary, rightX5 + 12, panelTop5 + 56, { width: rightW5 - 24 }
      );

      let aiY = panelTop5 + 56 + 40;
      if (data.aiAssessment.recommendations?.length > 0) {
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.primary).text("Key Recommendations:", rightX5 + 12, aiY);
        aiY += 14;
        data.aiAssessment.recommendations.slice(0, 3).forEach((r) => {
          doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(`• ${r}`, rightX5 + 12, aiY, { width: rightW5 - 24, ellipsis: true });
          aiY += 13;
        });
      }

      if (data.aiAssessment.riskFlags?.length > 0) {
        aiY += 4;
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.red).text("Risk Flags:", rightX5 + 12, aiY);
        aiY += 14;
        data.aiAssessment.riskFlags.slice(0, 3).forEach((r) => {
          doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(`• ${r}`, rightX5 + 12, aiY, { width: rightW5 - 24, ellipsis: true });
          aiY += 13;
        });
      }
    } else {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(C.secondary)
        .text(
          "Run AI Assessment from the dashboard to include AI-powered analysis in this report.",
          rightX5 + 12, panelTop5 + 40, { width: rightW5 - 24 }
        );
    }

    // ── PAGE: Department Overview ──
    if (data.departments.length > 0) {
      doc.addPage();
      pdfAccentBar(doc);
      doc.font("Helvetica-Bold").fontSize(18).fillColor(C.dark).text("Department Progress Overview", 40, 50);
      doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text("Programme delivery by department", 40, 72);

      let deptY = 95;
      for (const dept of data.departments.slice(0, 12)) {
        const deptStatus = dept.onTrack === dept.projectCount ? "on_track" : dept.onTrack >= dept.projectCount * 0.7 ? "at_risk" : "delayed";
        doc.rect(40, deptY, 5, 18).fill(statusColor(deptStatus));
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark).text(dept.name, 52, deptY + 3, { width: 180 });
        doc.font("Helvetica").fontSize(10).fillColor(C.secondary)
          .text(`${dept.projectCount} projects · Avg ${dept.avgProgress}% · ${dept.onTrack}/${dept.projectCount} on track`, 240, deptY + 4, { width: 280 });
        pdfHorizBar(doc, 530, deptY + 6, dept.avgProgress, 8);
        deptY += 24;
        if (deptY > 730) break;
      }
    }

    // ── PAGE: Support Required ──
    doc.addPage();
    pdfAccentBar(doc);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(C.dark).text("Support Required & Escalations", 40, 50);

    const critRisks = data.risks.filter((r) => r.status === "open" && r.riskScore >= 12);
    if (critRisks.length > 0) {
      let supY = 85;
      doc.font("Helvetica").fontSize(9).fillColor(C.secondary).text("Items requiring executive decision or intervention:", 40, supY);
      supY += 20;
      critRisks.slice(0, 8).forEach((r, i) => {
        doc.rect(40, supY, 530, 35).fill(i % 2 === 0 ? "#FFFFFF" : C.bg);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.red).text(`${i + 1}.`, 45, supY + 4, { width: 20 });
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark).text(r.title, 62, supY + 4, { width: 300 });
        doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(`Score: ${r.riskScore} · ${r.probability}/${r.impact} · Owner: ${r.owner ?? "—"}`, 62, supY + 18, { width: 500 });
        supY += 38;
      });
    } else {
      doc.font("Helvetica").fontSize(11).fillColor(C.green).text("No critical escalations this week.", 40, 100);
    }

    // ── APPENDIX: Per-department project details ──
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
        const fmtBudget = (n: number) => n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M` : `SAR ${n.toLocaleString()}`;

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

    // ── DETAIL PAGES: At-Risk and Delayed Projects (full page each) ──
    const flaggedProjects = projectRows.filter((p: any) => p.computedStatus === "delayed" || p.computedStatus === "at_risk");
    for (const p of flaggedProjects.slice(0, 10)) {
      doc.addPage();
      pdfAccentBar(doc);

      const ms = data.milestones.filter((m) => m.projectId === p.id);
      const report = data.weeklyReports.get(p.id);
      const projRisks = data.risks.filter((r) => r.projectId === p.id && r.status === "open").sort((a, b) => b.riskScore - a.riskScore);
      const fmtBudget = (n: number) => n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M` : `SAR ${n.toLocaleString()}`;
      const spentPct = (p.budget ?? 0) > 0 ? Math.round(((p.budgetSpent ?? 0) / (p.budget ?? 0)) * 100) : 0;

      // Title + status badge
      doc.font("Helvetica-Bold").fontSize(18).fillColor(C.dark).text(`${p.projectCode ?? ""}: ${p.name}`.trim(), 40, 24, { width: W - 200 });
      const badgeColor = (p as any).computedStatus === "delayed" ? C.red : C.amber;
      const badgeLabel = (p as any).computedStatus === "delayed" ? "DELAYED" : "AT RISK";
      doc.rect(W - 160, 24, 120, 24).fill(badgeColor);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C.white).text(badgeLabel, W - 160, 30, { width: 120, align: "center" });

      // Summary metrics row
      const metY = 58;
      doc.rect(40, metY, W - 80, 36).fill(C.bg);
      doc.font("Helvetica-Bold").fontSize(12).fillColor(C.dark).text(`Progress: ${(p as any).progress}%`, 52, metY + 10);
      doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(`Budget: ${fmtBudget(p.budget ?? 0)} (${spentPct}% spent)`, 220, metY + 10);
      doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(`Owner: ${p.ownerName ?? "—"}`, 460, metY + 10);
      doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(`Target: ${p.targetDate ? formatDate(new Date(p.targetDate)) : "—"}`, 620, metY + 10);

      let detY = metY + 48;

      // Achievements
      doc.font("Helvetica-Bold").fontSize(12).fillColor(C.navy).text("Key Achievements", 40, detY);
      doc.save().moveTo(40, detY + 16).lineTo(W - 40, detY + 16).lineWidth(0.5).strokeColor(C.border).stroke().restore();
      detY += 22;
      if (report) {
        const achievements = (report as any).keyAchievements || (report as any).statusReason || (report as any).notes || "No details provided.";
        doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(achievements, 40, detY, { width: W - 80, lineGap: 4 });
        detY += doc.heightOfString(achievements, { width: W - 80, lineGap: 4 }) + 16;
      } else {
        doc.font("Helvetica").fontSize(11).fillColor(C.light).text("No weekly report submitted this period. PM to provide update.", 40, detY, { width: W - 80 });
        detY += 28;
      }

      // Next Steps
      doc.font("Helvetica-Bold").fontSize(12).fillColor(C.navy).text("Next Steps", 40, detY);
      doc.save().moveTo(40, detY + 16).lineTo(W - 40, detY + 16).lineWidth(0.5).strokeColor(C.border).stroke().restore();
      detY += 22;
      if (report) {
        const nextSteps = (report as any).nextSteps || (report as any).completionReason || "No next steps provided.";
        doc.font("Helvetica").fontSize(11).fillColor(C.dark).text(nextSteps, 40, detY, { width: W - 80, lineGap: 4 });
        detY += doc.heightOfString(nextSteps, { width: W - 80, lineGap: 4 }) + 16;
      } else {
        doc.font("Helvetica").fontSize(11).fillColor(C.light).text("Pending PM submission.", 40, detY);
        detY += 28;
      }

      // Milestones table
      if (ms.length > 0 && detY < doc.page.height - 160) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(C.navy).text("Milestones", 40, detY);
        doc.save().moveTo(40, detY + 16).lineTo(W - 40, detY + 16).lineWidth(0.5).strokeColor(C.border).stroke().restore();
        detY += 22;
        // Table header
        doc.rect(40, detY, W - 80, 20).fill(C.navy);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.white);
        doc.text("Milestone", 48, detY + 5, { width: 280 });
        doc.text("Due Date", 340, detY + 5, { width: 80 });
        doc.text("Progress", 430, detY + 5, { width: 60, align: "right" });
        doc.text("Status", 510, detY + 5, { width: 80 });
        detY += 22;
        ms.slice(0, 8).forEach((m, idx) => {
          if (detY > doc.page.height - 60) return;
          doc.rect(40, detY, W - 80, 20).fill(idx % 2 === 0 ? C.white : C.bg);
          doc.font("Helvetica").fontSize(10).fillColor(C.dark).text(m.name.slice(0, 40), 48, detY + 4, { width: 280 });
          doc.text(m.dueDate ? formatDate(new Date(m.dueDate)) : "—", 340, detY + 4, { width: 80 });
          doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(`${m.progress ?? 0}%`, 430, detY + 4, { width: 60, align: "right" });
          doc.font("Helvetica").fontSize(9).fillColor(statusColor(m.status)).text(statusLabel(m.status), 510, detY + 5, { width: 80 });
          detY += 22;
        });
        detY += 8;
      }

      // Risks for this project
      if (projRisks.length > 0 && detY < doc.page.height - 80) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(C.navy).text("Active Risks", 40, detY);
        doc.save().moveTo(40, detY + 16).lineTo(W - 40, detY + 16).lineWidth(0.5).strokeColor(C.border).stroke().restore();
        detY += 22;
        projRisks.slice(0, 5).forEach((r, idx) => {
          doc.rect(40, detY, 5, 16).fill(r.riskScore >= 12 ? C.red : r.riskScore >= 6 ? C.amber : C.green);
          doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark).text(r.title, 52, detY + 2, { width: 350 });
          doc.font("Helvetica").fontSize(10).fillColor(C.secondary).text(`Score: ${r.riskScore} · ${r.probability}/${r.impact} · Owner: ${r.owner ?? "—"}`, 410, detY + 2, { width: 300 });
          detY += 20;
        });
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
    console.error("PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  }
});

// ─── PPTX REPORT ─────────────────────────────────────────────────────────────
router.post("/pptx", async (req: Request, res: Response): Promise<void> => {
  try {
    const requireAuthCheck = requireAuth(req, res);
    if (!requireAuthCheck) return;

    const data = await gatherReportData();

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "StrategyPMO";
    pptx.title = `Programme Report — ${new Date().toISOString().slice(0, 10)}`;

    function addSlideBar(slide: PptxGenJS.Slide) {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.07, fill: { color: PC.primary } });
    }

    function addFooter(slide: PptxGenJS.Slide, pageNum: number, total: number) {
      slide.addText(`StrategyPMO · ${formatDate(new Date())} · Page ${pageNum} of ${total} · CONFIDENTIAL`, {
        x: 0.5, y: 7.0, w: 12.3, h: 0.3,
        fontSize: 7, color: PC.grey, align: "center",
      });
    }

    const totalSlides = 5;

    // ── SLIDE 1: Cover ────────────────────────────────────────────────────────
    const s1 = pptx.addSlide();
    addSlideBar(s1);
    s1.addText("PROGRAMME\nEXECUTIVE SUMMARY", {
      x: 1.5, y: 1.3, w: 10, h: 2,
      fontSize: 36, bold: true, color: PC.dark, align: "center",
    });
    s1.addText(data.config?.programmeName ?? "National Transformation Programme", {
      x: 1.5, y: 3.4, w: 10, h: 0.7,
      fontSize: 18, color: PC.grey, align: "center",
    });
    s1.addText(`Report Date: ${formatDate(new Date())}`, {
      x: 1.5, y: 4.3, w: 10, h: 0.5,
      fontSize: 12, color: "94A3B8", align: "center",
    });
    s1.addText("CONFIDENTIAL", {
      x: 1.5, y: 4.9, w: 10, h: 0.4,
      fontSize: 11, bold: true, color: "94A3B8", align: "center",
    });
    if (data.config?.vision) {
      s1.addText(`VISION: ${data.config.vision}`, {
        x: 1.5, y: 5.5, w: 10, h: 0.6, fontSize: 9, color: PC.grey, align: "center",
      });
    }
    addFooter(s1, 1, totalSlides);

    // ── SLIDE 2: Programme Overview ───────────────────────────────────────────
    const s2 = pptx.addSlide();
    addSlideBar(s2);
    s2.addText("Programme Overview", { x: 0.5, y: 0.15, w: 12, h: 0.6, fontSize: 22, bold: true, color: PC.dark });

    const totalInitiatives2 = data.programme.pillarSummaries.reduce((s, p) => s + p.initiativeCount, 0);
    const onTrackInit2 = data.initiatives.filter((i) => i.status === "on_track").length;
    const budgetPct2 = data.budget.totalAllocated > 0
      ? Math.round((data.budget.totalSpent / data.budget.totalAllocated) * 100) : 0;

    const cardData = [
      { label: "Strategy\nProgress", value: `${Math.round(data.programme.programmeProgress)}%`, color: PC.primary },
      { label: "Initiatives", value: `${totalInitiatives2}`, sub: `${onTrackInit2} on track`, color: PC.green },
      { label: "Projects", value: `${data.projects.length}`, sub: `${data.statusCounts.on_track} on track`, color: "059669" },
      {
        label: "Budget\nUsed",
        value: `${budgetPct2}%`,
        sub: `${(data.budget.totalSpent / 1_000_000).toFixed(0)}M / ${(data.budget.totalAllocated / 1_000_000).toFixed(0)}M`,
        color: budgetPct2 > 80 ? PC.red : PC.amber,
      },
    ];

    cardData.forEach((c, i) => {
      const x = 0.4 + i * 3.15;
      s2.addShape(pptx.ShapeType.roundRect, { x, y: 0.95, w: 2.95, h: 1.3, fill: { color: PC.light }, line: { color: PC.border, width: 0.5 }, rectRadius: 0.08 });
      s2.addShape(pptx.ShapeType.rect, { x, y: 0.95, w: 0.06, h: 1.3, fill: { color: c.color } });
      s2.addText(c.label, { x: x + 0.15, y: 1.0, w: 2.6, h: 0.35, fontSize: 8, color: PC.grey });
      s2.addText(c.value, { x: x + 0.15, y: 1.28, w: 2.6, h: 0.55, fontSize: 28, bold: true, color: PC.dark });
      if (c.sub) s2.addText(c.sub, { x: x + 0.15, y: 1.88, w: 2.6, h: 0.25, fontSize: 8, color: PC.grey });
    });

    // Status distribution chart (native pptxgenjs chart)
    const pieLabels = ["On Track", "At Risk", "Delayed", "Completed", "Not Started"];
    const pieVals = [
      data.statusCounts.on_track,
      data.statusCounts.at_risk,
      data.statusCounts.delayed,
      data.statusCounts.completed,
      data.statusCounts.not_started,
    ];
    s2.addChart(pptx.ChartType.pie, [{ name: "Projects", labels: pieLabels, values: pieVals }], {
      x: 0.4, y: 2.45, w: 5.8, h: 4.3,
      showTitle: true, title: "Project Status Distribution",
      showLegend: true, legendPos: "r",
      dataLabelFormatCode: "0%",
      chartColors: ["86EFAC", "FCD34D", "FCA5A5", "16A34A", "D1D5DB"],
    });

    // Pillar progress chart
    const pillarLabels = data.programme.pillarSummaries.map((p) => p.pillar.name);
    const pillarValues = data.programme.pillarSummaries.map((p) => Math.round(p.progress));
    s2.addChart(pptx.ChartType.bar, [{ name: "Progress %", labels: pillarLabels, values: pillarValues }], {
      x: 6.4, y: 2.45, w: 6.4, h: 4.3,
      showTitle: true, title: "Pillar Progress (%)",
      barDir: "bar",
      catAxisLabelFontSize: 9,
      valAxisMaxVal: 100,
      showLegend: false,
      chartColors: data.programme.pillarSummaries.map((p) => (p.pillar.color ?? C.primary).replace("#", "")),
    });

    addFooter(s2, 2, totalSlides);

    // ── SLIDE 3: Initiative Performance ───────────────────────────────────────
    const s3 = pptx.addSlide();
    addSlideBar(s3);
    s3.addText("Initiative Performance", { x: 0.5, y: 0.15, w: 12, h: 0.6, fontSize: 22, bold: true, color: PC.dark });

    const tableRows: PptxGenJS.TableRow[] = [
      [
        { text: "Initiative", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "Pillar", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "Progress %", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "SPI", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "Status", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "Budget (M)", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
      ],
    ];

    data.initiatives.forEach((init, idx) => {
      const rowFill = idx % 2 === 0 ? PC.white : PC.light;
      const sc = statusPtxColor(init.status);
      tableRows.push([
        { text: init.name, options: { fontSize: 8, color: PC.dark, fill: { color: rowFill } } },
        { text: init.pillarName, options: { fontSize: 8, color: PC.grey, fill: { color: rowFill } } },
        { text: `${init.progress}%`, options: { fontSize: 8, color: PC.dark, fill: { color: rowFill } } },
        { text: init.spi.toFixed(2), options: { fontSize: 8, color: PC.dark, fill: { color: rowFill } } },
        { text: statusLabel(init.status), options: { fontSize: 8, bold: true, color: PC.white, fill: { color: sc } } },
        { text: `${(init.budget / 1_000_000).toFixed(1)}`, options: { fontSize: 8, color: PC.dark, fill: { color: rowFill } } },
      ]);
    });

    s3.addTable(tableRows, {
      x: 0.4, y: 0.95, w: 12.5,
      border: { type: "solid", pt: 0.5, color: PC.border },
      colW: [3.8, 2.3, 1.5, 1.0, 1.5, 1.5],
      margin: [3, 5, 3, 5],
    });

    const delayed = data.initiatives.filter((i) => i.status === "delayed");
    if (delayed.length > 0) {
      const delayedText = `Delayed: ${delayed.map((d) => `${d.name} (SPI ${d.spi.toFixed(2)})`).join(", ")}`;
      s3.addText(delayedText, {
        x: 0.4, y: 6.3, w: 12.5, h: 0.5,
        fontSize: 8, color: PC.red, italic: true,
      });
    }

    addFooter(s3, 3, totalSlides);

    // ── SLIDE 4: Budget & KPIs ────────────────────────────────────────────────
    const s4 = pptx.addSlide();
    addSlideBar(s4);
    s4.addText("Budget Health & Strategic KPIs", { x: 0.5, y: 0.15, w: 12, h: 0.6, fontSize: 22, bold: true, color: PC.dark });

    // Budget chart — stacked bar (allocated vs spent per pillar)
    const pillarBudgets2 = data.programme.pillarSummaries.map((ps) => {
      const inits = data.initiatives.filter((i) => i.pillarName === ps.pillar.name);
      const allocated = inits.reduce((s, i) => s + i.budget, 0);
      const pillarProjects2 = data.projects.filter((p) => inits.some((i) => i.id === p.initiativeId));
      const spent = pillarProjects2.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
      return { name: ps.pillar.name, allocated, spent };
    });

    s4.addChart(
      pptx.ChartType.bar,
      [
        { name: "Allocated (M)", labels: pillarBudgets2.map((p) => p.name), values: pillarBudgets2.map((p) => Math.round(p.allocated / 1_000_000)) },
        { name: "Spent (M)", labels: pillarBudgets2.map((p) => p.name), values: pillarBudgets2.map((p) => Math.round(p.spent / 1_000_000)) },
      ],
      {
        x: 0.4, y: 0.9, w: 7.0, h: 5.8,
        showTitle: true, title: "Budget by Pillar (M SAR)",
        barDir: "bar",
        barGrouping: "stacked",
        showLegend: true, legendPos: "t",
        catAxisLabelFontSize: 8,
        chartColors: ["BFDBFE", "2563EB"],
      },
    );

    // KPI table on right
    const kpiRows: PptxGenJS.TableRow[] = [
      [
        { text: "KPI Name", options: { bold: true, fontSize: 7.5, color: PC.white, fill: { color: PC.primary } } },
        { text: "Actual", options: { bold: true, fontSize: 7.5, color: PC.white, fill: { color: PC.primary } } },
        { text: "Target", options: { bold: true, fontSize: 7.5, color: PC.white, fill: { color: PC.primary } } },
        { text: "Status", options: { bold: true, fontSize: 7.5, color: PC.white, fill: { color: PC.primary } } },
      ],
    ];

    data.kpis.slice(0, 10).forEach((kpi, idx) => {
      const rowFill = idx % 2 === 0 ? PC.white : PC.light;
      const sc = kpiStatusPtxColor(kpi.status ?? "");
      kpiRows.push([
        { text: kpi.name ?? "—", options: { fontSize: 7.5, color: PC.dark, fill: { color: rowFill } } },
        { text: String(kpi.actual ?? "—"), options: { fontSize: 7.5, color: PC.dark, fill: { color: rowFill } } },
        { text: String(kpi.target ?? "—"), options: { fontSize: 7.5, color: PC.dark, fill: { color: rowFill } } },
        { text: (kpi.status ?? "—").replace("_", " "), options: { fontSize: 7.5, bold: true, color: PC.white, fill: { color: sc } } },
      ]);
    });

    s4.addTable(kpiRows, {
      x: 7.6, y: 0.9, w: 5.3,
      border: { type: "solid", pt: 0.5, color: PC.border },
      colW: [2.2, 1.0, 1.0, 1.1],
      margin: [3, 4, 3, 4],
    });

    addFooter(s4, 4, totalSlides);

    // ── SLIDE 5: Risks & AI Assessment ────────────────────────────────────────
    const s5 = pptx.addSlide();
    addSlideBar(s5);
    s5.addText("Risk Summary & AI Assessment", { x: 0.5, y: 0.15, w: 12, h: 0.6, fontSize: 22, bold: true, color: PC.dark });

    // Top risks table
    const riskRows: PptxGenJS.TableRow[] = [
      [
        { text: "Risk", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "Severity", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "Score", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
        { text: "Status", options: { bold: true, fontSize: 8, color: PC.white, fill: { color: PC.primary } } },
      ],
    ];

    data.topRisks.forEach((risk, idx) => {
      const rowFill = idx % 2 === 0 ? PC.white : PC.light;
      const sc = sevPtxColor(risk.impact);
      riskRows.push([
        { text: risk.title, options: { fontSize: 8, color: PC.dark, fill: { color: rowFill } } },
        { text: (risk.impact ?? "—").toUpperCase(), options: { fontSize: 8, bold: true, color: PC.white, fill: { color: sc } } },
        { text: String(sevNum(risk.impact) * sevNum(risk.probability)), options: { fontSize: 8, color: PC.dark, fill: { color: rowFill } } },
        { text: risk.status ?? "open", options: { fontSize: 8, color: PC.dark, fill: { color: rowFill } } },
      ]);
    });

    s5.addTable(riskRows, {
      x: 0.4, y: 0.9, w: 6.5,
      border: { type: "solid", pt: 0.5, color: PC.border },
      colW: [3.0, 1.3, 1.0, 1.2],
      margin: [3, 5, 3, 5],
    });

    // AI Assessment box
    const aiBox = { x: 7.1, y: 0.9, w: 6.0, h: 5.8 };
    s5.addShape(pptx.ShapeType.roundRect, { ...aiBox, fill: { color: PC.light }, line: { color: PC.border, width: 0.5 }, rectRadius: 0.08 });
    s5.addText("AI Programme Assessment", { x: aiBox.x + 0.15, y: aiBox.y + 0.1, w: 5.7, h: 0.4, fontSize: 11, bold: true, color: PC.dark });

    if (data.aiAssessment) {
      const hColor = data.aiAssessment.overallHealth === "excellent" || data.aiAssessment.overallHealth === "good"
        ? PC.green : data.aiAssessment.overallHealth === "at_risk" || data.aiAssessment.overallHealth === "critical"
          ? PC.red : PC.amber;
      s5.addShape(pptx.ShapeType.roundRect, { x: aiBox.x + 0.15, y: aiBox.y + 0.6, w: 5.7, h: 0.45, fill: { color: hColor }, rectRadius: 0.05 });
      s5.addText(`Overall: ${data.aiAssessment.overallHealth.replace("_", " ").toUpperCase()}`, {
        x: aiBox.x + 0.3, y: aiBox.y + 0.65, w: 5.5, h: 0.35, fontSize: 11, bold: true, color: PC.white,
      });

      s5.addText(data.aiAssessment.summary, {
        x: aiBox.x + 0.15, y: aiBox.y + 1.2, w: 5.7, h: 1.2, fontSize: 8.5, color: PC.dark,
      });

      let aiTxtY = aiBox.y + 2.5;
      if (data.aiAssessment.recommendations?.length > 0) {
        s5.addText("Key Recommendations:", { x: aiBox.x + 0.15, y: aiTxtY, w: 5.7, h: 0.28, fontSize: 8.5, bold: true, color: PC.primary });
        aiTxtY += 0.3;
        data.aiAssessment.recommendations.slice(0, 3).forEach((r) => {
          s5.addText(`• ${r}`, { x: aiBox.x + 0.3, y: aiTxtY, w: 5.5, h: 0.35, fontSize: 8, color: PC.dark });
          aiTxtY += 0.37;
        });
      }

      if (data.aiAssessment.riskFlags?.length > 0) {
        aiTxtY += 0.1;
        s5.addText("Risk Flags:", { x: aiBox.x + 0.15, y: aiTxtY, w: 5.7, h: 0.28, fontSize: 8.5, bold: true, color: PC.red });
        aiTxtY += 0.3;
        data.aiAssessment.riskFlags.slice(0, 2).forEach((r) => {
          s5.addText(`• ${r}`, { x: aiBox.x + 0.3, y: aiTxtY, w: 5.5, h: 0.35, fontSize: 8, color: PC.dark });
          aiTxtY += 0.37;
        });
      }
    } else {
      s5.addText(
        "Run AI Assessment from the dashboard to include AI-powered analysis in this report.",
        { x: aiBox.x + 0.15, y: aiBox.y + 0.7, w: 5.7, h: 1.0, fontSize: 9, color: PC.grey, italic: true },
      );
    }

    addFooter(s5, 5, totalSlides);

    // ── SLIDE 6: Department Overview ──────────────────────────────────────────
    if (data.departments.length > 0) {
      const sDept = pptx.addSlide();
      addSlideBar(sDept);
      sDept.addText("Department Progress Overview", { x: 0.5, y: 0.15, w: 12, h: 0.6, fontSize: 22, bold: true, color: PC.dark });
      sDept.addText("Programme delivery by department — project count, average progress, and status", {
        x: 0.5, y: 0.6, w: 12, h: 0.3, fontSize: 10, color: PC.grey,
      });

      const deptTableRows: PptxGenJS.TableRow[] = [
        [
          { text: "Department", options: { bold: true, fontSize: 9, fill: { color: PC.primary }, color: PC.white } },
          { text: "Projects", options: { bold: true, fontSize: 9, fill: { color: PC.primary }, color: PC.white, align: "center" } },
          { text: "Avg Progress", options: { bold: true, fontSize: 9, fill: { color: PC.primary }, color: PC.white, align: "center" } },
          { text: "On Track", options: { bold: true, fontSize: 9, fill: { color: PC.primary }, color: PC.white, align: "center" } },
          { text: "Status", options: { bold: true, fontSize: 9, fill: { color: PC.primary }, color: PC.white, align: "center" } },
        ],
      ];
      for (const dept of data.departments.slice(0, 12)) {
        const deptStatus = dept.onTrack === dept.projectCount ? "on_track" : dept.onTrack >= dept.projectCount * 0.7 ? "at_risk" : "delayed";
        deptTableRows.push([
          { text: dept.name, options: { fontSize: 9 } },
          { text: String(dept.projectCount), options: { fontSize: 9, align: "center" } },
          { text: `${dept.avgProgress}%`, options: { fontSize: 9, align: "center", bold: true } },
          { text: `${dept.onTrack} / ${dept.projectCount}`, options: { fontSize: 9, align: "center" } },
          { text: statusLabel(deptStatus), options: { fontSize: 9, align: "center", color: statusPtxColor(deptStatus), bold: true } },
        ]);
      }
      sDept.addTable(deptTableRows, { x: 0.4, y: 1.1, w: 12.4, colW: [3.5, 1.5, 2, 2, 3.4], border: { color: PC.border, pt: 0.5 } });
    }

    // ── SLIDE 7: Support Required / Escalations ──────────────────────────────
    const sSupport = pptx.addSlide();
    addSlideBar(sSupport);
    sSupport.addText("Support Required & Escalations", { x: 0.5, y: 0.15, w: 12, h: 0.6, fontSize: 22, bold: true, color: PC.dark });
    sSupport.addText("Items requiring executive decision or intervention", {
      x: 0.5, y: 0.6, w: 12, h: 0.3, fontSize: 10, color: PC.grey,
    });

    const criticalRisks = data.risks.filter((r) => r.status === "open" && r.riskScore >= 12);
    if (criticalRisks.length > 0) {
      const supportRows: PptxGenJS.TableRow[] = [
        [
          { text: "#", options: { bold: true, fontSize: 9, fill: { color: PC.red }, color: PC.white, align: "center" } },
          { text: "Issue / Risk", options: { bold: true, fontSize: 9, fill: { color: PC.red }, color: PC.white } },
          { text: "Impact", options: { bold: true, fontSize: 9, fill: { color: PC.red }, color: PC.white } },
          { text: "Support Needed", options: { bold: true, fontSize: 9, fill: { color: PC.red }, color: PC.white } },
          { text: "Owner", options: { bold: true, fontSize: 9, fill: { color: PC.red }, color: PC.white } },
        ],
      ];
      criticalRisks.slice(0, 6).forEach((r, i) => {
        supportRows.push([
          { text: String(i + 1), options: { fontSize: 9, align: "center" } },
          { text: r.title, options: { fontSize: 8 } },
          { text: `${r.probability}/${r.impact} (Score: ${r.riskScore})`, options: { fontSize: 8 } },
          { text: "Decision required — see mitigation plan", options: { fontSize: 8, italic: true } },
          { text: r.owner ?? "—", options: { fontSize: 8 } },
        ]);
      });
      sSupport.addTable(supportRows, { x: 0.4, y: 1.1, w: 12.4, colW: [0.5, 4, 2.5, 3, 2.4], border: { color: PC.border, pt: 0.5 } });
    } else {
      sSupport.addText("No critical escalations this week. All risks within acceptable thresholds.", {
        x: 0.4, y: 2.0, w: 12, h: 1, fontSize: 14, color: PC.green, align: "center",
      });
    }

    // ── SLIDE 8: Appendix Divider ────────────────────────────────────────────
    const sAppDiv = pptx.addSlide();
    addSlideBar(sAppDiv);
    sAppDiv.addText("APPENDIX", { x: 0, y: 2.5, w: 13.3, h: 1.2, fontSize: 36, bold: true, color: PC.dark, align: "center" });
    sAppDiv.addText("Detailed project status, weekly achievements, and risk register", {
      x: 0, y: 3.7, w: 13.3, h: 0.5, fontSize: 14, color: PC.grey, align: "center",
    });

    // ── APPENDIX SLIDES: Per-department project details ──────────────────────
    for (const dept of data.departments) {
      const sD = pptx.addSlide();
      addSlideBar(sD);
      sD.addText(`${dept.name} — Project Status`, { x: 0.5, y: 0.15, w: 12, h: 0.5, fontSize: 18, bold: true, color: PC.dark });
      sD.addText(`${dept.projectCount} projects · Avg progress ${dept.avgProgress}%`, {
        x: 0.5, y: 0.5, w: 12, h: 0.3, fontSize: 10, color: PC.grey,
      });

      const projRows: PptxGenJS.TableRow[] = [
        [
          { text: "Project", options: { bold: true, fontSize: 8, fill: { color: PC.primary }, color: PC.white } },
          { text: "Status", options: { bold: true, fontSize: 8, fill: { color: PC.primary }, color: PC.white, align: "center" } },
          { text: "Progress", options: { bold: true, fontSize: 8, fill: { color: PC.primary }, color: PC.white, align: "center" } },
          { text: "Key Achievement", options: { bold: true, fontSize: 8, fill: { color: PC.primary }, color: PC.white } },
          { text: "Next Steps", options: { bold: true, fontSize: 8, fill: { color: PC.primary }, color: PC.white } },
          { text: "Key Risk", options: { bold: true, fontSize: 8, fill: { color: PC.primary }, color: PC.white } },
        ],
      ];

      for (const p of dept.projects.slice(0, 15)) {
        const ms = data.milestones.filter((m) => m.projectId === p.id);
        const prog = ms.length === 0 ? 0 : Math.round(ms.reduce((s, m) => s + (m.progress ?? 0), 0) / ms.length);
        const s = computeStatus(prog, p.startDate, p.targetDate, p.budget ?? 0, p.budgetSpent ?? 0, prog);
        const report = data.weeklyReports.get(p.id);
        const topRisk = data.risks.filter((r) => r.projectId === p.id && r.status === "open").sort((a, b) => b.riskScore - a.riskScore)[0];

        projRows.push([
          { text: `${p.projectCode ?? ""} ${p.name}`.trim(), options: { fontSize: 7.5 } },
          { text: statusLabel(s.status), options: { fontSize: 7.5, align: "center", color: statusPtxColor(s.status), bold: true } },
          { text: `${prog}%`, options: { fontSize: 8, align: "center", bold: true } },
          { text: report?.keyAchievements?.slice(0, 120) ?? "—", options: { fontSize: 7 } },
          { text: report?.nextSteps?.slice(0, 120) ?? "—", options: { fontSize: 7 } },
          { text: topRisk ? `${topRisk.title} (${topRisk.riskScore})` : "—", options: { fontSize: 7, color: topRisk && topRisk.riskScore >= 9 ? PC.red : PC.grey } },
        ]);
      }

      sD.addTable(projRows, { x: 0.3, y: 0.9, w: 12.7, colW: [2.2, 1, 0.8, 3.2, 3, 2.5], border: { color: PC.border, pt: 0.5 }, rowH: 0.4 });
    }

    // ── Generate and send ─────────────────────────────────────────────────────
    const pptxBuffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Programme-Report-${new Date().toISOString().slice(0, 10)}.pptx"`,
    );
    res.send(pptxBuffer);
  } catch (err) {
    console.error("PPTX generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PPTX report" });
    }
  }
});

export default router;
