import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SPMO_PATH = path.resolve(__dirname, "../../routes/spmo.ts");

describe("Auth coverage for all SPMO routes", () => {
  const content = fs.readFileSync(SPMO_PATH, "utf-8");

  it("defines requireAuth helper", () => {
    expect(content).toContain("function requireAuth(");
  });

  it("defines requireRole helper", () => {
    expect(content).toContain("function requireRole(");
  });

  it("has auth on every single route handler", () => {
    // Count route definitions
    const routePattern = /router\.(get|post|put|patch|delete)\s*\(/g;
    const routeMatches = content.match(routePattern) || [];
    const totalRoutes = routeMatches.length;

    // Count auth calls (excluding the function definitions themselves)
    // Routes use requireAuth, requireRole, requireAdmin, or getAuthUser
    const authCallPattern = /(?:const\s+\w+\s*=\s*)?(?:require(?:Auth|Role|Admin)|getAuthUser)\s*\(/g;
    const allAuthMatches = content.match(authCallPattern) || [];
    // Exclude function definitions (they contain "function" keyword)
    const authCalls = allAuthMatches.filter(
      (m) => !m.includes("function"),
    );
    const totalAuthCalls = authCalls.length;

    // Every route should have at least one auth call
    expect(totalRoutes).toBeGreaterThan(0);
    expect(totalAuthCalls).toBeGreaterThanOrEqual(totalRoutes);
  });

  it("has at least 80 route handlers (comprehensive API)", () => {
    const routePattern = /router\.(get|post|put|patch|delete)\s*\(/g;
    const routeMatches = content.match(routePattern) || [];
    expect(routeMatches.length).toBeGreaterThanOrEqual(80);
  });

  it("uses requireRole for sensitive admin/write operations", () => {
    const roleMatches = content.match(/requireRole\s*\(\s*req/g) || [];
    // There should be multiple requireRole calls for elevated routes
    expect(roleMatches.length).toBeGreaterThanOrEqual(10);
  });

  it("each route handler calls auth within its first few lines", () => {
    // Find each route definition line and verify auth is called shortly after
    const lines = content.split("\n");
    const routeLineIndices: number[] = [];
    const routePattern = /^router\.(get|post|put|patch|delete)\s*\(/;

    lines.forEach((line, idx) => {
      if (routePattern.test(line.trim())) {
        routeLineIndices.push(idx);
      }
    });

    expect(routeLineIndices.length).toBeGreaterThan(0);

    const routesWithoutEarlyAuth: string[] = [];
    for (const lineIdx of routeLineIndices) {
      // Check next 10 lines for an auth call
      const window = lines.slice(lineIdx, lineIdx + 10).join("\n");
      const hasAuth =
        window.includes("requireAuth(") ||
        window.includes("requireRole(") ||
        window.includes("requireAdmin(") ||
        window.includes("getAuthUser(");
      if (!hasAuth) {
        routesWithoutEarlyAuth.push(
          `Line ${lineIdx + 1}: ${lines[lineIdx].trim().slice(0, 80)}`,
        );
      }
    }
    expect(
      routesWithoutEarlyAuth,
      `Routes missing early auth:\n${routesWithoutEarlyAuth.join("\n")}`,
    ).toHaveLength(0);
  });
});
