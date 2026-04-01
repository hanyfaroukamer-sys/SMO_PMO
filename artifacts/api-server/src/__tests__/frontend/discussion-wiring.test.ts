import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/* ── Source paths ─────────────────────────────────────────────── */
const PROJECT_DETAIL = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/pages/project-detail.tsx",
);
const SPMO_ROUTER = path.resolve(
  __dirname,
  "../../routes/spmo.ts",
);
const MENTION_EMAIL = path.resolve(
  __dirname,
  "../../lib/mention-email.ts",
);

/* ── Tests ────────────────────────────────────────────────────── */

describe("Discussion tab in project-detail.tsx", () => {
  const src = fs.readFileSync(PROJECT_DETAIL, "utf-8");

  it('contains "Discussion" in the tabMap', () => {
    // tabMap maps string keys to TabKey values
    expect(src).toContain('"discussion"');
    expect(src).toMatch(/tabMap/);
  });

  it('includes "discussion" as a TabKey type member', () => {
    // The TabKey union type should include "discussion"
    expect(src).toMatch(/type\s+TabKey\s*=\s*[^;]*"discussion"/);
  });

  it('has a TABS array entry with key "discussion" and label "Discussion"', () => {
    // TABS array contains an object with key: "discussion", label: "Discussion"
    expect(src).toMatch(/TABS/);
    expect(src).toContain('"discussion"');
    expect(src).toContain('"Discussion"');
  });

  it("renders the DiscussionTab component when discussion tab is active", () => {
    expect(src).toContain("DiscussionTab");
    expect(src).toMatch(/activeTab\s*===\s*"discussion"/);
  });
});

describe("Comments API endpoints in spmo.ts", () => {
  const src = fs.readFileSync(SPMO_ROUTER, "utf-8");

  it("has GET /spmo/comments endpoint", () => {
    expect(src).toMatch(/router\.get\s*\(\s*["']\/spmo\/comments["']/);
  });

  it("has POST /spmo/comments endpoint", () => {
    expect(src).toMatch(/router\.post\s*\(\s*["']\/spmo\/comments["']/);
  });

  it("has DELETE /spmo/comments/:id endpoint", () => {
    expect(src).toMatch(/router\.delete\s*\(\s*["']\/spmo\/comments\/:id["']/);
  });
});

describe("Notification API endpoints in spmo.ts", () => {
  const src = fs.readFileSync(SPMO_ROUTER, "utf-8");

  it("has GET /spmo/notifications endpoint", () => {
    expect(src).toMatch(/router\.get\s*\(\s*["']\/spmo\/notifications["']/);
  });

  it("has POST /spmo/notifications/read-all endpoint", () => {
    expect(src).toMatch(/router\.post\s*\(\s*["']\/spmo\/notifications\/read-all["']/);
  });
});

describe("mention-email.ts exists and exports expected functions", () => {
  it("mention-email.ts file exists", () => {
    expect(fs.existsSync(MENTION_EMAIL)).toBe(true);
  });

  const src = fs.readFileSync(MENTION_EMAIL, "utf-8");

  it("exports sendEmail function", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+sendEmail\b/);
  });

  it("exports sendMentionEmail function", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+sendMentionEmail\b/);
  });
});

describe("Comment handler parses @mentions", () => {
  const src = fs.readFileSync(SPMO_ROUTER, "utf-8");

  it("uses a regex to parse structured @mentions (mentionRegex or structuredRegex)", () => {
    const hasMentionRegex = src.includes("mentionRegex");
    const hasStructuredRegex = src.includes("structuredRegex");
    expect(hasMentionRegex || hasStructuredRegex).toBe(true);
  });

  it("parses @[Name](userId) format mentions", () => {
    // The regex should match @[...](...)
    expect(src).toMatch(/@\\\[/);
  });
});

describe("Frontend renders @mentions as highlighted spans", () => {
  const src = fs.readFileSync(PROJECT_DETAIL, "utf-8");

  it("has a renderBody function for comment text", () => {
    expect(src).toContain("renderBody");
  });

  it("uses mentionMatch to detect @[Name](id) patterns", () => {
    expect(src).toContain("mentionMatch");
  });

  it("renders mentions with highlighted styling", () => {
    // The render should produce a <span> with styling for mentions
    const hasHighlight =
      src.includes("text-primary") && src.includes("@");
    expect(hasHighlight).toBe(true);
  });
});
