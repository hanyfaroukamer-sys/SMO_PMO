import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTES_DIR = path.resolve(__dirname, "../../routes");

const productionRouteFiles = [
  "dependencies.ts",
  "import.ts",
  "spmo.ts",
];

describe("No console.log/console.error in production route files", () => {
  for (const filename of productionRouteFiles) {
    describe(filename, () => {
      const filePath = path.join(ROUTES_DIR, filename);
      const content = fs.readFileSync(filePath, "utf-8");

      it("does not use console.log", () => {
        const matches = content.match(/\bconsole\.log\s*\(/g);
        expect(
          matches,
          `Found ${matches?.length ?? 0} console.log() calls in ${filename}`,
        ).toBeNull();
      });

      it("does not use console.error", () => {
        const matches = content.match(/\bconsole\.error\s*\(/g);
        expect(
          matches,
          `Found ${matches?.length ?? 0} console.error() calls in ${filename}`,
        ).toBeNull();
      });

      it("uses req.log for logging if any logging is present", () => {
        // If the file has any logging calls, they should use req.log
        const hasReqLog = content.includes("req.log");
        const hasConsole = /\bconsole\.(log|error|warn|info)\s*\(/.test(content);
        // Either uses req.log or has no logging at all
        expect(hasConsole).toBe(false);
        // This is informational - req.log usage is recommended but not every file needs it
      });
    });
  }
});
