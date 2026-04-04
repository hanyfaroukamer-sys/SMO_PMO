export type KpiEngineStatus =
  | "exceeding"
  | "on-track"
  | "at-risk"
  | "critical"
  | "achieved"
  | "not-started";

export interface Velocity {
  monthlyRate: number;
  projectedYearEnd: number;
  willHitTarget: boolean;
  projectedGap: number;
  dataPoints: number; // Fix #7: track how many measurements back the velocity
}

export interface KpiStatusResult {
  status: KpiEngineStatus;
  reason: string;
  performanceIndex: number;
  velocity: Velocity | null;
  timePosition: string;
  trend: "improving" | "stable" | "deteriorating" | null; // Fix #5
  previousStatus: KpiEngineStatus | null; // Fix #5
}

export interface KpiEngineInput {
  kpiType: "cumulative" | "rate" | "milestone" | "reduction";
  direction: "higher" | "lower";
  target: number | null;
  actual: number | null;
  baseline: number | null;
  prevActual?: number | null;
  prevActualDt?: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  milestoneDue: string | null;
  milestoneDone: boolean;
  unit?: string | null;
  measurementCount?: number; // Fix #7: total number of measurements for this KPI
  previousPerformanceIndex?: number | null; // Fix #5: PI from last measurement
  milestoneDuration?: number | null; // Fix #4: total duration in days for milestone KPIs
}

function fmtN(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

function getTimePosition(periodStart: string | null, periodEnd: string | null) {
  const today = new Date();
  const start = new Date(periodStart || `${today.getFullYear()}-01-01`);
  const end = new Date(periodEnd || `${today.getFullYear()}-12-31`);

  const totalDays = Math.max((end.getTime() - start.getTime()) / 86400000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86400000, 0);
  const remainingDays = Math.max((end.getTime() - today.getTime()) / 86400000, 0);
  const elapsedPct = Math.min(elapsedDays / totalDays, 1.5);
  const remainingPct = Math.max(1 - elapsedPct, 0);

  const quarter =
    elapsedPct <= 0.25 ? "Q1"
    : elapsedPct <= 0.5 ? "Q2"
    : elapsedPct <= 0.75 ? "Q3"
    : "Q4";

  return { totalDays, elapsedDays, remainingDays, elapsedPct, remainingPct, quarter };
}

function calcVelocity(
  actual: number,
  baseline: number | null,
  prevActual: number | null | undefined,
  prevActualDt: string | null | undefined,
  target: number,
  direction: "higher" | "lower",
  periodStart: string | null,
  periodEnd: string | null,
  measurementCount?: number,
): Velocity | null {
  const today = new Date();
  const time = getTimePosition(periodStart, periodEnd);

  let refValue: number;
  let refDate: Date;
  let dataPoints = measurementCount ?? 1;

  if (prevActual != null && prevActualDt) {
    refValue = prevActual;
    refDate = new Date(prevActualDt);
    dataPoints = measurementCount ?? 2;
  } else if (baseline != null) {
    refValue = baseline;
    refDate = new Date(periodStart || `${today.getFullYear()}-01-01`);
    dataPoints = measurementCount ?? 1;
  } else {
    return null;
  }

  const daysBetween = Math.max((today.getTime() - refDate.getTime()) / 86400000, 1);
  const change = actual - refValue;
  const dailyRate = change / daysBetween;
  const monthlyRate = dailyRate * 30.44;

  const projectedYearEnd = actual + dailyRate * time.remainingDays;

  const willHitTarget =
    direction === "higher" ? projectedYearEnd >= target : projectedYearEnd <= target;

  const projectedGap =
    direction === "higher"
      ? projectedYearEnd - target
      : target - projectedYearEnd;

  return { monthlyRate, projectedYearEnd, willHitTarget, projectedGap, dataPoints };
}

function velText(vel: Velocity | null, unit: string): string {
  if (!vel) return "";
  const sign = vel.monthlyRate >= 0 ? "+" : "";
  return ` Velocity: ${sign}${fmtN(vel.monthlyRate)}${unit}/mo → projected ${fmtN(vel.projectedYearEnd)}${unit}.`;
}

// Fix #5: Compute trend from previous PI
function computeTrend(currentPi: number, previousPi: number | null | undefined): "improving" | "stable" | "deteriorating" | null {
  if (previousPi == null) return null;
  const delta = currentPi - previousPi;
  if (Math.abs(delta) < 0.03) return "stable"; // within 3% = stable
  return delta > 0 ? "improving" : "deteriorating";
}

function r(
  status: KpiEngineStatus,
  reason: string,
  pi: number,
  vel: Velocity | null,
  time: ReturnType<typeof getTimePosition>,
  kpi?: KpiEngineInput,
): KpiStatusResult {
  const trend = computeTrend(pi, kpi?.previousPerformanceIndex);
  return {
    status,
    reason,
    performanceIndex: Math.round(pi * 100) / 100,
    velocity: vel,
    timePosition: time.quarter,
    trend,
    previousStatus: null, // populated by caller if available
  };
}

// Fix #7: Only use velocity for status overrides if enough data points
function velocityReliable(vel: Velocity | null): boolean {
  return vel != null && vel.dataPoints >= 3;
}

function computeCumulativeKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  const actual = kpi.actual!;
  const target = kpi.target!;
  const unit = kpi.unit ?? "";

  const expected = target * time.elapsedPct;
  const pi = expected > 0 ? actual / expected : actual > 0 ? 2 : 0;
  const vel = calcVelocity(actual, kpi.baseline, kpi.prevActual, kpi.prevActualDt, target, "higher", kpi.periodStart, kpi.periodEnd, kpi.measurementCount);
  const vt = velText(vel, unit);

  if (actual >= target) {
    return r("achieved", `Target reached: ${fmtN(actual)}${unit} vs ${fmtN(target)}${unit}.`, pi, vel, time, kpi);
  }
  if (pi >= 1.10) {
    return r("exceeding", `Ahead of pace. ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit} (${time.quarter}).${vt}`, pi, vel, time, kpi);
  }
  // Fix #1: Tightened from 0.90 to 0.95
  if (pi >= 0.95) {
    return r("on-track", `On pace: ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit} (${time.quarter}).${vt}`, pi, vel, time, kpi);
  }

  // Fix #6: Explain severity multiplier in reason
  const severityMultiplier = 1 + time.elapsedPct * 0.5;
  const adjustedPi = pi * (1 / severityMultiplier);
  const severityNote = time.elapsedPct > 0.5
    ? ` Late-period severity applied (threshold raised to ${Math.round(0.55 * severityMultiplier * 100)}%).`
    : "";

  if (adjustedPi >= 0.55) {
    return r("at-risk", `Behind pace (${time.quarter}): ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit}.${severityNote}${vt}`, pi, vel, time, kpi);
  }
  return r("critical", `Critically behind (${time.quarter}): ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit}.${severityNote}${vt}`, pi, vel, time, kpi);
}

function computeRateKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  const direction = kpi.direction;
  const target = kpi.target!;
  const actual = kpi.actual!;
  const unit = kpi.unit ?? "";

  const vel = calcVelocity(actual, kpi.baseline, kpi.prevActual, kpi.prevActualDt, target, direction, kpi.periodStart, kpi.periodEnd, kpi.measurementCount);
  const vt = velText(vel, unit);

  const pi = direction === "higher" ? actual / target : target / Math.max(actual, 0.01);
  const gap = direction === "higher" ? target - actual : actual - target;
  const gapPct = Math.abs(gap) / target * 100;

  const met = direction === "higher" ? actual >= target : actual <= target;
  if (met) {
    return r(
      pi >= 1.10 ? "exceeding" : "achieved",
      `${fmtN(actual)}${unit} meets target ${fmtN(target)}${unit} (${time.quarter}).${vt}`,
      pi, vel, time, kpi
    );
  }

  // Fix #2a: Absolute floor — if actual < 50% of target, never on-track
  const absoluteFloor = direction === "higher" ? actual < target * 0.50 : actual > target * 2.0;

  // Thresholds widen with remaining runway so Q1 is most forgiving, Q4 strictest.
  const shrink = 0.5;
  const onTrackThreshold = 7.5 * (1 + (1 - time.elapsedPct) * shrink);
  const atRiskThreshold = 22.5 * (1 + (1 - time.elapsedPct) * shrink);

  // Fix #2b: REMOVED proportional pace override for rate KPIs.
  // Rate KPIs (SLA compliance, satisfaction) are point-in-time snapshots —
  // the actual value at any moment directly reflects performance.
  // The old check "actual/target >= elapsed%" was wrong for rates because
  // 22% satisfaction is terrible regardless of being "ahead of pace" at 20% elapsed.
  // Time sensitivity is handled by gap thresholds that tighten as year progresses.

  // ── VELOCITY OVERRIDES (Fix #7: only if reliable — 3+ measurements) ──
  if (velocityReliable(vel)) {
    if (!vel!.willHitTarget && time.elapsedPct > 0.5) {
      if (gapPct > atRiskThreshold * 0.7) {
        return r("critical", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}). Velocity (${vel!.dataPoints} readings) projects miss.${vt}`, pi, vel, time, kpi);
      }
      return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit}. Velocity (${vel!.dataPoints} readings) won't reach target (${time.quarter}).${vt}`, pi, vel, time, kpi);
    }
    if (vel!.willHitTarget && gapPct > atRiskThreshold) {
      return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} (${gapPct.toFixed(1)}% gap) but velocity on track.${vt}`, pi, vel, time, kpi);
    }
  }

  // ── STANDARD GAP CHECK ──
  if (!absoluteFloor && gapPct <= onTrackThreshold) {
    return r("on-track", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}).${vt}`, pi, vel, time, kpi);
  }
  if (gapPct <= atRiskThreshold) {
    const floorNote = absoluteFloor ? " Below minimum threshold." : "";
    return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}).${floorNote}${vt}`, pi, vel, time, kpi);
  }

  // ── EARLY-QUARTER SAFETY NET (Fix #7: only if insufficient data) ──
  if (!velocityReliable(vel) && time.elapsedPct < 0.5) {
    return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}). Need ${3 - (vel?.dataPoints ?? 0)} more reading(s) to project velocity.`, pi, vel, time, kpi);
  }

  return r("critical", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}).${vt}`, pi, vel, time, kpi);
}

// Fix #3: Return not-started when reduction KPI is misconfigured
function computeReductionKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  const baseline = kpi.baseline ?? kpi.actual!;
  const target = kpi.target!;
  const actual = kpi.actual!;
  const unit = kpi.unit ?? "";

  const totalReduction = baseline - target;
  const achievedReduction = baseline - actual;

  // Handle worsening: actual exceeds baseline (things got worse, not reduced)
  if (achievedReduction < 0) {
    return r(
      "critical",
      `Metric worsened: actual ${fmtN(actual)}${unit} exceeds baseline ${fmtN(baseline)}${unit}. Target was to reduce to ${fmtN(target)}${unit}.`,
      0, null, time, kpi
    );
  }

  if (totalReduction <= 0) {
    // Fix #3: Don't silently fall back to rate logic — report misconfiguration
    return r(
      "not-started",
      `Misconfigured: baseline (${fmtN(baseline)}${unit}) must be higher than target (${fmtN(target)}${unit}) for reduction KPIs. Set baseline or change KPI type.`,
      0, null, time, kpi
    );
  }

  const vel = calcVelocity(actual, kpi.baseline, kpi.prevActual, kpi.prevActualDt, target, "lower", kpi.periodStart, kpi.periodEnd, kpi.measurementCount);
  const vt = velText(vel, unit);

  const reductionPct = achievedReduction / totalReduction;
  const pi = time.elapsedPct > 0 ? reductionPct / time.elapsedPct : reductionPct > 0 ? 2 : 0;
  const expectedNow = Math.round(baseline - totalReduction * time.elapsedPct);

  if (actual <= target) {
    return r("achieved", `Target met: ${fmtN(actual)}${unit} (target ${fmtN(target)}${unit}, baseline ${fmtN(baseline)}${unit}).`, pi, vel, time, kpi);
  }

  // Fix #6: Explain severity multiplier
  const severityMultiplier = 1 + time.elapsedPct * 0.5;
  const adjustedPi = pi * (1 / severityMultiplier);
  const severityNote = time.elapsedPct > 0.5
    ? ` Late-period severity applied.`
    : "";

  if (pi >= 1.10) {
    return r("exceeding", `Reducing faster than needed. ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit} (${time.quarter}).${vt}`, pi, vel, time, kpi);
  }
  // Fix #1: Tightened from 0.90 to 0.95
  if (pi >= 0.95) {
    return r("on-track", `Reducing on pace. ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit} (${time.quarter}).${vt}`, pi, vel, time, kpi);
  }
  if (adjustedPi >= 0.55) {
    return r("at-risk", `Reduction behind (${time.quarter}). ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit}.${severityNote}${vt}`, pi, vel, time, kpi);
  }
  return r("critical", `Reduction stalled (${time.quarter}). ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit}.${severityNote}${vt}`, pi, vel, time, kpi);
}

// Fix #4: Scale milestone threshold to 10% of total duration
function computeMilestoneKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  if (kpi.milestoneDone) return r("achieved", "Completed.", 1, null, time, kpi);
  if (!kpi.milestoneDue) return r("not-started", "No due date set.", 0, null, time, kpi);

  const days = Math.ceil((new Date(kpi.milestoneDue).getTime() - new Date().getTime()) / 86400000);
  if (days < 0) return r("critical", `Overdue by ${Math.abs(days)}d.`, 0, null, time, kpi);

  // Fix #4: Scale at-risk threshold to 10% of total milestone duration (min 7d, max 60d)
  const duration = kpi.milestoneDuration ?? 180; // default assume 6 months if unknown
  const atRiskDays = Math.min(60, Math.max(7, Math.round(duration * 0.10)));

  if (days <= atRiskDays) {
    return r("at-risk", `Due in ${days}d — not yet complete (threshold: ${atRiskDays}d for ${duration}d milestone).`, 0.5, null, time, kpi);
  }
  return r("on-track", `Due in ${days}d (${kpi.milestoneDue}).`, 0.8, null, time, kpi);
}

export function computeKpiStatus(kpi: KpiEngineInput): KpiStatusResult {
  if (kpi.kpiType !== "milestone") {
    if (!kpi.target) return { status: "not-started", reason: "No target set.", performanceIndex: 0, velocity: null, timePosition: "Q1", trend: null, previousStatus: null };
    if (kpi.actual == null) return { status: "not-started", reason: "No actual value recorded.", performanceIndex: 0, velocity: null, timePosition: "Q1", trend: null, previousStatus: null };
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

export const TREND_LABEL: Record<string, string> = {
  "improving": "Improving",
  "stable": "Stable",
  "deteriorating": "Deteriorating",
};

export const TREND_ICON: Record<string, string> = {
  "improving": "↗",
  "stable": "→",
  "deteriorating": "↘",
};
