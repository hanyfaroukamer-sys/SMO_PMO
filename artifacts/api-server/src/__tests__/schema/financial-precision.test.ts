import { describe, it, expect } from "vitest";

/**
 * Financial precision tests.
 *
 * PostgreSQL numeric(15,2) stores exact decimal values as strings in Drizzle.
 * These tests verify that string-based arithmetic preserves precision where
 * IEEE 754 floats would not, and document edge cases.
 */

/** Simple 2-decimal fixed-point helpers (mirrors what the app should do). */
function toNumeric(value: number | string): string {
  return Number(value).toFixed(2);
}

function addNumeric(a: string, b: string): string {
  // Multiply by 100, do integer math, divide back — avoids float drift.
  const ai = Math.round(Number(a) * 100);
  const bi = Math.round(Number(b) * 100);
  return ((ai + bi) / 100).toFixed(2);
}

function subtractNumeric(a: string, b: string): string {
  const ai = Math.round(Number(a) * 100);
  const bi = Math.round(Number(b) * 100);
  return ((ai - bi) / 100).toFixed(2);
}

describe("Financial precision — 0.1 + 0.2 problem", () => {
  it("demonstrates that native float addition is imprecise", () => {
    // Classic IEEE 754 issue
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(0.1 + 0.2).toBeCloseTo(0.3, 15);
  });

  it("string-based numeric addition preserves exact 2-decimal precision", () => {
    const result = addNumeric("0.10", "0.20");
    expect(result).toBe("0.30");
  });

  it("toFixed(2) coercion matches numeric(15,2) output", () => {
    expect(toNumeric(0.1 + 0.2)).toBe("0.30");
  });
});

describe("Financial precision — large budget values (billions)", () => {
  it("handles billion-scale values to 2 decimal places", () => {
    const budget = "9999999999999.99"; // max for numeric(15,2)
    expect(Number(budget).toFixed(2)).toBe("9999999999999.99");
  });

  it("adds large budgets without losing precision", () => {
    const a = "5000000000.50";
    const b = "4999999999.49";
    const sum = addNumeric(a, b);
    expect(sum).toBe("9999999999.99");
  });

  it("subtracts large budgets precisely", () => {
    const allocated = "1234567890.12";
    const spent = "1234567890.12";
    const remaining = subtractNumeric(allocated, spent);
    expect(remaining).toBe("0.00");
  });

  it("handles moderate billion values", () => {
    const allocated = "2500000000.75";
    const spent = "1800000000.25";
    const remaining = subtractNumeric(allocated, spent);
    expect(remaining).toBe("700000000.50");
  });
});

describe("Financial precision — allocated - spent = remaining", () => {
  it("basic budget arithmetic is exact", () => {
    const allocated = "1000000.00";
    const spent = "750000.50";
    const remaining = subtractNumeric(allocated, spent);
    expect(remaining).toBe("249999.50");
  });

  it("fully spent budget equals zero", () => {
    const allocated = "500000.00";
    const remaining = subtractNumeric(allocated, allocated);
    expect(remaining).toBe("0.00");
  });

  it("sum of capex + opex equals total budget", () => {
    const capex = "600000.33";
    const opex = "400000.67";
    const total = addNumeric(capex, opex);
    expect(total).toBe("1000001.00");
  });
});

describe("Financial precision — edge cases", () => {
  it("handles negative values (overspend)", () => {
    const allocated = "100000.00";
    const spent = "150000.00";
    const remaining = subtractNumeric(allocated, spent);
    expect(remaining).toBe("-50000.00");
    expect(Number(remaining)).toBeLessThan(0);
  });

  it("handles zero budget", () => {
    expect(toNumeric(0)).toBe("0.00");
    expect(addNumeric("0.00", "0.00")).toBe("0.00");
    expect(subtractNumeric("0.00", "0.00")).toBe("0.00");
  });

  it("handles very small amounts (cents)", () => {
    const result = addNumeric("0.01", "0.01");
    expect(result).toBe("0.02");
  });

  it("rounds sub-cent values consistently", () => {
    // numeric(15,2) rounds to 2 decimals
    expect(toNumeric(0.005)).toBe("0.01"); // rounds up
    expect(toNumeric(0.004)).toBe("0.00"); // rounds down
  });

  it("string representation matches DB default of '0'", () => {
    // Drizzle schema uses .default("0") for budget fields
    const dbDefault = "0";
    expect(toNumeric(dbDefault)).toBe("0.00");
  });
});
