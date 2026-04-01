import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoInitiativesTable,
  spmoPillarsTable,
  spmoMilestonesTable,
  spmoRisksTable,
  spmoBudgetTable,
  spmoKpisTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { calcProgrammeProgress } from "./spmo-calc";

// ─────────────────────────────────────────────────────────────
// AI Programme Advisor Engine
// Conversational queries about the programme backed by real data.
// ─────────────────────────────────────────────────────────────

export interface AdvisorQuery {
  question: string;
  context?: "portfolio" | "project" | "risks" | "budget" | "kpis";
  projectId?: number;
}

export interface AdvisorResponse {
  answer: string;
  dataUsed: string[];          // list of data sources consulted
  suggestedActions: string[];
  relatedLinks: { label: string; path: string }[];
}

// ─────────────────────────────────────────────────────────────
// Context gatherers
// ─────────────────────────────────────────────────────────────

async function gatherPortfolioContext(): Promise<{ data: Record<string, unknown>; sources: string[] }> {
  const { programmeProgress, pillarSummaries } = await calcProgrammeProgress();
  const allProjects = await db.select().from(spmoProjectsTable);
  const allMilestones = await db.select().from(spmoMilestonesTable);

  return {
    data: {
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
      totalProjects: allProjects.length,
      activeProjects: allProjects.filter((p) => p.status === "active").length,
      totalMilestones: allMilestones.length,
      approvedMilestones: allMilestones.filter((m) => m.status === "approved").length,
      pendingApprovals: allMilestones.filter((m) => m.status === "submitted").length,
    },
    sources: ["programme_progress", "pillar_summaries", "projects_overview", "milestones_overview"],
  };
}

async function gatherRiskContext(): Promise<{ data: Record<string, unknown>; sources: string[] }> {
  const risks = await db.select().from(spmoRisksTable);
  const openRisks = risks.filter((r) => r.status === "open");
  const highRisks = openRisks.filter((r) => r.riskScore >= 9);

  return {
    data: {
      totalRisks: risks.length,
      openRisks: openRisks.length,
      highRisks: highRisks.length,
      riskDetails: openRisks.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        probability: r.probability,
        impact: r.impact,
        riskScore: r.riskScore,
        owner: r.owner,
        projectId: r.projectId,
        pillarId: r.pillarId,
      })),
    },
    sources: ["risks_register"],
  };
}

async function gatherBudgetContext(): Promise<{ data: Record<string, unknown>; sources: string[] }> {
  const budgetEntries = await db.select().from(spmoBudgetTable);
  const projects = await db.select().from(spmoProjectsTable);

  const totalAllocated = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalSpent = projects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);

  return {
    data: {
      totalAllocated,
      totalSpent,
      utilisation: totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0,
      budgetEntries: budgetEntries.map((b) => ({
        category: b.category,
        description: b.description,
        allocated: b.allocated,
        spent: b.spent,
        period: b.period,
        projectId: b.projectId,
        pillarId: b.pillarId,
      })),
      projectBudgets: projects
        .filter((p) => (p.budget ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          projectId: p.id,
          budget: p.budget,
          budgetSpent: p.budgetSpent,
          status: p.status,
        })),
    },
    sources: ["budget_entries", "project_budgets"],
  };
}

async function gatherKpiContext(): Promise<{ data: Record<string, unknown>; sources: string[] }> {
  const kpis = await db.select().from(spmoKpisTable);
  const statusCounts = {
    exceeding: kpis.filter((k) => k.status === "exceeding").length,
    on_track: kpis.filter((k) => k.status === "on_track").length,
    at_risk: kpis.filter((k) => k.status === "at_risk").length,
    critical: kpis.filter((k) => k.status === "critical").length,
    achieved: kpis.filter((k) => k.status === "achieved").length,
    not_started: kpis.filter((k) => k.status === "not_started").length,
  };

  return {
    data: {
      totalKpis: kpis.length,
      statusCounts,
      kpiDetails: kpis.map((k) => ({
        id: k.id,
        name: k.name,
        description: k.description,
        unit: k.unit,
        baseline: k.baseline,
        target: k.target,
        actual: k.actual,
        status: k.status,
        type: k.type,
        pillarId: k.pillarId,
        projectId: k.projectId,
      })),
    },
    sources: ["kpi_register"],
  };
}

