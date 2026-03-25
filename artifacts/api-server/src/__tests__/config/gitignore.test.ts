import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../../..");
const GITIGNORE_FILE = path.join(WORKSPACE_ROOT, ".gitignore");

describe(".gitignore configuration", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(GITIGNORE_FILE, "utf-8");
  });

  it(".gitignore file exists", () => {
    expect(fs.existsSync(GITIGNORE_FILE)).toBe(true);
  });

  it("contains .env pattern", () => {
    // Should have a line that is exactly ".env" (not just .env.* or .env.example)
    expect(content).toMatch(/^\s*\.env\s*$/m);
  });

  it("contains *.tar.gz pattern", () => {
    expect(content).toMatch(/^\s*\*\.tar\.gz\s*$/m);
  });

  it("contains *.zip pattern", () => {
    expect(content).toMatch(/^\s*\*\.zip\s*$/m);
  });

  it("does NOT ignore .env.example (negation pattern present)", () => {
    // The gitignore should have a negation "!.env.example" to keep .env.example tracked
    expect(content).toMatch(/^\s*!\.env\.example\s*$/m);
  });

  it("ignores .env.* variants via wildcard", () => {
    expect(content).toMatch(/^\s*\.env\.\*\s*$/m);
  });

  it("ignores node_modules", () => {
    expect(content).toMatch(/^\s*node_modules\s*$/m);
  });

  it("ignores dist build output", () => {
    expect(content).toMatch(/^\s*dist\s*$/m);
  });
});
