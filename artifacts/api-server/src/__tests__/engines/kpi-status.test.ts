import { describe, it, expect } from "vitest";
import { computeKpiStatus, type KpiEngineInput } from "../../../../strategy-pmo/src/lib/kpi-engine.js";

// Helper to create a date that is N% through a given period
function periodAtPct(pct: number): { periodStart: string; periodEnd: string } {
  const totalDays = 365;
  const today = new Date();
  const pctDecimal = pct / 100;
  const startDate = new Date(today.getTime() - pctDecimal * totalDays * 86400000);
  const endDate   = new Date(startDate.getTime() + totalDays * 86400000);
  return {
    periodStart: startDate.toISOString().slice(0, 10),
    periodEnd:   endDate.toISOString().slice(0, 10),
  };
}

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const BASE: Omit<KpiEngineInput, "kpiType" | "target" | "actual"> = {
  direction: "higher",
  baseline: null,
  periodStart: null,
  periodEnd: null,
  milestoneDue: null,
  milestoneDone: false,
};

// ─── Fix #1: Cumulative KPI — tightened threshold (0.95) ─────────────────────

describe("computeKpiStatus — cumulative KPI", () => {
  it("1. PI ≈ 0.83 → at-risk (was at-risk before, still at-risk)", () => {
    const { periodStart, periodEnd } = periodAtPct(42);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 4200, periodStart, periodEnd,
    });
    expect(result.status).toBe("at-risk");
    expect(result.performanceIndex).toBeCloseTo(0.83, 1);
  });

  it("2. PI ≈ 0.93 → at-risk (was on-track at 0.90, now tightened to 0.95)", () => {
    const { periodStart, periodEnd } = periodAtPct(42);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 4700, periodStart, periodEnd,
    });
    // expected = 12000*0.42 = 5040; PI = 4700/5040 ≈ 0.93 → below 0.95 → at-risk
    expect(result.status).toBe("at-risk");
  });

  it("3. PI ≈ 0.96 → on-track (above new 0.95 threshold)", () => {
    const { periodStart, periodEnd } = periodAtPct(42);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 4850, periodStart, periodEnd,
    });
    // expected = 5040; PI = 4850/5040 ≈ 0.96 → on-track
    expect(result.status).toBe("on-track");
  });

  it("4. PI very low at 75% elapsed → critical", () => {
    const { periodStart, periodEnd } = periodAtPct(75);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 1500, periodStart, periodEnd,
    });
    expect(result.status).toBe("critical");
  });

  it("5. Actual >= target → achieved", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 12500, periodStart, periodEnd,
    });
    expect(result.status).toBe("achieved");
  });

  it("6. Fix #6: reason includes severity note in late period", () => {
    const { periodStart, periodEnd } = periodAtPct(80);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 6000, periodStart, periodEnd,
    });
    expect(result.reason).toContain("severity");
  });
});

// ─── Fix #2: Rate KPI — no proportional pace, absolute floor ─────────────────

describe("computeKpiStatus — rate KPI (point-in-time snapshot)", () => {
  it("7. 78% vs 85% target → gap-based check, not pace-based", () => {
    const { periodStart, periodEnd } = periodAtPct(25);
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 85, actual: 78, unit: "%", periodStart, periodEnd,
    });
    // Gap = 8.2%. Q1 onTrack threshold ≈ 10.3% → on-track by gap
    expect(result.status).toBe("on-track");
  });

  it("8. Fix #2b: 22% vs 85% target at 20% elapsed → NOT on-track (old pace check would say on-track)", () => {
    const { periodStart, periodEnd } = periodAtPct(20);
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 85, actual: 22, unit: "%", periodStart, periodEnd,
    });
    // Gap = 74.1% — way above any threshold
    // Fix #2a: 22 < 85*0.50=42.5 → absolute floor blocks on-track
    expect(["at-risk", "critical"]).toContain(result.status);
  });

  it("9. Fix #2a: actual < 50% of target → never on-track even if gap seems small", () => {
    const { periodStart, periodEnd } = periodAtPct(10);
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 100, actual: 40, unit: "%", periodStart, periodEnd,
    });
    // 40 < 100*0.50 → absolute floor
    expect(result.status).not.toBe("on-track");
    expect(result.status).not.toBe("exceeding");
  });

  it("10. Target met → achieved", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 85, actual: 90, unit: "%", periodStart, periodEnd,
    });
    expect(["achieved", "exceeding"]).toContain(result.status);
  });

  it("11. Fix #7: velocity not used for status override with < 3 measurements", () => {
    const { periodStart, periodEnd } = periodAtPct(60);
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 85, actual: 60, unit: "%",
      periodStart, periodEnd,
      prevActual: 55, prevActualDt: daysFromToday(-30),
      measurementCount: 2, // only 2 → velocity not reliable for override
    });
    // With unreliable velocity, should NOT say "won't reach target" or "readings"
    // It falls through to standard gap check instead
    expect(result.reason).not.toContain("readings");
  });

  it("12. Fix #7: velocity override works with 3+ measurements", () => {
    const { periodStart, periodEnd } = periodAtPct(60);
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 85, actual: 60, unit: "%",
      periodStart, periodEnd,
      prevActual: 55, prevActualDt: daysFromToday(-30),
      measurementCount: 4, // 4 → reliable
    });
    // Should use velocity and mention readings count
    expect(result.reason).toContain("readings");
  });
});

