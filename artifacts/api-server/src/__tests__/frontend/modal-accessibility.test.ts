import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MODAL_PATH = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/components/modal.tsx",
);

describe("Modal accessibility (modal.tsx)", () => {
  const content = fs.readFileSync(MODAL_PATH, "utf-8");

  it('has role="dialog"', () => {
    expect(content).toContain('role="dialog"');
  });

  it('has aria-modal="true"', () => {
    expect(content).toContain('aria-modal="true"');
  });

  it('has aria-labelledby="modal-title"', () => {
    expect(content).toContain('aria-labelledby="modal-title"');
  });

  it('has id="modal-title" on the heading', () => {
    expect(content).toContain('id="modal-title"');
    // Verify it is on an h element
    const headingWithId = /(<h[1-6][^>]*id="modal-title"[^>]*>)/;
    expect(headingWithId.test(content)).toBe(true);
  });

  it('handles Escape key to close', () => {
    expect(content).toContain('e.key === "Escape"');
  });

  it("has tabIndex={-1} for focus management", () => {
    expect(content).toContain("tabIndex={-1}");
  });

  it("focuses the modal when opened via ref", () => {
    // Should use a ref to focus the dialog
    expect(content).toContain("modalRef");
    expect(content).toContain(".focus()");
  });
});
