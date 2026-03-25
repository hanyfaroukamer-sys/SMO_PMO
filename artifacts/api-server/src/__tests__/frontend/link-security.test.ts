import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const PAGES_DIR = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/pages",
);

const filesToCheck = [
  "project-detail.tsx",
  "progress-proof.tsx",
  "projects.tsx",
];

describe("External link security (rel=noopener)", () => {
  for (const filename of filesToCheck) {
    describe(filename, () => {
      const filePath = path.join(PAGES_DIR, filename);
      const content = fs.readFileSync(filePath, "utf-8");

      it('every target="_blank" has rel="noopener noreferrer" (or at least noopener)', () => {
        const lines = content.split("\n");
        const blankTargetLines: number[] = [];

        lines.forEach((line, i) => {
          if (line.includes('target="_blank"')) {
            blankTargetLines.push(i);
          }
        });

        // Should have at least one target="_blank" if the file uses external links
        // (some files may not have any, which is also fine)
        for (const lineIdx of blankTargetLines) {
          // Look in a window of surrounding lines for the rel attribute
          // (JSX attributes may span multiple lines)
          const window = lines
            .slice(Math.max(0, lineIdx - 3), lineIdx + 4)
            .join("\n");
          const hasNoopener =
            window.includes("noopener") || window.includes("noreferrer");
          expect(
            hasNoopener,
            `Line ${lineIdx + 1}: target="_blank" without rel="noopener" in ${filename}`,
          ).toBe(true);
        }
      });

      it('has no target="_blank" without any rel attribute nearby', () => {
        // Regex: find target="_blank" NOT followed within a few tokens by rel=
        const blankCount = (content.match(/target="_blank"/g) || []).length;
        const relCount = (
          content.match(/rel="[^"]*noopener[^"]*"/g) || []
        ).length;
        // Every blank target should have a corresponding rel with noopener
        expect(relCount).toBeGreaterThanOrEqual(blankCount);
      });
    });
  }
});
