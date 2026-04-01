import { describe, it, expect } from "vitest";
import { computeInitiativeStatus, type ChildProjectSummary } from "../../lib/spmo-calc.js";

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Helper: make a child project summary
function makeChild(
  name: string,
  status: "on_track" | "at_risk" | "delayed" | "completed",
  spi: number,
  weight: number
): ChildProjectSummary {
  return {
    name,
    projectCode: name.toUpperCase(),
    computedStatus: { status, reason: `${status} reason`, spi, burnGap: 0 },
    progress: 50,
    weight,
  };
}

// Dates for 50% elapsed (standard test scenario)
const START_50 = daysFromToday(-100);
const END_50   = daysFromToday(100);

describe("computeInitiativeStatus — child-project escalation", () => {
  it("1. SPI 0.95, no delayed children → on_track", () => {
    // 95% of 50% elapsed = 47.5% progress → SPI = 47.5/50 = 0.95
    const children: ChildProjectSummary[] = [makeChild("Alpha", "on_track", 0.95, 100)];
    const result = computeInitiativeStatus(47.5, START_50, END_50, 100, 0, undefined, children);
    expect(result.status).toBe("on_track");
  });

  it("2. SPI 0.85, no delayed children → at_risk", () => {
    // 42.5% progress, 50% elapsed → SPI = 0.85 → at_risk
    const children: ChildProjectSummary[] = [makeChild("Beta", "at_risk", 0.85, 100)];
    const result = computeInitiativeStatus(42.5, START_50, END_50, 100, 0, undefined, children);
    expect(result.status).toBe("at_risk");
  });

  it("3. SPI 0.95 BUT 1 delayed child → escalated to at_risk", () => {
    const children: ChildProjectSummary[] = [
      makeChild("OnTrack", "on_track", 0.95, 60),
      makeChild("Delayed", "delayed", 0.5, 40),
    ];
    // Good SPI overall (47.5/50 = 0.95), but one delayed child
    const result = computeInitiativeStatus(47.5, START_50, END_50, 100, 0, undefined, children);
    // ESCALATION 1: any delayed child → minimum at_risk
    expect(result.status).toBe("at_risk");
  });

  it("4. SPI 0.95 BUT >50% budget weight in delayed projects → escalated to delayed", () => {
    const children: ChildProjectSummary[] = [
      makeChild("OnTrack", "on_track", 0.95, 40),
      makeChild("Delayed1", "delayed", 0.4, 35),
      makeChild("Delayed2", "delayed", 0.3, 25),
    ];
    // Delayed weight = 35 + 25 = 60 > 50 → delayed
    const result = computeInitiativeStatus(47.5, START_50, END_50, 100, 0, undefined, children);
    expect(result.status).toBe("delayed");
  });

  it("5. All children on_track → status matches SPI calculation", () => {
    const children: ChildProjectSummary[] = [
      makeChild("Alpha", "on_track", 0.96, 50),
      makeChild("Beta", "on_track", 0.94, 50),
    ];
    const result = computeInitiativeStatus(47, START_50, END_50, 100, 0, undefined, children);
    expect(result.status).toBe("on_track");
  });

  it("6. Reason text names delayed child projects", () => {
    const children: ChildProjectSummary[] = [
      makeChild("Project Alpha", "delayed", 0.5, 50),
      makeChild("Project Beta", "at_risk", 0.8, 50),
    ];
    const result = computeInitiativeStatus(40, START_50, END_50, 100, 0, undefined, children);
    // Should include the delayed project's name in the reason
    expect(result.status).not.toBe("on_track");
    // Names should appear in reason or in delayedChildren
    const hasProjectName = result.reason.includes("Project Alpha") ||
      (result.delayedChildren ?? []).some(c => c.includes("Project Alpha"));
    expect(hasProjectName).toBe(true);
  });

  it("7. No start date → returns not_started (dates not configured)", () => {
    const children: ChildProjectSummary[] = [];
    const result = computeInitiativeStatus(50, null, null, 100, 0, undefined, children);
    expect(result.status).toBe("not_started");
  });
});
