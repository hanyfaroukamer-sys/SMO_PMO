import { db } from "@workspace/db";
import {
  spmoProjectsTable,
  spmoInitiativesTable,
  spmoMilestonesTable,
  spmoRisksTable,
  spmoDependenciesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

let anthropic: any;
try {
  anthropic = require("@workspace/integrations-anthropic-ai").anthropic;
} catch {
  anthropic = null;
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type SuggestedDepType =
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "budget"
  | "risk"
  | "resource";

export interface DependencySuggestion {
  // Source entity
  sourceType: "milestone" | "project" | "initiative" | "risk" | "budget";
  sourceId: number;
  sourceName: string;
  sourceProjectName: string | null;

  // Target entity
  targetType: "milestone" | "project" | "initiative" | "risk" | "budget";
  targetId: number;
  targetName: string;
  targetProjectName: string | null;

  // Suggestion details
  depType: SuggestedDepType;
  confidence: "high" | "medium" | "low";
  reason: string;
  suggestedLagDays: number;
  isHard: boolean;

  // Source of suggestion
  source: "heuristic" | "ai" | "name_similarity" | "timeline_overlap" | "budget_link";

  // Is this already registered?
  alreadyExists: boolean;
}

export interface DependencyFinderResult {
  suggestions: DependencySuggestion[];
  analysisMethod: "heuristic" | "ai_enhanced";
  totalAnalysed: { milestones: number; projects: number; risks: number };
  existingDependencies: number;
  newSuggestionsCount: number;
}

// ─────────────────────────────────────────────────────────────
// Stop words for name similarity comparison
// ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "and", "the", "of", "for", "to", "in", "on", "a", "an",
  "with", "by", "&", "-", "phase", "project",
]);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function extractWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s\-_/&]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

function wordOverlap(wordsA: string[], wordsB: string[]): number {
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setA = new Set(wordsA);
  const shared = wordsB.filter((w) => setA.has(w)).length;
  return shared / Math.max(wordsA.length, wordsB.length);
}

