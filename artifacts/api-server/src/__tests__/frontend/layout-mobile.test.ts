import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LAYOUT_PATH = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/components/layout.tsx",
);

describe("Layout mobile responsiveness (layout.tsx)", () => {
  const content = fs.readFileSync(LAYOUT_PATH, "utf-8");

  it("imports useIsMobile hook", () => {
    expect(content).toContain("useIsMobile");
    expect(/import\s*\{[^}]*useIsMobile[^}]*\}/.test(content)).toBe(true);
  });

  it("imports Menu icon from lucide for hamburger", () => {
    expect(content).toContain("Menu");
    // Verify it's imported from lucide-react
    const lucideImport = /from\s+["']lucide-react["']/.test(content);
    expect(lucideImport).toBe(true);
    expect(/<Menu\s/.test(content)).toBe(true);
  });

  it('has role="navigation" on the nav element', () => {
    expect(content).toContain('role="navigation"');
  });

  it("has aria-label on navigation", () => {
    expect(content).toContain('aria-label=');
    // The nav element should have an aria-label
    const navWithAriaLabel = /role="navigation"[^>]*aria-label|aria-label[^>]*role="navigation"/;
    const navTag = /<nav[^>]*aria-label/;
    expect(navWithAriaLabel.test(content) || navTag.test(content)).toBe(true);
  });

  it("manages mobile sidebar state with mobileOpen", () => {
    expect(content).toContain("mobileOpen");
    expect(content).toContain("setMobileOpen");
  });

  it("renders mobile top bar conditionally", () => {
    // isMobile gate for the mobile top bar
    expect(content).toContain("isMobile");
    expect(content).toContain("mobileOpen");
  });

  it("has close button with aria-label for mobile menu", () => {
    expect(content).toContain('aria-label="Close navigation menu"');
  });

  it("has open button with aria-label for mobile menu", () => {
    expect(content).toContain('aria-label="Open navigation menu"');
  });
});
