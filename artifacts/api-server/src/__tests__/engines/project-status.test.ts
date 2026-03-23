import { describe, it, expect } from "vitest";
import { computeStatus } from "../../lib/spmo-calc.js";

// Helper: produce a date string N days from today
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Helper: create a project scenario with controlled elapsed %
// elapsedPct: 0-100 (50 = 50% of total project duration has passed)
// totalDays: how long the project is (default 200)
function makeProject(
  progress: number,
  elapsedPct: number,
  opts: {
    totalDays?: number;
    budget?: number;
    budgetSpent?: number;
    rawProgress?: number;
    overdueByDays?: number;
  } = {}
) {
  const totalDays = opts.totalDays ?? 200;
  // elapsedDays = totalDays * (elapsedPct / 100)
  const elapsedDays = Math.round((elapsedPct / 100) * totalDays);
  const startDate = daysFromToday(-elapsedDays);
  const endDate = daysFromToday(totalDays - elapsedDays);
  return {
    progress,
    startDate,
    endDate,
    budget: opts.budget ?? 100,
    budgetSpent: opts.budgetSpent ?? 0,
    rawProgress: opts.rawProgress,
  };
}

describe("computeStatus — project status engine", () => {
  it("1. 50% progress, 50% elapsed → SPI 1.0 → on_track", () => {
    const p = makeProject(50, 50);
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    expect(result.status).toBe("on_track");
    expect(result.spi).toBeCloseTo(1.0, 1);
  });

  it("2. 47% progress, 50% elapsed → SPI ~0.94 → on_track (above 0.90 threshold)", () => {
    // Using 47% to stay above the 0.90 SPI threshold despite tiny floating-point date drift
    const p = makeProject(47, 50);
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    expect(result.status).toBe("on_track");
    expect(result.spi).toBeGreaterThanOrEqual(0.9);
  });

  it("3. 44% progress, 50% elapsed → SPI 0.88 → at_risk (just below 0.90)", () => {
    const p = makeProject(44, 50);
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    expect(result.status).toBe("at_risk");
    expect(result.spi).toBeCloseTo(0.88, 1);
  });

  it("4. 37% progress, 50% elapsed → SPI ~0.74 → at_risk (in 0.70–0.90 range)", () => {
    // Using 37% so SPI stays safely above 0.70 despite floating-point date drift
    const p = makeProject(37, 50);
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    expect(result.status).toBe("at_risk");
    expect(result.spi).toBeGreaterThanOrEqual(0.7);
    expect(result.spi).toBeLessThan(0.9);
  });

  it("5. 34% progress, 50% elapsed → SPI 0.68 → delayed (just below 0.70)", () => {
    const p = makeProject(34, 50);
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    expect(result.status).toBe("delayed");
    expect(result.spi).toBeCloseTo(0.68, 1);
  });

  it("6. 96% progress, past end date → on_track (near completion >= 95% overrides overdue)", () => {
    // project ended 10 days ago (110% elapsed)
    const startDate = daysFromToday(-110);
    const endDate = daysFromToday(-10);
    const result = computeStatus(96, startDate, endDate, 100, 0);
    expect(result.status).toBe("on_track");
  });

  it("7. 92% progress, past end date → delayed (overdue AND below 95%)", () => {
    const startDate = daysFromToday(-110);
    const endDate = daysFromToday(-10);
    const result = computeStatus(92, startDate, endDate, 100, 0);
    expect(result.status).toBe("delayed");
  });

  it("8. 0% progress, 10% elapsed → at_risk (mobilisation stall: SPI=0 < 0.2 AND progress < 3)", () => {
    // Code applies early-stage stall detection: SPI<0.2 AND progress<3 → at_risk
    // This is the early-warning bias documented in the engine
    const p = makeProject(0, 10, { totalDays: 200 });
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    // SPI = 0/10 = 0 < 0.2 AND progress = 0 < 3 → mobilisation stall → at_risk
    expect(result.status).toBe("at_risk");
    expect(result.reason).toMatch(/stall/i);
  });

  it("9. 0% progress, 20% elapsed → SPI 0.0 → delayed (past early-stage window)", () => {
    const p = makeProject(0, 20, { totalDays: 200 });
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    expect(result.status).toBe("delayed");
  });

  it("10. 70% progress, 80% elapsed, budget 90% spent → at_risk (burn gap = 20 > 15)", () => {
    const p = makeProject(70, 80, { budget: 100, budgetSpent: 90 });
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    // SPI = 70/80 = 0.875 (at_risk range), burnGap = 90 - 70 = 20 > 15
    expect(result.status).toBe("at_risk");
    expect(result.burnGap).toBe(20);
  });

  it("11. 100% progress → completed", () => {
    const p = makeProject(100, 50);
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent);
    expect(result.status).toBe("completed");
  });

  it("12. rawProgress 99.5%, gatedProgress 96% → on_track with approval bottleneck note", () => {
    const p = makeProject(96, 50);
    const result = computeStatus(p.progress, p.startDate, p.endDate, p.budget, p.budgetSpent, 99.5);
    expect(result.status).toBe("on_track");
    // Near completion fires first; bottleneck note appended (delta = 3.5 > 3)
    expect(result.reason.toLowerCase()).toMatch(/bottleneck|approval/i);
  });

  it("13. No start date → on_track (default status without crash)", () => {
    const result = computeStatus(40, null, "2025-12-31", 100, 0);
    expect(result.status).toBe("on_track");
  });

  it("14. Start date in future → on_track with 'not yet started' reason", () => {
    const startDate = daysFromToday(30);
    const endDate = daysFromToday(180);
    const result = computeStatus(0, startDate, endDate, 100, 0);
    expect(result.status).toBe("on_track");
    expect(result.reason.toLowerCase()).toMatch(/not yet started/i);
  });
});
