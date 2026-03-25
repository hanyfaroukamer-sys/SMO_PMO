import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../../..");
const WORKSPACE_FILE = path.join(WORKSPACE_ROOT, "pnpm-workspace.yaml");

describe("pnpm-workspace.yaml configuration", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(WORKSPACE_FILE, "utf-8");
  });

  it("workspace file exists", () => {
    expect(fs.existsSync(WORKSPACE_FILE)).toBe(true);
  });

  it("contains 'artifacts/*' package glob", () => {
    expect(content).toMatch(/^\s*-\s*artifacts\/\*/m);
  });

  it("contains 'lib/*' package glob", () => {
    expect(content).toMatch(/^\s*-\s*lib\/\*/m);
  });

  it("contains 'scripts' package entry", () => {
    expect(content).toMatch(/^\s*-\s*scripts\s*$/m);
  });

  it("does NOT contain dead 'lib/integrations/*' glob", () => {
    expect(content).not.toMatch(/lib\/integrations\/\*/);
  });

  it("packages section is present", () => {
    expect(content).toMatch(/^packages:/m);
  });

  it("lists exactly the expected workspace globs", () => {
    // Extract lines under "packages:" that start with "  - "
    const packagesMatch = content.match(/^packages:\s*\n((?:\s+-\s+.*\n?)*)/m);
    expect(packagesMatch).not.toBeNull();
    const entries = packagesMatch![1]
      .trim()
      .split("\n")
      .map((l) => l.replace(/^\s*-\s*/, "").trim());
    expect(entries).toContain("artifacts/*");
    expect(entries).toContain("lib/*");
    expect(entries).toContain("scripts");
  });
});
