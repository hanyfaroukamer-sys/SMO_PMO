/**
 * Engine Logic Audit — source-code invariant tests
 *
 * Reads the actual TypeScript source files with fs.readFileSync and verifies
 * that critical patterns, exports, guard-rails, and formulas are present.
 * No database or runtime imports required.
 */

import * as fs from "fs";
import * as path from "path";

// ── helpers ──────────────────────────────────────────────────────
function backendSrc(file: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../lib", file),
    "utf-8",
  );
}

function frontendSrc(file: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../../strategy-pmo/src/lib", file),
    "utf-8",
  );
}

// ═════════════════════════════════════════════════════════════════
// 1. Predictive Delay Engine
// ═════════════════════════════════════════════════════════════════
describe("Predictive Delay Engine", () => {
  const src = backendSrc("engine-predictive-delay.ts");

  it("exports computeDelayPredictions function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computeDelayPredictions/);
  });

  it("contains 14-day threshold filter (delayDays <= 14)", () => {
    expect(src).toMatch(/delayDays\s*<=\s*14/);
  });

  it("has confidence level 'high' when dataPoints >= 5", () => {
    expect(src).toMatch(/dataPoints\.length\s*>=\s*5\s*\?\s*"high"/);
  });

  it("has confidence level 'medium' when dataPoints >= 3", () => {
    expect(src).toMatch(/dataPoints\.length\s*>=\s*3\s*\?\s*"medium"/);
  });

  it("has confidence level 'low' as fallback", () => {
    expect(src).toContain('"low"');
  });

  it("has trend detection: accelerating when ratio > 1.2", () => {
    expect(src).toMatch(/ratio\s*>\s*1\.2.*accelerating/s);
  });

  it("has trend detection: decelerating when ratio < 0.8", () => {
    expect(src).toMatch(/ratio\s*<\s*0\.8.*decelerating/s);
  });

  it("defaults trend to 'steady'", () => {
    expect(src).toMatch(/let\s+trend.*=\s*"steady"/);
  });

  it("sorts data points oldest-first before computing velocity", () => {
    expect(src).toMatch(/dataPoints\.sort\(\s*\(a,\s*b\)\s*=>\s*a\.date\.getTime\(\)\s*-\s*b\.date\.getTime\(\)/);
  });

  it("assigns oldest = dataPoints[0] and newest = dataPoints[last] AFTER sort", () => {
    // sort must appear before the oldest/newest assignments
    const sortIdx = src.indexOf("dataPoints.sort");
    const oldestIdx = src.indexOf("const oldest = dataPoints[0]");
    const newestIdx = src.indexOf("const newest = dataPoints[dataPoints.length - 1]");
    expect(sortIdx).toBeGreaterThan(-1);
    expect(oldestIdx).toBeGreaterThan(sortIdx);
    expect(newestIdx).toBeGreaterThan(sortIdx);
  });

  it("handles empty activity log without crash (length < 2 guard)", () => {
    expect(src).toMatch(/dataPoints\.length\s*<\s*2/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. Budget Forecast Engine
// ═════════════════════════════════════════════════════════════════
describe("Budget Forecast Engine", () => {
  const src = backendSrc("engine-budget-forecast.ts");

  it("exports computeBudgetForecasts function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computeBudgetForecasts/);
  });

  it("CPI returns null when spent === 0 (not a huge number)", () => {
    // When spent===0 && progress>0 the code pushes costPerformanceIndex: null
    expect(src).toMatch(/spent\s*===\s*0\s*&&\s*progress\s*>\s*0/);
    expect(src).toMatch(/costPerformanceIndex:\s*null/);
  });

  it("has 'insufficient_data' alert type", () => {
    expect(src).toContain('"insufficient_data"');
  });

  it("includes target date warning in reason for high-progress projects (progress > 80)", () => {
    expect(src).toMatch(/progress\s*>\s*80/);
    expect(src).toContain("target date");
  });

  it("handles zero budget projects (skips them via budget > 0 in SQL and budget <= 0 guard)", () => {
    expect(src).toMatch(/budget\s*>\s*0/);
    expect(src).toMatch(/budget\s*<=\s*0.*continue/s);
  });

  it("burnRate calculation uses elapsed days from startDate", () => {
    expect(src).toMatch(/const\s+burnRate\s*=\s*spent\s*\/\s*elapsedDays/);
  });

  it("elapsedDays is at least 1 via Math.max(1, ...)", () => {
    expect(src).toMatch(/Math\.max\(1,\s*elapsedMs/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. Stakeholder Engine
// ═════════════════════════════════════════════════════════════════
describe("Stakeholder Engine", () => {
  const src = backendSrc("engine-stakeholder.ts");

  it("exports computeStakeholderAlerts function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computeStakeholderAlerts/);
  });

  it("defines alert type approval_bottleneck", () => {
    expect(src).toContain('"approval_bottleneck"');
  });

  it("defines alert type missing_report", () => {
    expect(src).toContain('"missing_report"');
  });

  it("defines alert type department_overdue", () => {
    expect(src).toContain('"department_overdue"');
  });

  it("defines alert type inactive_pm", () => {
    expect(src).toContain('"inactive_pm"');
  });

  it("escalateTo field exists in StakeholderAlert interface", () => {
    expect(src).toMatch(/escalateTo\??\s*:\s*string/);
  });

  it("inactive PM check only considers active projects (status NOT IN completed/cancelled)", () => {
    // activeProjects is queried with status NOT IN ('completed', 'cancelled')
    expect(src).toMatch(/NOT\s+IN\s*\(\s*'completed',\s*'cancelled'\s*\)/);
  });

  it("approval bottleneck includes project owner in actionRequired (escalateNote)", () => {
    // actionRequired contains escalateNote which mentions projectOwnerName
    expect(src).toMatch(/actionRequired:.*escalateNote/s);
    expect(src).toMatch(/Escalate to.*projectOwnerName/s);
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. Critical Path Engine
// ═════════════════════════════════════════════════════════════════
describe("Critical Path Engine", () => {
  const src = backendSrc("engine-critical-path.ts");

  it("exports computeCriticalPath function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computeCriticalPath/);
  });

  it("CriticalPathResult interface has cycles array", () => {
    expect(src).toMatch(/cycles:\s*number\[\]/);
  });

  it("cycle detection: unvisited nodes go to cycles, not topoOrder", () => {
    expect(src).toMatch(/if\s*\(topoOrder\.length\s*<\s*nodes\.size\)/);
    expect(src).toMatch(/if\s*\(!topoOrder\.includes\(id\)\)\s*cycles\.push\(id\)/);
  });

  it("float calculation: float = latestStart - earliestStart", () => {
    expect(src).toMatch(/node\.float\s*=.*node\.latestStart\s*-\s*node\.earliestStart/);
  });

  it("handles empty dependency list — returns empty result when milestones.length === 0", () => {
    expect(src).toMatch(/milestones\.length\s*===\s*0/);
    expect(src).toMatch(/criticalPath:\s*\[\]/);
  });

  it("duration defaults to Math.max(1, ...) for zero-duration milestones", () => {
    expect(src).toMatch(/Math\.max\(1,\s*duration\)/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. EVM Engine
// ═════════════════════════════════════════════════════════════════
describe("EVM Engine", () => {
  const src = backendSrc("engine-evm.ts");

  it("exports computeEvmMetrics function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computeEvmMetrics/);
  });

  it("TCPI is capped (never Infinity) — uses conditional when remainingBudget <= 0", () => {
    // remainingBudget > 0 ? ... : remainingWork > 0 ? 99.99 : 1
    expect(src).toMatch(/remainingBudget\s*>\s*0\s*\?/);
    expect(src).toContain("99.99");
  });

  it("elapsedPct capped at 1.0 via Math.min(..., 1.0)", () => {
    expect(src).toMatch(/Math\.min\(.*1\.0\)/);
  });

  it("durationOverrunPct field exists in EvmMetrics interface", () => {
    expect(src).toMatch(/durationOverrunPct:\s*number/);
  });

  it("costStatus includes 'not_started' when AC === 0", () => {
    expect(src).toMatch(/ac\s*===\s*0\s*\?\s*"not_started"/);
  });

  it("SPI defaults to 1 when PV === 0", () => {
    expect(src).toMatch(/pv\s*>\s*0\s*\?\s*ev\s*\/\s*pv\s*:\s*1/);
  });

  it("CPI defaults to 1 when AC === 0", () => {
    expect(src).toMatch(/ac\s*>\s*0\s*\?\s*ev\s*\/\s*ac\s*:\s*1/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. Scenario Engine
// ═════════════════════════════════════════════════════════════════
describe("Scenario Engine", () => {
  const src = backendSrc("engine-scenario.ts");

  it("exports simulateScenario function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+simulateScenario/);
  });

  it("ScenarioInput has adjustWeight boolean field", () => {
    expect(src).toMatch(/adjustWeight\??\s*:\s*boolean/);
  });

  it("financialImpact field exists in ScenarioResult interface", () => {
    expect(src).toMatch(/financialImpact\??\s*:/);
  });

  it("budget reduction capped via Math.min(input.budgetReduction, project.budget)", () => {
    expect(src).toMatch(/Math\.min\(input\.budgetReduction.*project\.budget/);
  });

  it("pillar recalc uses weightedAvg (not simple average)", () => {
    expect(src).toMatch(/function\s+weightedAvg/);
    // weightedAvg used for initiative/pillar recalc
    const weightedAvgCalls = src.match(/weightedAvg\(/g);
    expect(weightedAvgCalls).not.toBeNull();
    expect(weightedAvgCalls!.length).toBeGreaterThanOrEqual(2);
  });

  it("cancel scenario skips the project (contains 'continue')", () => {
    expect(src).toMatch(/input\.type\s*===\s*"cancel".*continue/s);
  });

  it("weightedAvg falls back to simple average when totalWeight === 0", () => {
    // Inside the weightedAvg function, if totalWeight === 0, do simple avg
    expect(src).toMatch(/totalWeight\s*===\s*0/);
    expect(src).toMatch(/sum\s*\/\s*items\.length/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 7. AI Advisor Engine
// ═════════════════════════════════════════════════════════════════
describe("AI Advisor Engine", () => {
  const src = backendSrc("engine-ai-advisor.ts");

  it("exports queryAdvisor function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+queryAdvisor/);
  });

  it("has try-catch around anthropic import", () => {
    expect(src).toMatch(/try\s*\{[\s\S]*?require.*anthropic[\s\S]*?\}\s*catch/);
  });

  it("returns graceful error when API key missing (contains ANTHROPIC_API_KEY)", () => {
    expect(src).toContain("ANTHROPIC_API_KEY");
  });

  it("has timeout via Promise.race", () => {
    expect(src).toContain("Promise.race");
  });

  it("timeout is 30 seconds", () => {
    expect(src).toContain("30_000");
  });

  it("gathers different context based on input.context", () => {
    expect(src).toMatch(/input\.context\s*===\s*"risks"/);
    expect(src).toMatch(/input\.context\s*===\s*"budget"/);
    expect(src).toMatch(/input\.context\s*===\s*"kpis"/);
  });

  it("always includes portfolio context regardless of input.context", () => {
    expect(src).toMatch(/gatherPortfolioContext\(\)/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 8. Board Report Engine
// ═════════════════════════════════════════════════════════════════
describe("Board Report Engine", () => {
  const src = backendSrc("engine-board-report.ts");

  it("exports generateBoardReport function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+generateBoardReport/);
  });

  it("has try-catch around anthropic import", () => {
    expect(src).toMatch(/try\s*\{[\s\S]*?require.*anthropic[\s\S]*?\}\s*catch/);
  });

  it("returns fallback report when API key missing (anthropic is null check)", () => {
    expect(src).toMatch(/if\s*\(!anthropic\)/);
    expect(src).toContain("ANTHROPIC_API_KEY");
  });

  it("has 60-second timeout", () => {
    expect(src).toContain("60_000");
    expect(src).toContain("60 seconds");
  });

  it("timeout uses Promise.race", () => {
    expect(src).toContain("Promise.race");
  });

  it("BoardReport interface has executiveSummary field", () => {
    expect(src).toMatch(/executiveSummary:\s*string/);
  });

  it("BoardReport interface has sections field", () => {
    expect(src).toMatch(/sections:\s*BoardReportSection\[\]/);
  });

  it("BoardReport interface has recommendations field", () => {
    expect(src).toMatch(/recommendations:\s*string\[\]/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 9. KPI Engine
// ═════════════════════════════════════════════════════════════════
describe("KPI Engine", () => {
  const src = frontendSrc("kpi-engine.ts");

  it("exports computeKpiStatus function", () => {
    expect(src).toMatch(/export\s+function\s+computeKpiStatus/);
  });

  it("handles all 4 types: cumulative, rate, reduction, milestone", () => {
    expect(src).toMatch(/kpiType\s*===\s*"milestone"/);
    expect(src).toMatch(/kpiType\s*===\s*"cumulative"/);
    expect(src).toMatch(/kpiType\s*===\s*"reduction"/);
    // rate is the default fallback
    expect(src).toMatch(/computeRateKpi/);
  });

  it("rate KPI does NOT have proportional pace override (REMOVED comment)", () => {
    expect(src).toContain("REMOVED proportional pace override");
  });

  it("rate KPI has absolute floor (actual < 50% target)", () => {
    expect(src).toMatch(/actual\s*<\s*target\s*\*\s*0\.50/);
  });

  it("reduction KPI: negative achievedReduction returns 'critical' (worsening check)", () => {
    expect(src).toMatch(/achievedReduction\s*<\s*0/);
    expect(src).toMatch(/Metric worsened/);
    // Verify it returns "critical" for this case
    const worsenBlock = src.match(/if\s*\(achievedReduction\s*<\s*0\)[\s\S]*?return\s+r\(\s*"critical"/);
    expect(worsenBlock).not.toBeNull();
  });

  it("reduction KPI: totalReduction <= 0 returns 'not-started' (misconfiguration)", () => {
    expect(src).toMatch(/totalReduction\s*<=\s*0/);
    expect(src).toContain("Misconfigured");
    const misconfigBlock = src.match(/if\s*\(totalReduction\s*<=\s*0\)[\s\S]*?return\s+r\(\s*"not-started"/);
    expect(misconfigBlock).not.toBeNull();
  });

  it("milestone KPI: threshold scales to 10% of duration via Math.min(60, Math.max(7, ...))", () => {
    expect(src).toMatch(/Math\.min\(60,\s*Math\.max\(7/);
    expect(src).toMatch(/duration\s*\*\s*0\.10/);
  });

  it("cumulative KPI: on-track threshold is 0.95 (not 0.90) — Fix #1", () => {
    // The computeCumulativeKpi function uses pi >= 0.95 for on-track
    expect(src).toMatch(/pi\s*>=\s*0\.95/);
    expect(src).toContain("Tightened from 0.90 to 0.95");
  });

  it("velocity requires 3+ data points for override (velocityReliable check)", () => {
    expect(src).toMatch(/function\s+velocityReliable/);
    expect(src).toMatch(/vel\.dataPoints\s*>=\s*3/);
  });

  it("trend field exists in KpiStatusResult (improving/stable/deteriorating)", () => {
    expect(src).toMatch(/trend:\s*"improving"\s*\|\s*"stable"\s*\|\s*"deteriorating"\s*\|\s*null/);
  });

  it("severity multiplier explained in reason (contains 'severity')", () => {
    expect(src).toContain("severity");
    expect(src).toContain("severityMultiplier");
    expect(src).toContain("Late-period severity");
  });

  it("computeTrend uses 3% delta threshold for 'stable'", () => {
    expect(src).toMatch(/Math\.abs\(delta\)\s*<\s*0\.03/);
  });

  it("velocity calculation tracks dataPoints count", () => {
    expect(src).toMatch(/dataPoints:\s*number/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 10. spmo-calc Weight Cascade
// ═════════════════════════════════════════════════════════════════
describe("spmo-calc Weight Cascade", () => {
  const src = backendSrc("spmo-calc.ts");

  it("adminWeightSum validated against 100 via Math.abs check", () => {
    expect(src).toMatch(/Math\.abs\(adminWeightSum\s*-\s*100\)\s*<=\s*5/);
  });

  it("weight cascade: admin check comes before budget check", () => {
    const adminIdx = src.indexOf("adminWeightsSet");
    const budgetIdx = src.indexOf("allHaveBudget");
    expect(adminIdx).toBeGreaterThan(-1);
    expect(budgetIdx).toBeGreaterThan(adminIdx);
  });

  it("exports computeProjectWeights function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computeProjectWeights/);
  });

  it("exports computeInitiativeWeights function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computeInitiativeWeights/);
  });

  it("exports computePillarWeights function", () => {
    expect(src).toMatch(/export\s+async\s+function\s+computePillarWeights/);
  });

  it("execution placeholder detection: phaseGate check", () => {
    expect(src).toContain("execution_placeholder");
  });

  it("execution placeholder detection: name regex for Execution & Delivery", () => {
    expect(src).toMatch(/Execution\\s\*\[&\+\]\\s\*Delivery/);
  });

  it("projects with no dates return 'not_started' (not 'on_track')", () => {
    // computeStatusCore returns not_started when !startDate || !endDate
    expect(src).toMatch(/if\s*\(!startDate\s*\|\|\s*!endDate\)/);
    expect(src).toMatch(/status:\s*"not_started",\s*reason:\s*"Project dates not configured/);
  });

  it("early-stage label contains 'Mobilising'", () => {
    expect(src).toContain("Mobilising");
  });

  it("99% gate rule: milestoneEffectiveProgress caps at 99 for non-approved milestones at 100%", () => {
    expect(src).toMatch(/function\s+milestoneEffectiveProgress/);
    expect(src).toMatch(/progress\s*>=\s*100.*return\s+99/s);
  });

  it("milestoneEffectiveProgress returns full progress for approved milestones", () => {
    expect(src).toMatch(/status\s*===\s*"approved".*return\s+milestone\.progress/s);
  });

  it("weight cascade has 4 sources: admin, budget, effort, equal", () => {
    expect(src).toContain('"admin"');
    expect(src).toContain('"budget"');
    expect(src).toContain('"effort"');
    expect(src).toContain('"equal"');
  });

  it("pillar weights also check admin -> budget -> effort -> equal", () => {
    // computePillarWeights has the same cascade
    const fnStart = src.indexOf("async function computePillarWeights");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart);
    expect(fnBody).toContain("adminWeightSum");
    expect(fnBody).toContain("allHaveBudget");
    expect(fnBody).toContain("totalEffort");
    expect(fnBody).toContain('"equal"');
  });
});
