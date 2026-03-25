import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const VITE_CONFIG_PATH = path.resolve(
  __dirname,
  "../../../../strategy-pmo/vite.config.ts",
);

describe("Vite config (vite.config.ts)", () => {
  const content = fs.readFileSync(VITE_CONFIG_PATH, "utf-8");

  it('enables hidden source maps (sourcemap: "hidden")', () => {
    expect(content).toContain('sourcemap: "hidden"');
  });

  it("conditionally includes runtime error overlay based on NODE_ENV", () => {
    // The error overlay plugin should only be included in non-production
    expect(content).toContain("runtimeErrorOverlay");
    // Should be inside a NODE_ENV !== "production" conditional
    const hasEnvCheck =
      content.includes('NODE_ENV !== "production"') ||
      content.includes("NODE_ENV !== 'production'");
    expect(hasEnvCheck).toBe(true);
  });

  it("does not unconditionally include the runtime error overlay", () => {
    // The overlay should be wrapped in a conditional spread
    // Find the plugins array and verify runtimeErrorOverlay is inside a conditional
    const pluginsSection = content.match(/plugins\s*:\s*\[([\s\S]*?)\]\s*,/);
    expect(pluginsSection).not.toBeNull();
    // runtimeErrorOverlay should appear after a ternary/conditional spread
    const conditionalOverlay = /\.\.\..*NODE_ENV[\s\S]*runtimeErrorOverlay/;
    expect(conditionalOverlay.test(content)).toBe(true);
  });
});
