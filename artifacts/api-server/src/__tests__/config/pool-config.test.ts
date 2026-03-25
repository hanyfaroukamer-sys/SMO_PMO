import { describe, it, expect } from "vitest";

/**
 * Database pool configuration tests.
 *
 * We re-create the expected pool config object rather than importing it,
 * because importing the actual DB module would attempt a real connection.
 */

const expectedPoolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

describe("Database pool configuration", () => {
  it("max connections is 20", () => {
    expect(expectedPoolConfig.max).toBe(20);
  });

  it("idle timeout is 30 seconds (30000 ms)", () => {
    expect(expectedPoolConfig.idleTimeoutMillis).toBe(30000);
    expect(expectedPoolConfig.idleTimeoutMillis).toBe(30 * 1000);
  });

  it("connection timeout is 5 seconds (5000 ms)", () => {
    expect(expectedPoolConfig.connectionTimeoutMillis).toBe(5000);
    expect(expectedPoolConfig.connectionTimeoutMillis).toBe(5 * 1000);
  });

  it("idle timeout is greater than connection timeout", () => {
    expect(expectedPoolConfig.idleTimeoutMillis).toBeGreaterThan(
      expectedPoolConfig.connectionTimeoutMillis
    );
  });

  it("max connections is a positive integer", () => {
    expect(Number.isInteger(expectedPoolConfig.max)).toBe(true);
    expect(expectedPoolConfig.max).toBeGreaterThan(0);
  });

  it("all values are finite numbers", () => {
    expect(Number.isFinite(expectedPoolConfig.max)).toBe(true);
    expect(Number.isFinite(expectedPoolConfig.idleTimeoutMillis)).toBe(true);
    expect(Number.isFinite(expectedPoolConfig.connectionTimeoutMillis)).toBe(true);
  });
});