function daysBetween(dateA: string | null, dateB: string | null): number | null {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function depKey(
  sourceType: string,
  sourceId: number,
  targetType: string,
  targetId: number,
): string {
  return `${sourceType}:${sourceId}->${targetType}:${targetId}`;
}

// ─────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────

async function loadProgrammeData() {
  const [projects, milestones, risks, initiatives, existingDeps] =
    await Promise.all([
      db.select().from(spmoProjectsTable),
      db.select().from(spmoMilestonesTable),
      db.select().from(spmoRisksTable),
      db.select().from(spmoInitiativesTable),
      db.select().from(spmoDependenciesTable),
    ]);

  // Build lookup maps
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const milestonesByProject = new Map<number, typeof milestones>();
  for (const ms of milestones) {
    const arr = milestonesByProject.get(ms.projectId) ?? [];
    arr.push(ms);
    milestonesByProject.set(ms.projectId, arr);
  }

  // Build a set of existing dependency keys for quick lookup
  const existingDepKeys = new Set(
    existingDeps.map((d) => depKey(d.sourceType, d.sourceId, d.targetType, d.targetId)),
  );

  return {
    projects,
    milestones,
    risks,
    initiatives,
    existingDeps,
    projectMap,
    milestonesByProject,
    existingDepKeys,
  };
}

// ─────────────────────────────────────────────────────────────
// Phase 1: Heuristic Rules
// ─────────────────────────────────────────────────────────────

function findNameSimilarities(
  milestones: Awaited<ReturnType<typeof loadProgrammeData>>["milestones"],
  projectMap: Awaited<ReturnType<typeof loadProgrammeData>>["projectMap"],
): DependencySuggestion[] {
  const suggestions: DependencySuggestion[] = [];
  const seen = new Set<string>();

  // Pre-compute words for all milestones and skip empty ones
  const msWithWords = milestones
    .map((ms) => ({ ms, words: extractWords(ms.name) }))
    .filter((m) => m.words.length > 0);

  // Build an inverted index: word → milestone indices (much faster than O(n²))
  const wordIndex = new Map<string, number[]>();
  msWithWords.forEach((m, idx) => {
    for (const w of m.words) {
      const list = wordIndex.get(w) ?? [];
      list.push(idx);
      wordIndex.set(w, list);
    }
  });

  // For each milestone, find candidates that share at least one word
  for (let i = 0; i < msWithWords.length; i++) {
    const { ms: msA, words: wordsA } = msWithWords[i];
    const candidateSet = new Set<number>();
    for (const w of wordsA) {
      for (const j of wordIndex.get(w) ?? []) {
        if (j > i) candidateSet.add(j); // only check j > i to avoid duplicates
      }
    }

    for (const j of candidateSet) {
      const { ms: msB, words: wordsB } = msWithWords[j];
      if (msA.projectId === msB.projectId) continue;

      const overlap = wordOverlap(wordsA, wordsB);
      if (overlap < 0.5) continue;

      const dueA = msA.dueDate ? new Date(msA.dueDate).getTime() : Infinity;
      const dueB = msB.dueDate ? new Date(msB.dueDate).getTime() : Infinity;
      const [source, target] = dueA <= dueB ? [msA, msB] : [msB, msA];
      const key = `name_sim:${source.id}->${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      suggestions.push({
        sourceType: "milestone",
        sourceId: source.id,
        sourceName: source.name,
        sourceProjectName: projectMap.get(source.projectId)?.name ?? null,
        targetType: "milestone",
        targetId: target.id,
        targetName: target.name,
        targetProjectName: projectMap.get(target.projectId)?.name ?? null,
        depType: "finish_to_start",
        confidence: overlap >= 0.7 ? "high" : "medium",
        reason: `Milestone names share ${Math.round(overlap * 100)}% word overlap across different projects, suggesting a handoff or shared deliverable.`,
        suggestedLagDays: 0,
        isHard: false,
        source: "name_similarity",
        alreadyExists: false,
      });
    }
  }

  return suggestions;
}

function findTimelineOverlaps(
  milestones: Awaited<ReturnType<typeof loadProgrammeData>>["milestones"],
  projects: Awaited<ReturnType<typeof loadProgrammeData>>["projects"],
  projectMap: Awaited<ReturnType<typeof loadProgrammeData>>["projectMap"],
): DependencySuggestion[] {
  const suggestions: DependencySuggestion[] = [];
  const seen = new Set<string>();

  // Group milestones by initiative for scoped comparisons (avoids global O(n²))
  const projectInitiativeMap = new Map(projects.map((p) => [p.id, p.initiativeId]));
  const byInitiative = new Map<number, typeof milestones>();
  for (const ms of milestones) {
    const initId = projectInitiativeMap.get(ms.projectId);
    if (initId == null) continue;
    const arr = byInitiative.get(initId) ?? [];
    arr.push(ms);
    byInitiative.set(initId, arr);
  }

  for (const [, initMs] of byInitiative) {
    // Build sorted lists: milestones with dueDates, milestones with startDates
    const withDue = initMs.filter((m) => m.dueDate).map((m) => ({ ms: m, dueTime: new Date(m.dueDate!).getTime() }));
    const withStart = initMs.filter((m) => m.startDate).map((m) => ({ ms: m, startTime: new Date(m.startDate!).getTime() }));

    if (withDue.length === 0 || withStart.length === 0) continue;

    // Sort both by date
    withDue.sort((a, b) => a.dueTime - b.dueTime);
    withStart.sort((a, b) => a.startTime - b.startTime);

    // Sweep: for each dueDate, find startDates within ±7 days
    let startIdx = 0;
    const WINDOW = 7 * 86400000;
    for (const due of withDue) {
      // Advance startIdx to first startDate within window
      while (startIdx < withStart.length && withStart[startIdx].startTime < due.dueTime - WINDOW) startIdx++;

      for (let j = startIdx; j < withStart.length; j++) {
        const start = withStart[j];
        if (start.startTime > due.dueTime + WINDOW) break;
        if (due.ms.projectId === start.ms.projectId) continue;

        const gap = Math.round((start.startTime - due.dueTime) / 86400000);
        const key = `timeline:${due.ms.id}->${start.ms.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        suggestions.push({
          sourceType: "milestone",
          sourceId: due.ms.id,
          sourceName: due.ms.name,
          sourceProjectName: projectMap.get(due.ms.projectId)?.name ?? null,
          targetType: "milestone",
          targetId: start.ms.id,
          targetName: start.ms.name,
          targetProjectName: projectMap.get(start.ms.projectId)?.name ?? null,
          depType: "finish_to_start",
          confidence: "medium",
          reason: `Milestone "${due.ms.name}" ends ${Math.abs(gap)} day(s) ${gap >= 0 ? "before" : "after"} "${start.ms.name}" starts, suggesting a handoff dependency.`,
          suggestedLagDays: gap,
          isHard: false,
          source: "timeline_overlap",
          alreadyExists: false,
        });
      }
    }
  }

  return suggestions;
}

function findBudgetDependencies(
  projects: Awaited<ReturnType<typeof loadProgrammeData>>["projects"],
  milestonesByProject: Awaited<ReturnType<typeof loadProgrammeData>>["milestonesByProject"],
): DependencySuggestion[] {
  const suggestions: DependencySuggestion[] = [];
  const seen = new Set<string>();

  // Group projects by departmentId
  const projectsByDept = new Map<number, typeof projects>();
  for (const p of projects) {
    if (!p.departmentId) continue;
    const arr = projectsByDept.get(p.departmentId) ?? [];
    arr.push(p);
    projectsByDept.set(p.departmentId, arr);
  }

  for (const [_deptId, deptProjects] of projectsByDept) {
    if (deptProjects.length < 2) continue;

    for (const projA of deptProjects) {
      if (!projA.budget || projA.budget === 0) continue;
      const spentRatio = (projA.budgetSpent ?? 0) / projA.budget;
      if (spentRatio < 0.8) continue;

      for (const projB of deptProjects) {
        if (projA.id === projB.id) continue;

        // Check if projB hasn't really started (progress < 5%)
        const bMilestones = milestonesByProject.get(projB.id) ?? [];
        const avgProgress =
          bMilestones.length > 0
            ? bMilestones.reduce((s, m) => s + (m.progress ?? 0), 0) / bMilestones.length
            : 0;
        if (avgProgress >= 5) continue;

        const key = `budget:${projA.id}->${projB.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        suggestions.push({
          sourceType: "project",
          sourceId: projA.id,
          sourceName: projA.name,
          sourceProjectName: projA.name,
          targetType: "project",
          targetId: projB.id,
          targetName: projB.name,
          targetProjectName: projB.name,
          depType: "budget",
          confidence: "medium",
          reason: `Both projects draw from the same department budget. ${projA.name} has consumed ${Math.round(spentRatio * 100)}% of its budget, which may constrain funding for ${projB.name}.`,
          suggestedLagDays: 0,
          isHard: false,
          source: "budget_link",
          alreadyExists: false,
        });
      }
    }
  }

  return suggestions;
}

function findRiskCascades(
  risks: Awaited<ReturnType<typeof loadProgrammeData>>["risks"],
  existingDeps: Awaited<ReturnType<typeof loadProgrammeData>>["existingDeps"],
  projectMap: Awaited<ReturnType<typeof loadProgrammeData>>["projectMap"],
): DependencySuggestion[] {
  const suggestions: DependencySuggestion[] = [];
  const seen = new Set<string>();

  // Build a map of project dependencies: projectA -> [projectB, ...]
  const projectDeps = new Map<number, Set<number>>();
  for (const dep of existingDeps) {
    // Find the project IDs involved
    let sourceProjectId: number | null = null;
    let targetProjectId: number | null = null;

    if (dep.sourceType === "project") {
      sourceProjectId = dep.sourceId;
    }
    if (dep.targetType === "project") {
      targetProjectId = dep.targetId;
    }
    // For milestone-level deps, we need to get the project but we don't have
    // the milestone data here yet. We'll handle project-level only for simplicity.

    if (sourceProjectId && targetProjectId && sourceProjectId !== targetProjectId) {
      const set = projectDeps.get(sourceProjectId) ?? new Set();
      set.add(targetProjectId);
      projectDeps.set(sourceProjectId, set);

      // Bidirectional awareness
      const reverseSet = projectDeps.get(targetProjectId) ?? new Set();
      reverseSet.add(sourceProjectId);
      projectDeps.set(targetProjectId, reverseSet);
    }
  }

  for (const risk of risks) {
    if (risk.status !== "open") continue;
    if (!risk.projectId) continue;

    const linkedProjects = projectDeps.get(risk.projectId);
    if (!linkedProjects) continue;

    for (const depProjectId of linkedProjects) {
      const key = `risk:${risk.id}->${depProjectId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sourceProject = projectMap.get(risk.projectId);
      const targetProject = projectMap.get(depProjectId);
      if (!targetProject) continue;

      suggestions.push({
        sourceType: "risk",
        sourceId: risk.id,
        sourceName: risk.title,
        sourceProjectName: sourceProject?.name ?? null,
        targetType: "project",
        targetId: depProjectId,
        targetName: targetProject.name,
        targetProjectName: targetProject.name,
        depType: "risk",
        confidence: "low",
        reason: `Risk "${risk.title}" on ${sourceProject?.name ?? "unknown project"} may impact ${targetProject.name} through an existing dependency chain.`,
        suggestedLagDays: 0,
        isHard: false,
        source: "heuristic",
        alreadyExists: false,
      });
    }
  }

  return suggestions;
}

function findSequentialInitiativeMilestones(
  projects: Awaited<ReturnType<typeof loadProgrammeData>>["projects"],
  milestonesByProject: Awaited<ReturnType<typeof loadProgrammeData>>["milestonesByProject"],
  projectMap: Awaited<ReturnType<typeof loadProgrammeData>>["projectMap"],
): DependencySuggestion[] {
  const suggestions: DependencySuggestion[] = [];
  const seen = new Set<string>();

  // Pre-compute last milestone (by dueDate) and first milestone (by startDate) per project
  const lastMsByProject = new Map<number, typeof milestonesByProject extends Map<number, (infer T)[]> ? T : never>();
  const firstMsByProject = new Map<number, typeof milestonesByProject extends Map<number, (infer T)[]> ? T : never>();
  for (const [projId, ms] of milestonesByProject) {
    let latest: typeof ms[0] | null = null;
    let latestTime = -Infinity;
    let earliest: typeof ms[0] | null = null;
    let earliestTime = Infinity;
    for (const m of ms) {
      if (m.dueDate) {
        const t = new Date(m.dueDate).getTime();
        if (t > latestTime) { latestTime = t; latest = m; }
      }
      if (m.startDate) {
        const t = new Date(m.startDate).getTime();
        if (t < earliestTime) { earliestTime = t; earliest = m; }
      }
    }
    if (latest) lastMsByProject.set(projId, latest);
    if (earliest) firstMsByProject.set(projId, earliest);
  }

  // Group projects by initiativeId
  const projectsByInitiative = new Map<number, typeof projects>();
  for (const p of projects) {
    const arr = projectsByInitiative.get(p.initiativeId) ?? [];
    arr.push(p);
    projectsByInitiative.set(p.initiativeId, arr);
  }

  for (const [, initProjects] of projectsByInitiative) {
    if (initProjects.length < 2) continue;

    for (const projA of initProjects) {
      const lastMsA = lastMsByProject.get(projA.id);
      if (!lastMsA?.dueDate) continue;

      for (const projB of initProjects) {
        if (projA.id === projB.id) continue;

        const firstMsB = firstMsByProject.get(projB.id);
        if (!firstMsB?.startDate) continue;

        const gap = daysBetween(lastMsA.dueDate, firstMsB.startDate);
        if (gap === null || gap < 0) continue;

        const key = `seq:${lastMsA.id}->${firstMsB.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        suggestions.push({
          sourceType: "milestone",
          sourceId: lastMsA.id,
          sourceName: lastMsA.name,
          sourceProjectName: projA.name,
          targetType: "milestone",
          targetId: firstMsB.id,
          targetName: firstMsB.name,
          targetProjectName: projB.name,
          depType: "finish_to_start",
          confidence: "medium",
          reason: `Within the same initiative, "${projA.name}" completes before "${projB.name}" begins, suggesting a sequential handoff between the last milestone of one and the first of the other.`,
          suggestedLagDays: gap,
          isHard: false,
          source: "heuristic",
          alreadyExists: false,
        });
      }
    }
  }

  return suggestions;
}

// ─────────────────────────────────────────────────────────────
// Phase 2: AI Enhancement
// ─────────────────────────────────────────────────────────────

async function getAiSuggestions(
  projects: Awaited<ReturnType<typeof loadProgrammeData>>["projects"],
  milestones: Awaited<ReturnType<typeof loadProgrammeData>>["milestones"],
  risks: Awaited<ReturnType<typeof loadProgrammeData>>["risks"],
  projectMap: Awaited<ReturnType<typeof loadProgrammeData>>["projectMap"],
  heuristicSuggestions: DependencySuggestion[],
): Promise<DependencySuggestion[]> {
  if (!anthropic) return [];

  // Limit payload size to avoid timeouts — send at most 50 projects, 200 milestones, 30 risks
  const limitedProjects = projects.slice(0, 50);
  const limitedProjectIds = new Set(limitedProjects.map((p) => p.id));
  const limitedMilestones = milestones.filter((m) => limitedProjectIds.has(m.projectId)).slice(0, 200);
  const limitedRisks = risks.filter((r) => r.status === "open").slice(0, 30);

  const programmeContext = {
    projects: limitedProjects.map((p) => ({
      id: p.id, name: p.name, status: p.status, startDate: p.startDate,
      targetDate: p.targetDate, departmentId: p.departmentId, initiativeId: p.initiativeId,
    })),
    milestones: limitedMilestones.map((m) => ({
      id: m.id, name: m.name, projectId: m.projectId, status: m.status,
      startDate: m.startDate, dueDate: m.dueDate,
    })),
    risks: limitedRisks.map((r) => ({
      id: r.id, title: r.title, category: r.category,
      probability: r.probability, impact: r.impact, riskScore: r.riskScore, projectId: r.projectId,
    })),
    alreadySuggested: heuristicSuggestions.slice(0, 50).map((s) => ({
      source: `${s.sourceType}:${s.sourceId}`,
      target: `${s.targetType}:${s.targetId}`,
      depType: s.depType,
    })),
  };

  const systemPrompt = `You are a senior programme management advisor. Analyse the following programme data (projects, milestones, risks, budgets) and identify dependencies that should exist but are not currently registered. Focus on:
(1) Technical dependencies where one deliverable needs another as input
(2) Resource dependencies where the same team/vendor works on multiple items
(3) Risk dependencies where a risk in one area cascades to another
(4) Budget dependencies where funding constraints affect sequencing

The "alreadySuggested" field shows dependencies already identified by heuristic analysis. Do NOT duplicate those.

Return ONLY a valid JSON array of objects with this exact structure (no markdown, no explanation):
[{
  "sourceType": "milestone" | "project" | "risk",
  "sourceId": <number>,
  "targetType": "milestone" | "project",
  "targetId": <number>,
  "depType": "finish_to_start" | "start_to_start" | "finish_to_finish" | "resource" | "risk" | "budget",
  "confidence": "high" | "medium" | "low",
  "reason": "<explanation>",
  "suggestedLagDays": <number>,
  "isHard": <boolean>
}]

If no additional dependencies are found, return an empty array: []`;

  let message: any;
  try {
    const apiCall = anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyse this programme data and suggest missing dependencies:\n\n${JSON.stringify(programmeContext, null, 2)}`,
        },
      ],
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("AI dependency analysis timed out after 30 seconds")),
        30_000,
      ),
    );
    message = await Promise.race([apiCall, timeout]);
  } catch {
    // AI enhancement failed gracefully; return empty
    return [];
  }

  // Extract response text
  const responseText = message.content
    .filter((block: any): block is { type: "text"; text: string } => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");

  // Parse JSON from response
  let parsed: any[];
  try {
    // Try direct parse first, then look for JSON array in text
    const trimmed = responseText.trim();
    if (trimmed.startsWith("[")) {
      parsed = JSON.parse(trimmed);
    } else {
      const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      parsed = JSON.parse(jsonMatch[0]);
    }
    if (!Array.isArray(parsed)) return [];
  } catch {
    return [];
  }

  // Convert AI output to DependencySuggestion format
  const aiSuggestions: DependencySuggestion[] = [];

  for (const item of parsed) {
    if (!item.sourceType || !item.sourceId || !item.targetType || !item.targetId) continue;

    // Resolve names
    let sourceName = "";
    let sourceProjectName: string | null = null;
    let targetName = "";
    let targetProjectName: string | null = null;

    if (item.sourceType === "milestone") {
      const ms = milestones.find((m) => m.id === item.sourceId);
      if (ms) {
        sourceName = ms.name;
        sourceProjectName = projectMap.get(ms.projectId)?.name ?? null;
      }
    } else if (item.sourceType === "project") {
      const proj = projectMap.get(item.sourceId);
      if (proj) {
        sourceName = proj.name;
        sourceProjectName = proj.name;
      }
    } else if (item.sourceType === "risk") {
      const risk = risks.find((r) => r.id === item.sourceId);
      if (risk) {
        sourceName = risk.title;
        sourceProjectName = risk.projectId ? (projectMap.get(risk.projectId)?.name ?? null) : null;
      }
    }

    if (item.targetType === "milestone") {
      const ms = milestones.find((m) => m.id === item.targetId);
      if (ms) {
        targetName = ms.name;
        targetProjectName = projectMap.get(ms.projectId)?.name ?? null;
      }
    } else if (item.targetType === "project") {
      const proj = projectMap.get(item.targetId);
      if (proj) {
        targetName = proj.name;
        targetProjectName = proj.name;
      }
    }

    // Skip if we couldn't resolve names (invalid IDs from AI)
    if (!sourceName || !targetName) continue;

    aiSuggestions.push({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      sourceName,
      sourceProjectName,
      targetType: item.targetType,
      targetId: item.targetId,
      targetName,
      targetProjectName,
      depType: item.depType ?? "finish_to_start",
      confidence: item.confidence ?? "low",
      reason: item.reason ?? "Identified by AI analysis.",
      suggestedLagDays: item.suggestedLagDays ?? 0,
      isHard: item.isHard ?? false,
      source: "ai",
      alreadyExists: false,
    });
  }

  return aiSuggestions;
}

// ─────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────

export async function findDependencies(): Promise<DependencyFinderResult> {
  const data = await loadProgrammeData();

  const {
    projects,
    milestones,
    risks,
    existingDeps,
    projectMap,
    milestonesByProject,
    existingDepKeys,
  } = data;

  // Handle empty data gracefully
  if (projects.length === 0 && milestones.length === 0) {
    return {
      suggestions: [],
      analysisMethod: "heuristic",
      totalAnalysed: { milestones: 0, projects: 0, risks: 0 },
      existingDependencies: existingDeps.length,
      newSuggestionsCount: 0,
    };
  }

  // ── Phase 1: Heuristic rules ──────────────────────────────

  const heuristicSuggestions: DependencySuggestion[] = [
    ...findNameSimilarities(milestones, projectMap),
    ...findTimelineOverlaps(milestones, projects, projectMap),
    ...findBudgetDependencies(projects, milestonesByProject),
    ...findRiskCascades(risks, existingDeps, projectMap),
    ...findSequentialInitiativeMilestones(projects, milestonesByProject, projectMap),
  ];

  // ── Phase 2: AI Enhancement (only if ANTHROPIC_API_KEY is set) ──

  let aiSuggestions: DependencySuggestion[] = [];
  let analysisMethod: "heuristic" | "ai_enhanced" = "heuristic";

  if (anthropic) {
    aiSuggestions = await getAiSuggestions(
      projects,
      milestones,
      risks,
      projectMap,
      heuristicSuggestions,
    );
    if (aiSuggestions.length > 0) {
      analysisMethod = "ai_enhanced";
    }
  }

  // ── Combine & deduplicate ─────────────────────────────────

  const allSuggestions = [...heuristicSuggestions, ...aiSuggestions];

  // Deduplicate by source+target pair
  const uniqueMap = new Map<string, DependencySuggestion>();
  for (const suggestion of allSuggestions) {
    const key = depKey(suggestion.sourceType, suggestion.sourceId, suggestion.targetType, suggestion.targetId);
    // Prefer higher confidence / heuristic over AI for duplicates
    const existing = uniqueMap.get(key);
    if (!existing) {
      uniqueMap.set(key, suggestion);
    } else if (
      suggestion.source !== "ai" && existing.source === "ai"
    ) {
      uniqueMap.set(key, suggestion);
    }
  }

  const suggestions = Array.from(uniqueMap.values());

  // ── Mark already-existing dependencies ────────────────────

  for (const suggestion of suggestions) {
    // Check both directions for milestone/project types that exist in the DB schema
    const fwdKey = depKey(suggestion.sourceType, suggestion.sourceId, suggestion.targetType, suggestion.targetId);
    const revKey = depKey(suggestion.targetType, suggestion.targetId, suggestion.sourceType, suggestion.sourceId);
    if (existingDepKeys.has(fwdKey) || existingDepKeys.has(revKey)) {
      suggestion.alreadyExists = true;
    }
  }

  // ── Sort: high confidence first, then heuristic before AI ─

  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sourceOrder: Record<string, number> = {
    name_similarity: 0,
    timeline_overlap: 1,
    budget_link: 2,
    heuristic: 3,
    ai: 4,
  };

  suggestions.sort((a, b) => {
    const confDiff = (confidenceOrder[a.confidence] ?? 2) - (confidenceOrder[b.confidence] ?? 2);
    if (confDiff !== 0) return confDiff;
    return (sourceOrder[a.source] ?? 4) - (sourceOrder[b.source] ?? 4);
  });

  return {
    suggestions,
    analysisMethod,
    totalAnalysed: {
      milestones: milestones.length,
      projects: projects.length,
      risks: risks.filter((r) => r.status === "open").length,
    },
    existingDependencies: existingDeps.length,
    newSuggestionsCount: suggestions.filter((s) => !s.alreadyExists).length,
  };
}