// ─── Fix #3: Reduction KPI — misconfiguration ───────────────────────────────

describe("computeKpiStatus — reduction KPI", () => {
  it("13. Normal reduction: baseline 120 → target 60, actual 95 → at-risk", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "reduction", direction: "lower",
      baseline: 120, target: 60, actual: 95, periodStart, periodEnd,
    });
    expect(["at-risk", "critical"]).toContain(result.status);
  });

  it("14. Fix #3: baseline ≤ target → not-started with misconfiguration message", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "reduction", direction: "lower",
      baseline: 50, target: 60, actual: 45, periodStart, periodEnd,
    });
    expect(result.status).toBe("not-started");
    expect(result.reason).toContain("Misconfigured");
  });

  it("14b. Reduction KPI: actual > baseline (worsened) → critical", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "reduction", direction: "lower",
      baseline: 100, target: 60, actual: 110, periodStart, periodEnd,
    });
    expect(result.status).toBe("critical");
    expect(result.reason).toContain("worsened");
  });

  it("15. Achieved: actual ≤ target", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "reduction", direction: "lower",
      baseline: 120, target: 60, actual: 55, periodStart, periodEnd,
    });
    expect(result.status).toBe("achieved");
  });
});

// ─── Fix #4: Milestone KPI — scaled threshold ───────────────────────────────

describe("computeKpiStatus — milestone KPI", () => {
  it("16. Due in 15 days, 180d milestone → at-risk (threshold = 18d)", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "milestone", target: null, actual: null,
      milestoneDue: daysFromToday(15), milestoneDone: false,
      milestoneDuration: 180,
    });
    expect(result.status).toBe("at-risk");
  });

  it("17. Due in 15 days, 30d milestone → on-track (threshold = 7d min)", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "milestone", target: null, actual: null,
      milestoneDue: daysFromToday(15), milestoneDone: false,
      milestoneDuration: 30,
    });
    // 10% of 30d = 3d → clamped to min 7d. 15 > 7 → on-track
    expect(result.status).toBe("on-track");
  });

  it("18. Due in 50 days, 1800d (5yr) milestone → at-risk (threshold = 60d max)", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "milestone", target: null, actual: null,
      milestoneDue: daysFromToday(50), milestoneDone: false,
      milestoneDuration: 1800,
    });
    // 10% of 1800 = 180 → clamped to max 60. 50 < 60 → at-risk
    expect(result.status).toBe("at-risk");
  });

  it("19. Overdue → critical", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "milestone", target: null, actual: null,
      milestoneDue: daysFromToday(-20), milestoneDone: false,
    });
    expect(result.status).toBe("critical");
  });

  it("20. Done → achieved", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "milestone", target: null, actual: null,
      milestoneDue: daysFromToday(30), milestoneDone: true,
    });
    expect(result.status).toBe("achieved");
  });
});

// ─── Fix #5: Trend field ─────────────────────────────────────────────────────

describe("computeKpiStatus — trend detection", () => {
  it("21. PI improved from 0.80 to 0.96 → improving", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 5800,
      periodStart, periodEnd, previousPerformanceIndex: 0.80,
    });
    expect(result.trend).toBe("improving");
  });

  it("22. PI dropped from 1.05 to 0.85 → deteriorating", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 5100,
      periodStart, periodEnd, previousPerformanceIndex: 1.05,
    });
    expect(result.trend).toBe("deteriorating");
  });

  it("23. PI unchanged → stable", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 5760,
      periodStart, periodEnd, previousPerformanceIndex: 0.96,
    });
    // PI ≈ 0.96, prev 0.96, delta < 0.03 → stable
    expect(result.trend).toBe("stable");
  });

  it("24. No previous PI → trend is null", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 5760,
      periodStart, periodEnd,
    });
    expect(result.trend).toBeNull();
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("computeKpiStatus — edge cases", () => {
  it("25. Target is null → not-started", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: null, actual: 100,
    });
    expect(result.status).toBe("not-started");
  });

  it("26. Actual is null → not-started", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 85, actual: null,
    });
    expect(result.status).toBe("not-started");
  });

  it("27. Target is 0 → not-started", () => {
    const result = computeKpiStatus({
      ...BASE, kpiType: "rate", target: 0, actual: 50,
    });
    expect(result.status).toBe("not-started");
  });

  it("28. Result includes trend and previousStatus fields", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 5800,
      periodStart, periodEnd,
    });
    expect(result).toHaveProperty("trend");
    expect(result).toHaveProperty("previousStatus");
  });

  it("29. Velocity includes dataPoints field", () => {
    const { periodStart, periodEnd } = periodAtPct(50);
    const result = computeKpiStatus({
      ...BASE, kpiType: "cumulative", target: 12000, actual: 5800,
      baseline: 0, periodStart, periodEnd, measurementCount: 5,
    });
    expect(result.velocity).not.toBeNull();
    expect(result.velocity!.dataPoints).toBe(5);
  });
});
