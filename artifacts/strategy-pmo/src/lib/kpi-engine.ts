export type KpiEngineStatus =
  | "exceeding"
  | "on-track"
  | "at-risk"
  | "critical"
  | "achieved"
  | "not-started";

export interface KpiStatusResult {
  status: KpiEngineStatus;
  reason: string;
  performanceIndex: number;
}

export interface KpiEngineInput {
  kpiType: "cumulative" | "rate" | "milestone" | "reduction";
  direction: "higher" | "lower";
  target: number | null;
  actual: number | null;
  baseline: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  milestoneDue: string | null;
  milestoneDone: boolean;
}

function computeCumulativeKpi(kpi: KpiEngineInput): KpiStatusResult {
  const today = new Date();
  const start = new Date(kpi.periodStart || `${today.getFullYear()}-01-01`);
  const end = new Date(kpi.periodEnd || `${today.getFullYear()}-12-31`);
  const actual = kpi.actual!;
  const target = kpi.target!;

  const totalDays = Math.max((end.getTime() - start.getTime()) / 86400000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86400000, 0);
  const elapsedPct = Math.min(elapsedDays / totalDays, 1);

  const expected = target * elapsedPct;
  const pi = expected > 0 ? actual / expected : actual > 0 ? 2 : 0;

  if (actual >= target) {
    return { status: "achieved", reason: `Target reached: ${actual} vs target ${target}.`, performanceIndex: pi };
  }
  if (pi >= 1.10) {
    return { status: "exceeding", reason: `Ahead of pace: ${actual} vs expected ${Math.round(expected)}.`, performanceIndex: pi };
  }
  if (pi >= 0.90) {
    return { status: "on-track", reason: `On pace: ${actual} vs expected ${Math.round(expected)}.`, performanceIndex: pi };
  }
  if (pi >= 0.70) {
    const gap = Math.round(expected - actual);
    return { status: "at-risk", reason: `Behind pace by ${gap}. Actual ${actual} vs expected ${Math.round(expected)}.`, performanceIndex: pi };
  }
  const gap = Math.round(expected - actual);
  return { status: "critical", reason: `${gap} behind expected pace. Actual ${actual} vs expected ${Math.round(expected)}.`, performanceIndex: pi };
}

function computeRateKpi(kpi: KpiEngineInput): KpiStatusResult {
  const target = kpi.target!;
  const actual = kpi.actual!;
  const direction = kpi.direction;

  const pi = direction === "higher" ? actual / target : target / actual;
  const rawGap = direction === "higher" ? target - actual : actual - target;
  const gapPct = Math.abs(rawGap) / target * 100;

  if (direction === "higher" && actual >= target) {
    return { status: pi >= 1.10 ? "exceeding" : "achieved", reason: `${actual} meets/exceeds target of ${target}.`, performanceIndex: pi };
  }
  if (direction === "lower" && actual <= target) {
    return { status: pi >= 1.10 ? "exceeding" : "achieved", reason: `${actual} meets/exceeds target of ${target}.`, performanceIndex: pi };
  }
  if (gapPct <= 5) {
    return { status: "on-track", reason: `${actual} vs target ${target} — within ${gapPct.toFixed(1)}% gap.`, performanceIndex: pi };
  }
  if (gapPct <= 15) {
    return { status: "at-risk", reason: `${actual} vs target ${target} — ${gapPct.toFixed(1)}% gap.`, performanceIndex: pi };
  }
  return { status: "critical", reason: `${actual} vs target ${target} — ${gapPct.toFixed(1)}% gap from target.`, performanceIndex: pi };
}

function computeReductionKpi(kpi: KpiEngineInput): KpiStatusResult {
  const baseline = kpi.baseline ?? kpi.actual!;
  const target = kpi.target!;
  const actual = kpi.actual!;

  const totalReduction = baseline - target;
  const achievedReduction = baseline - actual;

  if (totalReduction <= 0) {
    return computeRateKpi({ ...kpi, direction: "lower" });
  }

  const reductionPct = achievedReduction / totalReduction;

  const today = new Date();
  const start = new Date(kpi.periodStart || `${today.getFullYear()}-01-01`);
  const end = new Date(kpi.periodEnd || `${today.getFullYear()}-12-31`);
  const totalDays = Math.max((end.getTime() - start.getTime()) / 86400000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86400000, 0);
  const elapsedPct = Math.min(elapsedDays / totalDays, 1);

  const pi = elapsedPct > 0 ? reductionPct / elapsedPct : reductionPct > 0 ? 2 : 0;

  if (actual <= target) {
    return { status: "achieved", reason: `Target met: ${actual} (target: ${target}, baseline: ${baseline}).`, performanceIndex: pi };
  }
  if (pi >= 1.10) {
    return { status: "exceeding", reason: `Ahead of reduction pace. ${actual} down from ${baseline}.`, performanceIndex: pi };
  }
  if (pi >= 0.90) {
    return { status: "on-track", reason: `Reducing on pace. ${actual} down from ${baseline}.`, performanceIndex: pi };
  }
  if (pi >= 0.70) {
    return { status: "at-risk", reason: `Reduction behind pace. ${actual} (baseline ${baseline}, target ${target}).`, performanceIndex: pi };
  }
  return { status: "critical", reason: `Reduction stalled. ${actual} (baseline ${baseline}, target ${target}).`, performanceIndex: pi };
}

function computeMilestoneKpi(kpi: KpiEngineInput): KpiStatusResult {
  if (kpi.milestoneDone) {
    return { status: "achieved", reason: "Milestone completed.", performanceIndex: 1 };
  }
  if (!kpi.milestoneDue) {
    return { status: "not-started", reason: "No due date set for milestone.", performanceIndex: 0 };
  }
  const today = new Date();
  const due = new Date(kpi.milestoneDue);
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (daysUntilDue < 0) {
    return { status: "critical", reason: `Overdue by ${Math.abs(daysUntilDue)}d. Due: ${kpi.milestoneDue}.`, performanceIndex: 0 };
  }
  if (daysUntilDue <= 30) {
    return { status: "at-risk", reason: `Due in ${daysUntilDue}d (${kpi.milestoneDue}). Not yet complete.`, performanceIndex: 0.5 };
  }
  return { status: "on-track", reason: `Due ${kpi.milestoneDue} (${daysUntilDue}d away).`, performanceIndex: 1 };
}

export function computeKpiStatus(kpi: KpiEngineInput): KpiStatusResult {
  if (kpi.target === null || kpi.target === 0) {
    return { status: "not-started", reason: "No target set.", performanceIndex: 0 };
  }
  if (kpi.kpiType !== "milestone" && kpi.actual === null) {
    return { status: "not-started", reason: "No actual value recorded.", performanceIndex: 0 };
  }

  if (kpi.kpiType === "milestone") return computeMilestoneKpi(kpi);
  if (kpi.kpiType === "cumulative") return computeCumulativeKpi(kpi);
  if (kpi.kpiType === "reduction") return computeReductionKpi(kpi);
  return computeRateKpi(kpi);
}

export const ENGINE_STATUS_LABEL: Record<KpiEngineStatus, string> = {
  "exceeding": "Exceeding",
  "on-track": "On Track",
  "at-risk": "At Risk",
  "critical": "Critical",
  "achieved": "Achieved",
  "not-started": "Not Started",
};

export const ENGINE_STATUS_ICON: Record<KpiEngineStatus, string> = {
  "exceeding": "↑",
  "on-track": "✓",
  "at-risk": "⚠",
  "critical": "✕",
  "achieved": "✓",
  "not-started": "—",
};
