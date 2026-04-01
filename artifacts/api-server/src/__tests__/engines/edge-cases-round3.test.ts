/**
 * Edge Cases Round 3 — Cross-Engine Consistency & New Engine Logic
 *
 * Tests cover:
 *   1. New engines (9-11): weekly-digest, anomaly, dependency-finder logic verification
 *   2. Cross-engine consistency: shared imports, AI safety patterns, CPI formula parity
 *   3. KPI engine edge cases: extreme numbers, direction=lower rate PI inversion,
 *      milestone duration=0, negative velocity
 *   4. Scenario engine edge cases: adjustWeight, budget capping, pillar recalc, financialImpact
 *   5. Analytics UI completeness: 11 tabs, panel wiring, API endpoints, checkbox
 *
 * Does NOT duplicate: engine exports, function existence, interface fields,
 *   weight cascade order, execution placeholder regex, analytics route registration,
 *   effectiveWeight display, email transport order.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────

const LIB = path.resolve(__dirname, "../../lib");
const ROUTES = path.resolve(__dirname, "../../routes");
const PAGES = path.resolve(__dirname, "../../../../strategy-pmo/src/pages");
const FE_LIB = path.resolve(__dirname, "../../../../strategy-pmo/src/lib");

function readSource(relativeTo: string, file: string): string {
  return fs.readFileSync(path.join(relativeTo, file), "utf-8");
}

// Pre-load all source files used across tests
const anomalySrc = readSource(LIB, "engine-anomaly.ts");
const weeklyDigestSrc = readSource(LIB, "engine-weekly-digest.ts");
const depFinderSrc = readSource(LIB, "engine-dependency-finder.ts");
const scenarioSrc = readSource(LIB, "engine-scenario.ts");
const evmSrc = readSource(LIB, "engine-evm.ts");
const budgetForecastSrc = readSource(LIB, "engine-budget-forecast.ts");
const aiAdvisorSrc = readSource(LIB, "engine-ai-advisor.ts");
const boardReportSrc = readSource(LIB, "engine-board-report.ts");
const analyticsTsx = readSource(PAGES, "analytics.tsx");
const kpiEngineSrc = readSource(FE_LIB, "kpi-engine.ts");

// ═════════════════════════════════════════════════════════════════
// 1. NEW ENGINES (9-11) LOGIC VERIFICATION
// ═════════════════════════════════════════════════════════════════

describe("Engine 9: engine-weekly-digest.ts — logic verification", () => {
  test("exports ProgrammeWeeklyDigest interface with highlights array", () => {
    expect(weeklyDigestSrc).toContain("highlights: string[]");
  });

  test("exports ProgrammeWeeklyDigest interface with concerns array", () => {
    expect(weeklyDigestSrc).toContain("concerns: string[]");
  });

  test("sorts projects delayed-first via statusOrder mapping", () => {
    expect(weeklyDigestSrc).toContain("delayed: 0");
    expect(weeklyDigestSrc).toContain("at_risk: 1");
    expect(weeklyDigestSrc).toContain("on_track: 3");
    expect(weeklyDigestSrc).toContain("completed: 4");
  });

  test("computes progressDelta from currentProgress minus progressLastWeek", () => {
    expect(weeklyDigestSrc).toMatch(/progressDelta\s*=.*currentProgress\s*-\s*progressLastWeek/);
  });

  test("checks weekly report submission via reportsByProject lookup", () => {
    expect(weeklyDigestSrc).toContain("weeklyReportSubmitted");
    expect(weeklyDigestSrc).toMatch(/report\s*!=\s*null/);
  });

  test("flags missing weekly report only after Wednesday (dayOfWeek >= 3)", () => {
    expect(weeklyDigestSrc).toContain("dayOfWeek >= 3");
    expect(weeklyDigestSrc).toContain("Weekly report missing");
  });

  test("computes velocityPerDay as progressDelta / 7", () => {
    expect(weeklyDigestSrc).toMatch(/progressDelta\s*\/\s*7/);
  });

  test("generates highlight for milestones completed this week", () => {
    expect(weeklyDigestSrc).toContain("milestone${milestonesCompletedThisWeek > 1");
    expect(weeklyDigestSrc).toContain("completed this week");
  });

  test("generates concern for projects with zero progress", () => {
    expect(weeklyDigestSrc).toContain("projectsWithNoProgress");
    expect(weeklyDigestSrc).toContain("made zero progress this week");
  });

  test("generates concern for budget at >90%", () => {
    expect(weeklyDigestSrc).toContain("spentPct > 90");
    expect(weeklyDigestSrc).toMatch(/budget at.*%/i);
  });

  test("filters out cancelled projects", () => {
    expect(weeklyDigestSrc).toMatch(/status.*!=.*cancelled/);
  });
});

describe("Engine 10: engine-anomaly.ts — logic verification", () => {
  test("defines exactly 10 anomaly types in the AnomalyType union", () => {
    const types = [
      "progress_spike", "progress_stagnant", "budget_burn_mismatch",
      "duplicate_report", "ghost_project", "velocity_collapse",
      "risk_ignored", "approval_stale", "weight_gaming", "weekend_warrior",
    ];
    for (const t of types) {
      expect(anomalySrc).toContain(`"${t}"`);
    }
  });

  test("defines 4 severity levels: critical, high, medium, low", () => {
    expect(anomalySrc).toContain('"critical"');
    expect(anomalySrc).toContain('"high"');
    expect(anomalySrc).toContain('"medium"');
    expect(anomalySrc).toContain('"low"');
  });

  test("severityOrder maps critical=0, high=1, medium=2, low=3", () => {
    expect(anomalySrc).toContain("critical: 0");
    expect(anomalySrc).toContain("high: 1");
    expect(anomalySrc).toContain("medium: 2");
    expect(anomalySrc).toContain("low: 3");
  });

  test("weekend_warrior checks day of week via isWeekend helper", () => {
    expect(anomalySrc).toContain("isWeekend");
    expect(anomalySrc).toMatch(/day\s*===\s*0\s*\|\|\s*day\s*===\s*6/);
  });

  test("weekend_warrior triggers when >50% of updates are on weekends", () => {
    expect(anomalySrc).toContain("weekendPct > 50");
  });

  test("duplicate_report compares keyAchievements text between latest two reports", () => {
    expect(anomalySrc).toContain("keyAchievements");
    expect(anomalySrc).toContain("latestText === previousText");
  });

  test("duplicate_report trims and lowercases before comparison", () => {
    expect(anomalySrc).toMatch(/\.trim\(\)\.toLowerCase\(\)/);
  });

  test("progress_spike checks for >30% jump in a single update", () => {
    expect(anomalySrc).toContain("jump > 30");
    expect(anomalySrc).toContain("progress_spike");
  });

  test("progress_stagnant requires milestone stuck at partial progress for 30+ days", () => {
    expect(anomalySrc).toContain("staleDays >= 30");
    expect(anomalySrc).toContain("progress_stagnant");
  });

  test("progress_stagnant escalates to high severity at 45+ days", () => {
    expect(anomalySrc).toContain("staleDays >= 45");
  });

  test("ghost_project requires active status, budget > 0, progress < 5, no activity", () => {
    expect(anomalySrc).toContain("ghost_project");
    expect(anomalySrc).toContain("currentProgress < 5");
    expect(anomalySrc).toContain("budget > 0");
  });

  test("velocity_collapse compares last-30 vs prev-30 day velocity at 50% threshold", () => {
    expect(anomalySrc).toContain("velocity_collapse");
    expect(anomalySrc).toContain("currentVelocity < previousVelocity * 0.5");
  });

  test("risk_ignored checks for open risks with riskScore >= 9 and no mitigations", () => {
    expect(anomalySrc).toContain("risk_ignored");
    expect(anomalySrc).toContain("risk.riskScore < 9");
    expect(anomalySrc).toContain("mitigations.length === 0");
  });

  test("approval_stale triggers for milestones submitted >14 days ago", () => {
    expect(anomalySrc).toContain("approval_stale");
    expect(anomalySrc).toContain("submittedDays > 14");
  });

  test("weight_gaming detects progress set to exactly 99%", () => {
    expect(anomalySrc).toContain("weight_gaming");
    expect(anomalySrc).toContain("m.progress === 99");
  });

  test("budget_burn_mismatch has critical (high spend, low progress) and medium (low spend, high progress) cases", () => {
    expect(anomalySrc).toContain("spentPct > 70 && currentProgress < 40");
    expect(anomalySrc).toContain("spentPct < 20 && currentProgress > 60");
  });

  test("sorts anomalies by severity (critical first) then detectedAt", () => {
    expect(anomalySrc).toMatch(/anomalies\.sort/);
    expect(anomalySrc).toContain("severityOrder[a.severity]");
  });

  test("excludes cancelled projects from detection", () => {
    expect(anomalySrc).toMatch(/NOT IN.*cancelled/i);
  });
});

describe("Engine 11: engine-dependency-finder.ts — logic verification", () => {
  test("has 5 heuristic strategy functions", () => {
    const strategies = [
      "findNameSimilarities",
      "findTimelineOverlaps",
      "findBudgetDependencies",
      "findRiskCascades",
      "findSequentialInitiativeMilestones",
    ];
    for (const fn of strategies) {
      expect(depFinderSrc).toContain(`function ${fn}`);
    }
  });

  test("has a STOP_WORDS set with common project terms filtered out", () => {
    expect(depFinderSrc).toContain("STOP_WORDS");
    expect(depFinderSrc).toContain('"phase"');
    expect(depFinderSrc).toContain('"project"');
    expect(depFinderSrc).toContain('"the"');
    expect(depFinderSrc).toContain('"and"');
  });

  test("wordOverlap computes shared words / max length", () => {
    expect(depFinderSrc).toContain("function wordOverlap");
    expect(depFinderSrc).toContain("Math.max(wordsA.length, wordsB.length)");
  });

  test("wordOverlap returns 0 for empty arrays", () => {
    expect(depFinderSrc).toMatch(/wordsA\.length\s*===\s*0\s*\|\|\s*wordsB\.length\s*===\s*0.*return 0/);
  });

  test("timeline overlap uses 7-day window (gap >= -7 && gap <= 7)", () => {
    expect(depFinderSrc).toContain("gap >= -7 && gap <= 7");
  });

  test("budget dependency uses 80% threshold (spentRatio < 0.8)", () => {
    expect(depFinderSrc).toContain("spentRatio < 0.8");
  });

  test("AI phase uses try-catch around anthropic import", () => {
    expect(depFinderSrc).toMatch(/try\s*\{[\s\S]*?require.*anthropic[\s\S]*?\}\s*catch/);
  });

  test("AI phase has Promise.race timeout pattern", () => {
    expect(depFinderSrc).toContain("Promise.race");
    expect(depFinderSrc).toContain("timed out");
  });

  test("handles empty data gracefully (returns empty suggestions)", () => {
    expect(depFinderSrc).toContain("projects.length === 0 && milestones.length === 0");
    expect(depFinderSrc).toContain("suggestions: []");
  });

  test("deduplicates suggestions by source+target pair, preferring heuristic over AI", () => {
    expect(depFinderSrc).toContain('suggestion.source !== "ai" && existing.source === "ai"');
  });

  test("marks already-existing dependencies in both forward and reverse direction", () => {
    expect(depFinderSrc).toContain("existingDepKeys.has(fwdKey) || existingDepKeys.has(revKey)");
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. CROSS-ENGINE CONSISTENCY
// ═════════════════════════════════════════════════════════════════

describe("Cross-engine consistency", () => {
  test("all engines using projectProgress() import it from spmo-calc", () => {
    const enginesUsingProgress = [
      { name: "engine-anomaly", src: anomalySrc },
      { name: "engine-weekly-digest", src: weeklyDigestSrc },
      { name: "engine-evm", src: evmSrc },
      { name: "engine-budget-forecast", src: budgetForecastSrc },
    ];
    for (const eng of enginesUsingProgress) {
      expect(eng.src).toMatch(/import\s*\{[^}]*projectProgress[^}]*\}\s*from\s*["']\.\/spmo-calc["']/);
    }
  });

  test("all AI-powered engines (advisor, board-report, dependency-finder) have try-catch around anthropic import", () => {
    const aiEngines = [
      { name: "engine-ai-advisor", src: aiAdvisorSrc },
      { name: "engine-board-report", src: boardReportSrc },
      { name: "engine-dependency-finder", src: depFinderSrc },
    ];
    for (const eng of aiEngines) {
      // Each should have a try { require("...anthropic...") } catch pattern
      expect(eng.src).toMatch(/try\s*\{[\s\S]*?require[\s\S]*?anthropic[\s\S]*?\}\s*catch/);
    }
  });

  test("all AI engines have Promise.race timeout pattern", () => {
    const aiEngines = [
      { name: "engine-ai-advisor", src: aiAdvisorSrc },
      { name: "engine-board-report", src: boardReportSrc },
      { name: "engine-dependency-finder", src: depFinderSrc },
    ];
    for (const eng of aiEngines) {
      expect(eng.src).toContain("Promise.race");
    }
  });

  test("weekly digest and anomaly both filter out cancelled projects", () => {
    expect(weeklyDigestSrc).toMatch(/status.*!=.*cancelled/);
    expect(anomalySrc).toMatch(/NOT IN.*cancelled/i);
  });

  test("EVM and budget-forecast both compute CPI as earnedValue / actualCost (same formula pattern)", () => {
    // EVM: cpi = ac > 0 ? ev / ac : 1
    expect(evmSrc).toMatch(/cpi\s*=\s*ac\s*>\s*0\s*\?\s*ev\s*\/\s*ac\s*:\s*1/);
    // Budget forecast: cpi = spent > 0 ? earnedValue / spent : 1
    expect(budgetForecastSrc).toMatch(/cpi\s*=\s*spent\s*>\s*0\s*\?\s*earnedValue\s*\/\s*spent\s*:\s*1/);
  });

  test("EVM and budget-forecast both guard against division by zero in CPI", () => {
    expect(evmSrc).toContain("ac > 0");
    expect(budgetForecastSrc).toContain("spent > 0");
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. KPI ENGINE EDGE CASES
// ═════════════════════════════════════════════════════════════════

describe("KPI engine edge cases (source-code verification)", () => {
  test("large numbers: no raw division without guards (always checks expected > 0 or uses Math.max)", () => {
    // Cumulative: expected > 0 ? actual / expected : ...
    expect(kpiEngineSrc).toMatch(/expected\s*>\s*0\s*\?\s*actual\s*\/\s*expected/);
    // Rate lower: target / Math.max(actual, 0.01)
    expect(kpiEngineSrc).toContain("Math.max(actual, 0.01)");
  });

  test("direction=lower with rate KPI uses inverted PI formula: target / max(actual, 0.01)", () => {
    expect(kpiEngineSrc).toMatch(
      /direction\s*===\s*"higher"\s*\?\s*actual\s*\/\s*target\s*:\s*target\s*\/\s*Math\.max\(actual,\s*0\.01\)/,
    );
  });

  test("milestone KPI with milestoneDuration uses ?? 180 fallback for null/undefined", () => {
    expect(kpiEngineSrc).toContain("kpi.milestoneDuration ?? 180");
  });

  test("milestone at-risk threshold scales to 10% of duration with min 7, max 60", () => {
    expect(kpiEngineSrc).toContain("Math.min(60, Math.max(7, Math.round(duration * 0.10)))");
  });

  test("velocity calculation handles negative monthlyRate (no abs() applied)", () => {
    // The velocity function computes change = actual - refValue, which can be negative
    expect(kpiEngineSrc).toContain("const change = actual - refValue");
    expect(kpiEngineSrc).toContain("const dailyRate = change / daysBetween");
    expect(kpiEngineSrc).toContain("const monthlyRate = dailyRate * 30.44");
  });

  test("target=0 (falsy) triggers not-started guard for non-milestone KPIs", () => {
    expect(kpiEngineSrc).toMatch(/if\s*\(!kpi\.target\)\s*return\s*\{[^}]*status:\s*"not-started"/);
    expect(kpiEngineSrc).toContain("No target set");
  });

  test("actual=null triggers not-started guard", () => {
    expect(kpiEngineSrc).toMatch(/kpi\.actual\s*==\s*null/);
    expect(kpiEngineSrc).toContain("No actual value recorded");
  });

  test("velocity reliability requires 3+ data points before overriding status", () => {
    expect(kpiEngineSrc).toContain("vel.dataPoints >= 3");
    expect(kpiEngineSrc).toContain("function velocityReliable");
  });

  test("trend computation uses 3% threshold for stability", () => {
    expect(kpiEngineSrc).toContain("Math.abs(delta) < 0.03");
    expect(kpiEngineSrc).toContain('"stable"');
    expect(kpiEngineSrc).toContain('"improving"');
    expect(kpiEngineSrc).toContain('"deteriorating"');
  });

  test("reduction KPI returns not-started when baseline <= target (misconfiguration)", () => {
    expect(kpiEngineSrc).toContain("totalReduction <= 0");
    expect(kpiEngineSrc).toContain("Misconfigured");
  });

  test("cumulative KPI tightened on-track threshold from 0.90 to 0.95", () => {
    expect(kpiEngineSrc).toContain("pi >= 0.95");
    expect(kpiEngineSrc).toContain("Tightened from 0.90 to 0.95");
  });

  test("late-period severity multiplier increases thresholds in second half", () => {
    expect(kpiEngineSrc).toContain("severityMultiplier = 1 + time.elapsedPct * 0.5");
    expect(kpiEngineSrc).toContain("Late-period severity applied");
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. SCENARIO ENGINE EDGE CASES
// ═════════════════════════════════════════════════════════════════

describe("Scenario engine edge cases", () => {
  test("adjustWeight flag exists in ScenarioInput interface", () => {
    expect(scenarioSrc).toContain("adjustWeight?: boolean");
  });

  test("budget_cut handler uses adjustWeight flag to scale project weight", () => {
    expect(scenarioSrc).toContain("input.adjustWeight");
    expect(scenarioSrc).toMatch(/budget_cut.*&&.*adjustWeight|adjustWeight.*budget_cut/s);
  });

  test("budget reduction capping uses Math.min to cap at project budget", () => {
    expect(scenarioSrc).toMatch(/Math\.min\(input\.budgetReduction.*project\.budget|Math\.min.*budgetReduction/);
  });

  test("budget reduction uses Math.max to ensure newBudget >= 0", () => {
    expect(scenarioSrc).toContain("Math.max(originalBudget - reduction, 0)");
  });

  test("pillar recalc in 'after' section uses weightedAvg (not in 'before' helper only)", () => {
    // The "after" section starts with afterInitiativeProgress computation
    const afterSection = scenarioSrc.substring(scenarioSrc.indexOf("afterPillarProgress"));
    expect(afterSection).toContain("weightedAvg");
  });

  test("financialImpact includes overSpent boolean", () => {
    expect(scenarioSrc).toContain("overSpent: boolean");
    expect(scenarioSrc).toContain("const overSpent = actualSpent > newBudget");
  });

  test("financialImpact includes originalCpi and newCpi", () => {
    expect(scenarioSrc).toContain("originalCpi");
    expect(scenarioSrc).toContain("newCpi");
  });

  test("financialImpact includes EAC (estimate at completion)", () => {
    expect(scenarioSrc).toContain("originalEac");
    expect(scenarioSrc).toContain("newEac");
  });

  test("delay scenario throws if delayDays <= 0", () => {
    expect(scenarioSrc).toContain("delayDays must be > 0");
  });

  test("budget_cut scenario throws if budgetReduction <= 0", () => {
    expect(scenarioSrc).toContain("budgetReduction must be > 0");
  });

  test("cancel scenario skips project in after calculation (continue)", () => {
    // When type=cancel, the project is skipped (continue) in the after loop
    expect(scenarioSrc).toMatch(/type\s*===\s*"cancel"[\s\S]*?continue/);
  });

  test("weightedAvg handles zero-weight items by falling back to simple average", () => {
    expect(scenarioSrc).toContain("if (totalWeight === 0)");
    expect(scenarioSrc).toContain("sum / items.length");
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. ANALYTICS UI COMPLETENESS
// ═════════════════════════════════════════════════════════════════

describe("Analytics UI completeness", () => {
  test("analytics.tsx has all 11 tabs defined", () => {
    const expectedTabs: string[] = [
      "overview", "weekly", "anomalies", "dependencies", "delays",
      "budget", "stakeholders", "evm", "scenario", "advisor", "board-report",
    ];
    for (const tab of expectedTabs) {
      expect(analyticsTsx).toContain(`"${tab}"`);
    }
  });

  test("WeeklyDigestPanel component exists and fetches /api/spmo/analytics/weekly-digest", () => {
    expect(analyticsTsx).toContain("function WeeklyDigestPanel");
    expect(analyticsTsx).toContain("/api/spmo/analytics/weekly-digest");
  });

  test("AnomalyPanel component exists and fetches /api/spmo/analytics/anomalies", () => {
    expect(analyticsTsx).toContain("function AnomalyPanel");
    expect(analyticsTsx).toContain("/api/spmo/analytics/anomalies");
  });

  test("DependencyFinderPanel component exists and fetches /api/spmo/analytics/dependency-suggestions", () => {
    expect(analyticsTsx).toContain("function DependencyFinderPanel");
    expect(analyticsTsx).toContain("/api/spmo/analytics/dependency-suggestions");
  });

  test("ScenarioPanel has adjustWeight checkbox (input type=checkbox)", () => {
    expect(analyticsTsx).toContain("ScenarioPanel");
    expect(analyticsTsx).toMatch(/type="checkbox".*adjustWeight|adjustWeight[\s\S]*?type="checkbox"/);
  });

  test("ScenarioPanel has project dropdown (select element)", () => {
    expect(analyticsTsx).toContain("Select project");
    expect(analyticsTsx).toMatch(/<select/);
  });

  test("AI Advisor panel has QUICK_QUESTIONS array", () => {
    expect(analyticsTsx).toContain("QUICK_QUESTIONS");
  });

  test("Board Report panel has generate button", () => {
    expect(analyticsTsx).toContain("Generate Board Report");
  });

  test("weekly tab key maps to WeeklyDigestPanel in rendering", () => {
    expect(analyticsTsx).toMatch(/activeTab\s*===\s*"weekly".*WeeklyDigestPanel|WeeklyDigestPanel.*activeTab.*weekly/s);
  });

  test("anomalies tab key maps to AnomalyPanel in rendering", () => {
    expect(analyticsTsx).toMatch(/activeTab\s*===\s*"anomalies".*AnomalyPanel|AnomalyPanel.*activeTab.*anomalies/s);
  });
});
