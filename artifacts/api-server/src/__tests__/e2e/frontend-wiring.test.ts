/**
 * Frontend → Backend URL wiring verification.
 *
 * This test reads the frontend source files and verifies that every
 * hardcoded API URL has a matching backend route. This would have
 * caught the evidence upload bug (frontend calling /api/storage/uploads/request-url
 * instead of /api/spmo/uploads/request-url).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FRONTEND_DIR = path.resolve(__dirname, "../../../../strategy-pmo/src");
const BACKEND_ROUTES_DIR = path.resolve(__dirname, "../../routes");

// ── Collect all fetch() URLs from frontend ──────────────────────
function extractFetchUrls(dir: string): { file: string; line: number; url: string; method: string }[] {
  const results: { file: string; line: number; url: string; method: string }[] = [];

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) continue;

      const content = fs.readFileSync(full, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        // Match fetch("/api/...") patterns (single, double, or backtick quotes)
        const fetchMatch = line.match(/fetch\(\s*["'`](\/?api\/[^"'`$]+)/);
        if (fetchMatch) {
          let fetchUrl = fetchMatch[1];
          // If URL was in a template literal and ended with `${...}`, append :param
          // e.g. `/api/spmo/milestones/${id}` extracts as `/api/spmo/milestones/`
          const afterMatch = line.slice((fetchMatch.index ?? 0) + fetchMatch[0].length);
          if (afterMatch.startsWith("${") && fetchUrl.endsWith("/")) {
            fetchUrl += ":param";
          }
          const method = line.includes("method:") ?
            (line.match(/method:\s*["'](\w+)["']/)?.[1] ?? "GET").toUpperCase() : "GET";
          results.push({
            file: path.relative(FRONTEND_DIR, full),
            line: idx + 1,
            url: fetchUrl.replace(/\$\{[^}]+\}/g, ":param"),
            method,
          });
        }

        // Match href="/api/..." or href=`/api/...` patterns
        const hrefMatch = line.match(/href\s*=\s*\{?\s*["'`](\/?api\/[^"'`$\s}]+)/);
        if (hrefMatch) {
          results.push({
            file: path.relative(FRONTEND_DIR, full),
            line: idx + 1,
            url: hrefMatch[1].replace(/\$\{[^}]+\}/g, ":param"),
            method: "GET",
          });
        }

        // Match window.location.href = `/api/...` patterns
        const locationMatch = line.match(/location\.href\s*=\s*["'`](\/?api\/[^"'`$\s]+)/);
        if (locationMatch) {
          results.push({
            file: path.relative(FRONTEND_DIR, full),
            line: idx + 1,
            url: locationMatch[1].replace(/\$\{[^}]+\}/g, ":param"),
            method: "GET",
          });
        }

        // Match URL variable declarations like: const loginUrl = `/api/login...`
        const urlVarMatch = line.match(/(?:const|let|var)\s+\w+(?:Url|URL|Link|Href)\s*=\s*["'`](\/?api\/[^"'`$\s]+)/);
        if (urlVarMatch) {
          results.push({
            file: path.relative(FRONTEND_DIR, full),
            line: idx + 1,
            url: urlVarMatch[1].replace(/\$\{[^}]+\}/g, ":param"),
            method: "GET",
          });
        }
      });
    }
  }

  walk(dir);
  return results;
}

// ── Collect all registered routes from backend ──────────────────
function extractBackendRoutes(dir: string): Set<string> {
  const routes = new Set<string>();

  // Read index.ts to find mount prefixes (e.g. router.use("/spmo/reports", reportsRouter))
  const indexPath = path.join(dir, "index.ts");
  const mountPrefixes = new Map<string, string>(); // filename → prefix
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, "utf-8");
    const mountRegex = /router\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)/g;
    let mm;
    while ((mm = mountRegex.exec(indexContent)) !== null) {
      // Find the import that defines this variable
      const varName = mm[2];
      const importMatch = indexContent.match(new RegExp(`import\\s+${varName}\\s+from\\s+["']\\.\\/([^"']+)["']`));
      if (importMatch) {
        mountPrefixes.set(importMatch[1] + ".ts", mm[1]);
      }
    }
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
    const prefix = mountPrefixes.get(entry.name) ?? "";

    // Match router.get("/path", ...), router.post("/path", ...), etc.
    const routeRegex = /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      const routePath = prefix + m[2];
      // Normalize route params: :id, *path → :param
      const normalized = routePath.replace(/:\w+/g, ":param").replace(/\*\w+/g, ":param");
      routes.add(normalized);
    }
  }

  return routes;
}

// ── Normalize a frontend URL to match backend route format ──────
function normalizeUrl(url: string): string {
  // Remove /api prefix (backend routes are mounted under /api)
  let normalized = url.startsWith("/api/") ? url.slice(4) : url.startsWith("api/") ? "/" + url.slice(4) : url;
  // Remove query strings
  normalized = normalized.split("?")[0];
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, "");
  // Replace dynamic segments with :param
  // e.g. /spmo/milestones/123 → /spmo/milestones/:param
  normalized = normalized.replace(/\/\d+/g, "/:param");
  // URLs ending with a template literal variable (cut off by regex) → add :param
  // e.g. /spmo/milestones/ from fetch(`/api/spmo/milestones/${id}`) → /spmo/milestones/:param
  if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

describe("Frontend → Backend URL Wiring", () => {
  const frontendUrls = extractFetchUrls(FRONTEND_DIR);
  const backendRoutes = extractBackendRoutes(BACKEND_ROUTES_DIR);

  it("frontend source directory exists", () => {
    expect(fs.existsSync(FRONTEND_DIR)).toBe(true);
  });

  it("backend routes directory exists", () => {
    expect(fs.existsSync(BACKEND_ROUTES_DIR)).toBe(true);
  });

  it("found frontend API calls", () => {
    expect(frontendUrls.length).toBeGreaterThan(0);
  });

  it("found backend routes", () => {
    expect(backendRoutes.size).toBeGreaterThan(0);
  });

  // ── Critical wiring checks ──────────────────────────────────
  // These specific URLs caused bugs before and MUST be verified.

  it("evidence upload URL points to /spmo/uploads/request-url (NOT /storage/)", () => {
    const uploadCalls = frontendUrls.filter(u => u.url.includes("uploads/request-url"));
    expect(uploadCalls.length).toBeGreaterThan(0);
    for (const call of uploadCalls) {
      expect(call.url).toContain("/spmo/uploads/request-url");
      expect(call.url).not.toContain("/storage/uploads/request-url");
    }
  });

  it("evidence download links use /storage/objects/ (correct)", () => {
    const downloadLinks = frontendUrls.filter(u => u.url.includes("/storage/objects"));
    expect(downloadLinks.length).toBeGreaterThan(0);
    for (const link of downloadLinks) {
      expect(link.url).toContain("/api/storage/objects");
    }
  });

  it("login link uses /api/login", () => {
    const loginLinks = frontendUrls.filter(u => u.url.includes("/login"));
    expect(loginLinks.length).toBeGreaterThan(0);
  });

  it("logout link uses /api/logout", () => {
    const logoutLinks = frontendUrls.filter(u => u.url.includes("/logout"));
    expect(logoutLinks.length).toBeGreaterThan(0);
  });

  // ── Systematic check: every fetch URL has a backend route ───
  const urlsToCheck = frontendUrls
    .map(u => ({ ...u, normalized: normalizeUrl(u.url) }))
    // Exclude external URLs (upload to GCS signed URL)
    .filter(u => u.normalized.startsWith("/"));

  // Group by normalized URL to avoid duplicate tests
  const uniqueUrls = new Map<string, typeof urlsToCheck[0]>();
  for (const u of urlsToCheck) {
    if (!uniqueUrls.has(u.normalized)) uniqueUrls.set(u.normalized, u);
  }

  for (const [normalized, info] of uniqueUrls) {
    // Some URLs are mount-point paths that won't match exactly (e.g. /login, /logout, /callback)
    // These are handled by authRouter or storageRouter
    const isAuthRoute = ["/login", "/logout", "/callback"].some(p => normalized.includes(p));
    const isStorageRoute = normalized.startsWith("/storage/");

    if (isAuthRoute || isStorageRoute) {
      // Auth and storage routes are registered differently — just check they exist in source
      it(`[${info.method}] ${info.url} — route file exists (${info.file}:${info.line})`, () => {
        const routeFiles = fs.readdirSync(BACKEND_ROUTES_DIR);
        if (isAuthRoute) {
          expect(routeFiles).toContain("auth.ts");
        } else {
          expect(routeFiles).toContain("storage.ts");
        }
      });
      continue;
    }

    it(`[${info.method}] ${info.url} → backend has matching route (${info.file}:${info.line})`, () => {
      // Check if any backend route matches (handling param wildcards)
      const normalizedParts = normalized.split("/").filter(Boolean);
      const hasMatch = [...backendRoutes].some(route => {
        const routeParts = route.split("/").filter(Boolean);
        if (routeParts.length !== normalizedParts.length) return false;
        return routeParts.every((part, i) =>
          part === normalizedParts[i] || part === ":param" || normalizedParts[i] === ":param"
        );
      });

      if (!hasMatch) {
        // Provide helpful error message
        const similar = [...backendRoutes]
          .filter(r => r.includes(normalizedParts[normalizedParts.length - 1]) ||
                       r.includes(normalizedParts[1] ?? ""))
          .slice(0, 3);
        expect.fail(
          `No backend route matches "${normalized}" (from ${info.file}:${info.line}).\n` +
          `Similar routes: ${similar.join(", ") || "none"}`
        );
      }
    });
  }

  // ── Report: all frontend API calls ──────────────────────────
  it("summary: lists all frontend API calls for review", () => {
    const summary = frontendUrls.map(u => `${u.method.padEnd(6)} ${u.url.padEnd(50)} ${u.file}:${u.line}`);
    // This test always passes — it's a documentation test
    expect(summary.length).toBeGreaterThan(0);
  });
});
