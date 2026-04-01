import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoInitiativesTable,
  spmoPillarsTable,
  spmoMilestonesTable,
  spmoRisksTable,
  spmoBudgetTable,
  spmoKpisTable,
  spmoActivityLogTable,
} from "@workspace/db";
import { eq, gte, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { calcProgrammeProgress } from "./spmo-calc";

// ─────────────────────────────────────────────────────────────
// Board Report Narrative Generator
// AI-written executive summary backed by real computed metrics.
// ─────────────────────────────────────────────────────────────

export interface BoardReportSection {
  title: string;
  narrative: string;
  keyMetrics: { label: string; value: string; trend?: "up" | "down" | "stable" }[];
  attentionItems: string[];
}

export interface BoardReport {
  generatedAt: string;
  periodLabel: string; // e.g. "Q1 2026"
  executiveSummary: string;
  sections: BoardReportSection[];
  recommendations: string[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getCurrentQuarterLabel(): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${quarter} ${now.getFullYear()}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─────────────────────────────────────────────────────────────
// Data gathering
// ─────────────────────────────────────────────────────────────

async function gatherAllData() {
  // Programme progress and pillar summaries
  const { programmeProgress, pillarSummaries } = await calcProgrammeProgress();

  // All projects
  const allProjects = await db.select().from(spmoProjectsTable);
  const activeProjects = allProjects.filter((p) => p.status === "active");
  const completedProjects = allProjects.filter((p) => p.status === "completed");
  const onHoldProjects = allProjects.filter((p) => p.status === "on_hold");

  // All milestones
  const allMilestones = await db.select().from(spmoMilestonesTable);
  const overdueMilestones = allMilestones.filter((m) => {
    if (m.status === "approved") return false;
    if (!m.dueDate) return false;
    return new Date(m.dueDate) < new Date();
  });
  const pendingApprovals = allMilestones.filter((m) => m.status === "submitted");

  // Budget totals
  const totalAllocated = allProjects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalSpent = allProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);

  // Budget by pillar
  const initiatives = await db.select().from(spmoInitiativesTable);
  const pillarBudgets = pillarSummaries.map((ps) => {
    const pillarInits = initiatives.filter((i) => i.pillarId === ps.pillar.id);
    const pillarProjects = allProjects.filter((p) =>
      pillarInits.some((i) => i.id === p.initiativeId)
    );
    const allocated = pillarProjects.reduce((s, p) => s + (p.budget ?? 0), 0);
    const spent = pillarProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
    return {
      pillarName: ps.pillar.name,
      allocated,
      spent,
      utilisation: allocated > 0 ? round1((spent / allocated) * 100) : 0,
    };
  });

  // Risks
  const allRisks = await db.select().from(spmoRisksTable);
  const openRisks = allRisks.filter((r) => r.status === "open");
  const highRisks = openRisks.filter((r) => r.riskScore >= 9);
  const criticalRisks = openRisks.filter((r) => r.riskScore >= 12);

  // KPIs
  const allKpis = await db.select().from(spmoKpisTable);
  const kpiStatusCounts = {
    exceeding: allKpis.filter((k) => k.status === "exceeding").length,
    achieved: allKpis.filter((k) => k.status === "achieved").length,
    on_track: allKpis.filter((k) => k.status === "on_track").length,
    at_risk: allKpis.filter((k) => k.status === "at_risk").length,
    critical: allKpis.filter((k) => k.status === "critical").length,
    not_started: allKpis.filter((k) => k.status === "not_started").length,
  };

  // Recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivity = await db
    .select()
    .from(spmoActivityLogTable)
    .where(gte(spmoActivityLogTable.createdAt, thirtyDaysAgo))
    .orderBy(desc(spmoActivityLogTable.createdAt));

  return {
    programmeProgress,
    pillarSummaries: pillarSummaries.map((ps) => ({
      pillarName: ps.pillar.name,
      pillarId: ps.pillar.id,
      progress: ps.progress,
      initiativeCount: ps.initiativeCount,
      projectCount: ps.projectCount,
      milestoneCount: ps.milestoneCount,
      approvedMilestones: ps.approvedMilestones,
      pendingApprovals: ps.pendingApprovals,
    })),
    projects: {
      total: allProjects.length,
      active: activeProjects.length,
      completed: completedProjects.length,
      onHold: onHoldProjects.length,
    },
    milestones: {
      total: allMilestones.length,
      approved: allMilestones.filter((m) => m.status === "approved").length,
      overdue: overdueMilestones.length,
      pendingApprovals: pendingApprovals.length,
      overdueDetails: overdueMilestones.slice(0, 10).map((m) => ({
        name: m.name,
        dueDate: m.dueDate,
        progress: m.progress,
      })),
    },
    budget: {
      totalAllocated,
      totalSpent,
      utilisation: totalAllocated > 0 ? round1((totalSpent / totalAllocated) * 100) : 0,
      byPillar: pillarBudgets,
    },
    risks: {
      total: allRisks.length,
      open: openRisks.length,
      high: highRisks.length,
      critical: criticalRisks.length,
      topRisks: highRisks.slice(0, 5).map((r) => ({
        title: r.title,
        riskScore: r.riskScore,
        probability: r.probability,
        impact: r.impact,
        owner: r.owner,
      })),
    },
    kpis: {
      total: allKpis.length,
      statusCounts: kpiStatusCounts,
      criticalKpis: allKpis
        .filter((k) => k.status === "critical" || k.status === "at_risk")
        .map((k) => ({
          name: k.name,
          target: k.target,
          actual: k.actual,
          status: k.status,
        })),
    },
    recentActivity: {
      totalActions: recentActivity.length,
      approvals: recentActivity.filter((a) => a.action === "approved").length,
      submissions: recentActivity.filter((a) => a.action === "submitted").length,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Computed metrics for sections (not AI-generated)
// ─────────────────────────────────────────────────────────────

function buildProgrammeMetrics(data: Awaited<ReturnType<typeof gatherAllData>>): BoardReportSection["keyMetrics"] {
  return [
    { label: "Programme Progress", value: `${data.programmeProgress}%`, trend: "stable" },
    { label: "Active Projects", value: `${data.projects.active}`, trend: "stable" },
    { label: "Completed Projects", value: `${data.projects.completed}`, trend: "up" },
    { label: "Milestones Approved", value: `${data.milestones.approved} / ${data.milestones.total}`, trend: "stable" },
    { label: "Pending Approvals", value: `${data.milestones.pendingApprovals}`, trend: "stable" },
  ];
}

function buildBudgetMetrics(data: Awaited<ReturnType<typeof gatherAllData>>): BoardReportSection["keyMetrics"] {
  return [
    { label: "Total Budget Allocated", value: data.budget.totalAllocated.toLocaleString(), trend: "stable" },
    { label: "Total Spent", value: data.budget.totalSpent.toLocaleString(), trend: "stable" },
    { label: "Budget Utilisation", value: `${data.budget.utilisation}%`, trend: "stable" },
  ];
}

function buildRiskMetrics(data: Awaited<ReturnType<typeof gatherAllData>>): BoardReportSection["keyMetrics"] {
  return [
    { label: "Open Risks", value: `${data.risks.open}`, trend: "stable" },
    { label: "High/Critical Risks", value: `${data.risks.high}`, trend: data.risks.critical > 0 ? "up" : "stable" },
    { label: "Risk Register Total", value: `${data.risks.total}`, trend: "stable" },
  ];
}

function buildKpiMetrics(data: Awaited<ReturnType<typeof gatherAllData>>): BoardReportSection["keyMetrics"] {
  const { statusCounts } = data.kpis;
  return [
    { label: "KPIs Achieved/Exceeding", value: `${statusCounts.achieved + statusCounts.exceeding}`, trend: "up" },
    { label: "KPIs On Track", value: `${statusCounts.on_track}`, trend: "stable" },
    { label: "KPIs At Risk/Critical", value: `${statusCounts.at_risk + statusCounts.critical}`, trend: statusCounts.critical > 0 ? "up" : "stable" },
    { label: "Total KPIs", value: `${data.kpis.total}`, trend: "stable" },
  ];
}

// ─────────────────────────────────────────────────────────────
// Main report generator
// ─────────────────────────────────────────────────────────────

export async function generateBoardReport(): Promise<BoardReport> {
  const data = await gatherAllData();
  const periodLabel = getCurrentQuarterLabel();

  // Build a detailed prompt with all data
  const systemPrompt = `You are a McKinsey-trained programme management advisor writing a quarterly board report for a government transformation programme. Write in professional executive language. Be specific with numbers. Use the actual data provided — do not fabricate numbers.

Structure your response as a JSON object with this exact format:
{
  "executiveSummary": "2-3 paragraph executive summary of the programme state",
  "sections": [
    {
      "title": "Programme Progress",
      "narrative": "2-3 paragraphs on progress",
      "attentionItems": ["item1", "item2"]
    },
    {
      "title": "Budget & Financial Performance",
      "narrative": "2-3 paragraphs on budget",
      "attentionItems": ["item1"]
    },
    {
      "title": "Risk Landscape",
      "narrative": "2-3 paragraphs on risks",
      "attentionItems": ["item1"]
    },
    {
      "title": "KPI Performance",
      "narrative": "2-3 paragraphs on KPIs",
      "attentionItems": ["item1"]
    },
    {
      "title": "Attention Items & Escalations",
      "narrative": "1-2 paragraphs on items needing board attention",
      "attentionItems": ["item1"]
    }
  ],
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
}

Return ONLY the JSON object, no markdown code fences or extra text.`;

  const userPrompt = `Generate the ${periodLabel} board report for this programme:

${JSON.stringify(data, null, 2)}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract text from the response
  const responseText = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  // Parse the AI response
  let aiReport: {
    executiveSummary: string;
    sections: { title: string; narrative: string; attentionItems: string[] }[];
    recommendations: string[];
  };

  try {
    // Strip markdown code fences if present
    const cleaned = responseText.replace(/^```json?\s*/m, "").replace(/\s*```$/m, "").trim();
    aiReport = JSON.parse(cleaned);
  } catch {
    // Fallback if AI response is not valid JSON
    aiReport = {
      executiveSummary: responseText.slice(0, 500),
      sections: [
        {
          title: "Programme Overview",
          narrative: responseText,
          attentionItems: [],
        },
      ],
      recommendations: ["Review programme data for detailed insights."],
    };
  }

  // Merge AI narratives with computed metrics
  const metricsBySection: Record<string, BoardReportSection["keyMetrics"]> = {
    "Programme Progress": buildProgrammeMetrics(data),
    "Budget & Financial Performance": buildBudgetMetrics(data),
    "Risk Landscape": buildRiskMetrics(data),
    "KPI Performance": buildKpiMetrics(data),
  };

  const sections: BoardReportSection[] = aiReport.sections.map((s) => ({
    title: s.title,
    narrative: s.narrative,
    keyMetrics: metricsBySection[s.title] ?? [],
    attentionItems: s.attentionItems ?? [],
  }));

  return {
    generatedAt: new Date().toISOString(),
    periodLabel,
    executiveSummary: aiReport.executiveSummary,
    sections,
    recommendations: aiReport.recommendations ?? [],
  };
}