async function gatherProjectContext(projectId: number): Promise<{ data: Record<string, unknown>; sources: string[] }> {
  const [project] = await db.select().from(spmoProjectsTable).where(eq(spmoProjectsTable.id, projectId));
  if (!project) return { data: { error: "Project not found" }, sources: [] };

  const milestones = await db.select().from(spmoMilestonesTable).where(eq(spmoMilestonesTable.projectId, projectId));
  const risks = await db.select().from(spmoRisksTable).where(eq(spmoRisksTable.projectId, projectId));
  const kpis = await db.select().from(spmoKpisTable).where(eq(spmoKpisTable.projectId, projectId));

  const [initiative] = await db
    .select()
    .from(spmoInitiativesTable)
    .where(eq(spmoInitiativesTable.id, project.initiativeId));

  return {
    data: {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startDate: project.startDate,
        targetDate: project.targetDate,
        budget: project.budget,
        budgetSpent: project.budgetSpent,
        ownerName: project.ownerName,
      },
      initiative: initiative ? { id: initiative.id, name: initiative.name } : null,
      milestones: milestones.map((m) => ({
        id: m.id,
        name: m.name,
        progress: m.progress,
        status: m.status,
        dueDate: m.dueDate,
        weight: m.weight,
      })),
      risks: risks.map((r) => ({
        id: r.id,
        title: r.title,
        probability: r.probability,
        impact: r.impact,
        riskScore: r.riskScore,
        status: r.status,
      })),
      kpis: kpis.map((k) => ({
        id: k.id,
        name: k.name,
        target: k.target,
        actual: k.actual,
        status: k.status,
      })),
    },
    sources: ["project_detail", "project_milestones", "project_risks", "project_kpis"],
  };
}

// ─────────────────────────────────────────────────────────────
// Related links generator
// ─────────────────────────────────────────────────────────────

function generateRelatedLinks(
  contextType: AdvisorQuery["context"],
  projectId?: number,
): { label: string; path: string }[] {
  const links: { label: string; path: string }[] = [];

  links.push({ label: "Programme Dashboard", path: "/spmo/dashboard" });

  if (contextType === "risks" || contextType === "portfolio") {
    links.push({ label: "Risk Register", path: "/spmo/risks" });
  }
  if (contextType === "budget" || contextType === "portfolio") {
    links.push({ label: "Budget Overview", path: "/spmo/budget" });
  }
  if (contextType === "kpis" || contextType === "portfolio") {
    links.push({ label: "KPI Dashboard", path: "/spmo/kpis" });
  }
  if (projectId) {
    links.push({ label: "Project Detail", path: `/spmo/projects/${projectId}` });
  }

  return links;
}

// ─────────────────────────────────────────────────────────────
// Main advisor function
// ─────────────────────────────────────────────────────────────

export async function queryAdvisor(input: AdvisorQuery): Promise<AdvisorResponse> {
  // 1. Gather relevant context based on the question
  const allData: Record<string, unknown> = {};
  const allSources: string[] = [];

  // Always include portfolio overview
  const portfolio = await gatherPortfolioContext();
  Object.assign(allData, { portfolio: portfolio.data });
  allSources.push(...portfolio.sources);

  // Add context-specific data
  if (input.context === "risks" || !input.context) {
    const risks = await gatherRiskContext();
    Object.assign(allData, { risks: risks.data });
    allSources.push(...risks.sources);
  }

  if (input.context === "budget" || !input.context) {
    const budget = await gatherBudgetContext();
    Object.assign(allData, { budget: budget.data });
    allSources.push(...budget.sources);
  }

  if (input.context === "kpis" || !input.context) {
    const kpis = await gatherKpiContext();
    Object.assign(allData, { kpis: kpis.data });
    allSources.push(...kpis.sources);
  }

  if (input.projectId) {
    const project = await gatherProjectContext(input.projectId);
    Object.assign(allData, { targetProject: project.data });
    allSources.push(...project.sources);
  }

  // 2. Build system prompt
  const systemPrompt = `You are a senior PMO advisor for a government transformation programme. You have access to the full programme data below. Answer the user's question with specific data, numbers, and actionable recommendations.

Be concise but thorough. Reference specific project names, pillar names, and numbers when available. Structure your response clearly.

At the end of your response, include a section called "SUGGESTED_ACTIONS:" with 2-5 bullet points of specific actions the programme team should take based on your analysis.

Programme Data:
${JSON.stringify(allData, null, 2)}`;

  // 3. Call the Anthropic API
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: input.question }],
  });

  // 4. Extract the response text
  const responseText = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  // 5. Parse suggested actions from the response
  const suggestedActions: string[] = [];
  const actionsMatch = responseText.match(/SUGGESTED_ACTIONS:\s*([\s\S]*?)$/i);
  if (actionsMatch) {
    const actionLines = actionsMatch[1]
      .split("\n")
      .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
      .filter((line) => line.length > 0);
    suggestedActions.push(...actionLines);
  }

  // Remove the SUGGESTED_ACTIONS section from the main answer
  const answer = responseText
    .replace(/SUGGESTED_ACTIONS:\s*[\s\S]*$/i, "")
    .trim();

  // 6. Generate related links
  const relatedLinks = generateRelatedLinks(input.context, input.projectId);

  return {
    answer,
    dataUsed: [...new Set(allSources)],
    suggestedActions,
    relatedLinks,
  };
}
