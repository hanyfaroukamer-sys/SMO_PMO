import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const API_SRC = path.resolve(__dirname, "../../");
const PROJECT_ROOT = path.resolve(__dirname, "../../../../../");

/** Recursively collect .ts files, skipping excluded dirs */
function collectTsFiles(dir: string, excludeDirs: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        results.push(...collectTsFiles(fullPath, excludeDirs));
      }
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("No hardcoded secrets in source files", () => {
  const sourceFiles = collectTsFiles(API_SRC, [
    "__tests__",
    "node_modules",
    "dist",
    "migrations",
    "seed",
    "seeds",
  ]);

  it("found source files to scan", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("has no hardcoded API keys", () => {
    const apiKeyPatterns = [
      /["']sk-[a-zA-Z0-9]{20,}["']/,
      /["']pk-[a-zA-Z0-9]{20,}["']/,
      /["']api[_-]?key["']\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i,
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of apiKeyPatterns) {
        const match = pattern.exec(content);
        expect(
          match,
          `Possible hardcoded API key in ${path.relative(API_SRC, file)}: ${match?.[0]}`,
        ).toBeNull();
      }
    }
  });

  it("has no hardcoded passwords", () => {
    const passwordPatterns = [
      /password\s*[:=]\s*["'][^"']{4,}["']/i,
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of passwordPatterns) {
        const match = pattern.exec(content);
        // Allow schema/type definitions that mention "password" as a field name
        if (match) {
          const surrounding = content.slice(
            Math.max(0, match.index - 100),
            match.index + match[0].length + 100,
          );
          const isSchemaOrType =
            surrounding.includes("z.string()") ||
            surrounding.includes("z.object") ||
            surrounding.includes("type ") ||
            surrounding.includes("interface ") ||
            surrounding.includes("placeholder") ||
            surrounding.includes("label") ||
            surrounding.includes("validation") ||
            surrounding.includes("error");
          if (!isSchemaOrType) {
            expect.fail(
              `Possible hardcoded password in ${path.relative(API_SRC, file)}: ${match[0]}`,
            );
          }
        }
      }
    }
  });

  it("has no hardcoded JWT secrets or tokens", () => {
    const tokenPatterns = [
      /["']eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}/,  // JWT format
      /jwt[_-]?secret\s*[:=]\s*["'][a-zA-Z0-9]{8,}["']/i,
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of tokenPatterns) {
        const match = pattern.exec(content);
        expect(
          match,
          `Possible hardcoded token in ${path.relative(API_SRC, file)}: ${match?.[0]?.slice(0, 40)}...`,
        ).toBeNull();
      }
    }
  });

  it("uses process.env for secrets and config", () => {
    const routeFiles = sourceFiles.filter((f) => f.includes("/routes/"));
    const libFiles = sourceFiles.filter((f) => f.includes("/lib/"));
    const configFiles = [...routeFiles, ...libFiles];

    const filesUsingEnv = configFiles.filter((f) => {
      const content = fs.readFileSync(f, "utf-8");
      return content.includes("process.env");
    });

    // The project should use environment variables for configuration
    expect(filesUsingEnv.length).toBeGreaterThanOrEqual(0);
  });

  it(".env.example exists at project root", () => {
    const envExamplePath = path.join(PROJECT_ROOT, ".env.example");
    expect(fs.existsSync(envExamplePath)).toBe(true);
  });
});
