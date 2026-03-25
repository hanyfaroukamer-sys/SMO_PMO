import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_PATH = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/App.tsx",
);

describe("App.tsx code-splitting patterns", () => {
  const content = fs.readFileSync(APP_PATH, "utf-8");

  it("uses React.lazy or lazy() for code splitting", () => {
    // The file imports `lazy` from react and uses it directly
    const lazyImport = /import\s*\{[^}]*\blazy\b[^}]*\}\s*from\s*["']react["']/.test(content);
    const lazyUsage = /\blazy\s*\(/.test(content);
    expect(lazyImport || /React\.lazy\(/.test(content)).toBe(true);
    expect(lazyUsage).toBe(true);
  });

  it("lazy-loads all page components (~21 pages)", () => {
    const lazyMatches = content.match(/\bconst\s+\w+\s*=\s*lazy\s*\(/g);
    expect(lazyMatches).not.toBeNull();
    // Should have roughly 21 lazy-loaded pages (allowing small variance)
    expect(lazyMatches!.length).toBeGreaterThanOrEqual(20);
    expect(lazyMatches!.length).toBeLessThanOrEqual(25);
  });

  it("wraps routes in <Suspense>", () => {
    expect(content).toContain("Suspense");
    expect(/<Suspense\s/.test(content)).toBe(true);
  });

  it("uses ErrorBoundary component", () => {
    expect(content).toContain("ErrorBoundary");
    expect(/<ErrorBoundary/.test(content)).toBe(true);
  });

  it("defines or imports AdminGuard component", () => {
    const hasAdminGuard =
      content.includes("function AdminGuard") ||
      content.includes("const AdminGuard") ||
      /import\s.*AdminGuard/.test(content);
    expect(hasAdminGuard).toBe(true);
  });

  it("uses AdminGuard to protect admin-only routes", () => {
    const adminGuardUsages = content.match(/<AdminGuard>/g);
    expect(adminGuardUsages).not.toBeNull();
    expect(adminGuardUsages!.length).toBeGreaterThanOrEqual(3);
  });
});
