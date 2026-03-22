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
}

export interface KpiStatusResult {
  status: KpiEngineStatus;
  reason: string;
  performanceIndex: number;
  velocity: Velocity | null;
  timePosition: string;
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
  periodEnd: string | null
): Velocity | null {
  const today = new Date();
  const time = getTimePosition(periodStart, periodEnd);

  let refValue: number;
  let refDate: Date;

  if (prevActual != null && prevActualDt) {
    refValue = prevActual;
    refDate = new Date(prevActualDt);
  } else if (baseline != null) {
    refValue = baseline;
    refDate = new Date(periodStart || `${today.getFullYear()}-01-01`);
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

  return { monthlyRate, projectedYearEnd, willHitTarget, projectedGap };
}

function velText(vel: Velocity | null, unit: string): string {
  if (!vel) return "";
  const sign = vel.monthlyRate >= 0 ? "+" : "";
  return ` Velocity: ${sign}${fmtN(vel.monthlyRate)}${unit}/mo → projected ${fmtN(vel.projectedYearEnd)}${unit}.`;
}

function r(
  status: KpiEngineStatus,
  reason: string,
  pi: number,
  vel: Velocity | null,
  time: ReturnType<typeof getTimePosition>
): KpiStatusResult {
  return {
    status,
    reason,
    performanceIndex: Math.round(pi * 100) / 100,
    velocity: vel,
    timePosition: time.quarter,
  };
}

function computeCumulativeKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  const actual = kpi.actual!;
  const target = kpi.target!;
  const unit = kpi.unit ?? "";

  const expected = target * time.elapsedPct;
  const pi = expected > 0 ? actual / expected : actual > 0 ? 2 : 0;
  const vel = calcVelocity(actual, kpi.baseline, kpi.prevActual, kpi.prevActualDt, target, "higher", kpi.periodStart, kpi.periodEnd);
  const vt = velText(vel, unit);

  if (actual >= target) {
    return r("achieved", `Target reached: ${fmtN(actual)}${unit} vs ${fmtN(target)}${unit}.`, pi, vel, time);
  }
  if (pi >= 1.10) {
    return r("exceeding", `Ahead of pace. ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit} (${time.quarter}).${vt}`, pi, vel, time);
  }
  if (pi >= 0.90) {
    return r("on-track", `On pace: ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit} (${time.quarter}).${vt}`, pi, vel, time);
  }

  const severityMultiplier = 1 + time.elapsedPct * 0.5;
  const adjustedPi = pi * (1 / severityMultiplier);

  if (adjustedPi >= 0.55) {
    return r("at-risk", `Behind pace (${time.quarter}): ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit}.${vt}`, pi, vel, time);
  }
  return r("critical", `Critically behind (${time.quarter}): ${fmtN(actual)}${unit} vs expected ${fmtN(expected)}${unit}.${vt}`, pi, vel, time);
}

function computeRateKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  const direction = kpi.direction;
  const target = kpi.target!;
  const actual = kpi.actual!;
  const unit = kpi.unit ?? "";

  const vel = calcVelocity(actual, kpi.baseline, kpi.prevActual, kpi.prevActualDt, target, direction, kpi.periodStart, kpi.periodEnd);
  const vt = velText(vel, unit);

  const pi = direction === "higher" ? actual / target : target / Math.max(actual, 0.01);
  const gap = direction === "higher" ? target - actual : actual - target;
  const gapPct = Math.abs(gap) / target * 100;

  const met = direction === "higher" ? actual >= target : actual <= target;
  if (met) {
    return r(
      pi >= 1.10 ? "exceeding" : "achieved",
      `${fmtN(actual)}${unit} meets target ${fmtN(target)}${unit} (${time.quarter}).${vt}`,
      pi, vel, time
    );
  }

  // Thresholds widen with remaining runway so Q1 is most forgiving, Q4 strictest.
  // Spec example: Q1 (25% elapsed) → onTrack = 7.5×1.375 = 10.3%, atRisk = 22.5×1.375 = 30.9%
  // Q4 (100% elapsed) → onTrack = 7.5%, atRisk = 22.5%
  const shrink = 0.5;
  const onTrackThreshold = 7.5 * (1 + (1 - time.elapsedPct) * shrink);
  const atRiskThreshold = 22.5 * (1 + (1 - time.elapsedPct) * shrink);

  // ── PROPORTIONAL PACE OVERRIDE ──
  // Answers spec question #2: "Where should you be NOW?"
  // If actual/target >= elapsedPct the KPI is at or ahead of proportional pace
  // toward the annual target — it cannot be "at-risk".
  // Example: 40% of target achieved with 22% of year elapsed → 40% ≥ 22% → on-track.
  const achievedPct = target > 0 ? actual / target : 0;
  if (time.elapsedPct > 0 && achievedPct >= time.elapsedPct) {
    return r(
      "on-track",
      `${fmtN(actual)}${unit} — ${Math.round(achievedPct * 100)}% of annual target with ${Math.round(time.elapsedPct * 100)}% of period elapsed (${time.quarter}). At or ahead of pace.${vt}`,
      pi, vel, time
    );
  }

  // ── VELOCITY OVERRIDES ──
  if (vel) {
    if (!vel.willHitTarget && time.elapsedPct > 0.5) {
      if (gapPct > atRiskThreshold * 0.7) {
        return r("critical", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}). Velocity will miss target.${vt}`, pi, vel, time);
      }
      return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit}. Current pace won't reach target (${time.quarter}).${vt}`, pi, vel, time);
    }
    if (vel.willHitTarget && gapPct > atRiskThreshold) {
      return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} (${gapPct.toFixed(1)}% gap) but velocity on track.${vt}`, pi, vel, time);
    }
  }

  // ── STANDARD GAP CHECK ──
  if (gapPct <= onTrackThreshold) {
    return r("on-track", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}).${vt}`, pi, vel, time);
  }
  if (gapPct <= atRiskThreshold) {
    return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}).${vt}`, pi, vel, time);
  }

  // ── EARLY-QUARTER SAFETY NET ──
  // Without velocity data in Q1/Q2, we lack enough history to declare "critical".
  // Cap at "at-risk" and prompt the user to keep updating their actuals.
  if (!vel && time.elapsedPct < 0.5) {
    return r("at-risk", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}). Update actuals regularly to enable velocity projection.`, pi, vel, time);
  }

  return r("critical", `${fmtN(actual)}${unit} vs ${fmtN(target)}${unit} — ${gapPct.toFixed(1)}% gap (${time.quarter}).${vt}`, pi, vel, time);
}

function computeReductionKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  const baseline = kpi.baseline ?? kpi.actual!;
  const target = kpi.target!;
  const actual = kpi.actual!;
  const unit = kpi.unit ?? "";

  const totalReduction = baseline - target;
  const achievedReduction = baseline - actual;

  if (totalReduction <= 0) {
    return computeRateKpi({ ...kpi, direction: "lower" });
  }

  const vel = calcVelocity(actual, kpi.baseline, kpi.prevActual, kpi.prevActualDt, target, "lower", kpi.periodStart, kpi.periodEnd);
  const vt = velText(vel, unit);

  const reductionPct = achievedReduction / totalReduction;
  const pi = time.elapsedPct > 0 ? reductionPct / time.elapsedPct : reductionPct > 0 ? 2 : 0;
  const expectedNow = Math.round(baseline - totalReduction * time.elapsedPct);

  if (actual <= target) {
    return r("achieved", `Target met: ${fmtN(actual)}${unit} (target ${fmtN(target)}${unit}, baseline ${fmtN(baseline)}${unit}).`, pi, vel, time);
  }

  const severityMultiplier = 1 + time.elapsedPct * 0.5;
  const adjustedPi = pi * (1 / severityMultiplier);

  if (pi >= 1.10) {
    return r("exceeding", `Reducing faster than needed. ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit} (${time.quarter}).${vt}`, pi, vel, time);
  }
  if (pi >= 0.90) {
    return r("on-track", `Reducing on pace. ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit} (${time.quarter}).${vt}`, pi, vel, time);
  }
  if (adjustedPi >= 0.55) {
    return r("at-risk", `Reduction behind (${time.quarter}). ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit}.${vt}`, pi, vel, time);
  }
  return r("critical", `Reduction stalled (${time.quarter}). ${fmtN(actual)}${unit} vs expected ${fmtN(expectedNow)}${unit}.${vt}`, pi, vel, time);
}

function computeMilestoneKpi(kpi: KpiEngineInput): KpiStatusResult {
  const time = getTimePosition(kpi.periodStart, kpi.periodEnd);
  if (kpi.milestoneDone) return r("achieved", "Completed.", 1, null, time);
  if (!kpi.milestoneDue) return r("not-started", "No due date set.", 0, null, time);

  const days = Math.ceil((new Date(kpi.milestoneDue).getTime() - new Date().getTime()) / 86400000);
  if (days < 0) return r("critical", `Overdue by ${Math.abs(days)}d.`, 0, null, time);
  if (days <= 30) return r("at-risk", `Due in ${days}d — not yet complete.`, 0.5, null, time);
  return r("on-track", `Due in ${days}d (${kpi.milestoneDue}).`, 0.8, null, time);
}

export function computeKpiStatus(kpi: KpiEngineInput): KpiStatusResult {
  if (kpi.kpiType !== "milestone") {
    if (!kpi.target) return { status: "not-started", reason: "No target set.", performanceIndex: 0, velocity: null, timePosition: "Q1" };
    if (kpi.actual == null) return { status: "not-started", reason: "No actual value recorded.", performanceIndex: 0, velocity: null, timePosition: "Q1" };
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
