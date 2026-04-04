import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Feature regression tests — verify that key features are still intact
 * after all changes. These are static source-code analysis tests that
 * read source files and assert structural properties. No DB needed.
 */

const FRONTEND_SRC = path.resolve(__dirname, "../../../../strategy-pmo/src");
const MOBILE_SRC = path.resolve(__dirname, "../../../../mobile-app");
const API_SRC = path.resolve(__dirname, "../../");

// ── Helper: read a file as UTF-8 ────────────────────────────────────────────
function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ── Pre-load frequently used files ──────────────────────────────────────────
const projectDetailSrc = read(path.join(FRONTEND_SRC, "pages/project-detail.tsx"));
const projectsSrc = read(path.join(FRONTEND_SRC, "pages/projects.tsx"));
const initiativesSrc = read(path.join(FRONTEND_SRC, "pages/initiatives.tsx"));
const pillarsSrc = read(path.join(FRONTEND_SRC, "pages/pillars.tsx"));
const notificationBellSrc = read(path.join(FRONTEND_SRC, "components/notification-bell.tsx"));
const adminSrc = read(path.join(FRONTEND_SRC, "pages/admin.tsx"));
const analyticsSrc = read(path.join(FRONTEND_SRC, "pages/analytics.tsx"));
const appTsxSrc = read(path.join(FRONTEND_SRC, "App.tsx"));
const spmoRouteSrc = read(path.join(API_SRC, "routes/spmo.ts"))
  + "\n" + read(path.join(API_SRC, "routes/spmo-comments.ts"))
  + "\n" + (fs.existsSync(path.join(API_SRC, "routes/spmo-kpis.ts")) ? read(path.join(API_SRC, "routes/spmo-kpis.ts")) : "")
  + "\n" + (fs.existsSync(path.join(API_SRC, "routes/spmo-admin.ts")) ? read(path.join(API_SRC, "routes/spmo-admin.ts")) : "");
const mentionEmailSrc = read(path.join(API_SRC, "lib/mention-email.ts"));
const mobileDashboardSrc = read(path.join(MOBILE_SRC, "app/(tabs)/index.tsx"));
const mobileProjectDetailSrc = read(path.join(MOBILE_SRC, "app/projects/[id].tsx"));
const mobileTasksSrc = read(path.join(MOBILE_SRC, "app/(tabs)/tasks.tsx"));
const spmoCalcSrc = read(path.join(API_SRC, "lib/spmo-calc.ts"));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Evidence upload URL
// ─────────────────────────────────────────────────────────────────────────────
describe("1. Evidence upload URL", () => {
  it("frontend files call /api/spmo/uploads/request-url (not /api/storage/)", () => {
    // project-detail.tsx uses the correct SPMO upload endpoint
    expect(projectDetailSrc).toContain("/api/spmo/uploads/request-url");
    expect(projectDetailSrc).not.toMatch(/fetch\(["'`]\/api\/storage\/uploads/);

    // projects.tsx also uses the correct SPMO upload endpoint
    expect(projectsSrc).toContain("/api/spmo/uploads/request-url");
    expect(projectsSrc).not.toMatch(/fetch\(["'`]\/api\/storage\/uploads/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Projects page uses effectiveWeight
// ─────────────────────────────────────────────────────────────────────────────
describe("2. Projects page uses effectiveWeight for badge display", () => {
  it("displays effectiveWeight in project badge", () => {
    expect(projectsSrc).toContain("effectiveWeight");
    // effectiveWeight used in badge display, stored weight used in form
    expect(projectsSrc).toContain("effectiveWeight > 0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Initiatives page uses effectiveWeight for badge display
// ─────────────────────────────────────────────────────────────────────────────
describe("3. Initiatives page uses effectiveWeight", () => {
  it("displays effectiveWeight in initiative table", () => {
    expect(initiativesSrc).toContain("effectiveWeight");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pillars page uses effectiveWeight
// ─────────────────────────────────────────────────────────────────────────────
describe("4. Pillars page uses effectiveWeight", () => {
  it("displays effectiveWeight instead of raw weight", () => {
    expect(pillarsSrc).toContain("effectiveWeight");
    expect(pillarsSrc).toMatch(/effectiveWeight\s*\?\?.*weight/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Project detail has Discussion tab in tabMap
// ─────────────────────────────────────────────────────────────────────────────
describe("5. Project detail Discussion tab in tabMap", () => {
  it("tabMap includes 'discussion' key", () => {
    // The tabMap should map discussion to a tab
    expect(projectDetailSrc).toMatch(/tabMap.*discussion/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Project detail Discussion tab is in TABS array
// ─────────────────────────────────────────────────────────────────────────────
describe("6. Discussion tab is in TABS array", () => {
  it("TABS array contains a discussion entry", () => {
    // TABS array has an entry with key: "discussion"
    expect(projectDetailSrc).toMatch(/key:\s*["'`]discussion["'`]/);
    // The label should say "Discussion"
    expect(projectDetailSrc).toMatch(/label:\s*["'`]Discussion["'`]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Notification bell navigates on click
// ─────────────────────────────────────────────────────────────────────────────
describe("7. Notification bell navigates on click", () => {
  it("uses navigate(n.link) to navigate when a notification is clicked", () => {
    expect(notificationBellSrc).toContain("navigate(n.link)");
    // Should import useLocation from wouter
    expect(notificationBellSrc).toMatch(/useLocation/);
    // The navigate function should be destructured from useLocation
    expect(notificationBellSrc).toMatch(/\[\s*,\s*navigate\s*\]\s*=\s*useLocation/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Discussion tab has inline @mention
// ─────────────────────────────────────────────────────────────────────────────
describe("8. Discussion tab has inline @mention support", () => {
  it("handleBodyChange exists and triggers mentionQuery", () => {
    expect(projectDetailSrc).toContain("handleBodyChange");
    expect(projectDetailSrc).toContain("mentionQuery");
    // mentionQuery is used as state
    expect(projectDetailSrc).toMatch(/setMentionQuery/);
    // Should search users via API
    expect(projectDetailSrc).toContain("/api/spmo/users/search");
  });

  it("has mention dropdown with user results", () => {
    expect(projectDetailSrc).toContain("mentionResults");
    expect(projectDetailSrc).toContain("showMentionDropdown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Comment POST endpoint parses structured mentions @[Name](id)
// ─────────────────────────────────────────────────────────────────────────────
describe("9. Comment POST endpoint parses structured @[Name](id) mentions", () => {
  it("has regex or logic for @[Name](id) format", () => {
    // The route file should contain the @[Name](id) pattern
    expect(spmoRouteSrc).toMatch(/@\[/);
    expect(spmoRouteSrc).toContain("@[User Name](userId)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Comment POST endpoint parses plain @Name mentions
// ─────────────────────────────────────────────────────────────────────────────
describe("10. Comment POST endpoint parses plain @Name mentions", () => {
  it("supports plain text @FirstName LastName fallback", () => {
    // Should have mention about plain text fallback
    expect(spmoRouteSrc).toContain("@FirstName LastName");
    // Should collect mentioned user IDs
    expect(spmoRouteSrc).toContain("mentionedUserIds");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Mention email uses sendMentionEmail (not inline SMTP)
// ─────────────────────────────────────────────────────────────────────────────
describe("11. Mention email uses sendMentionEmail", () => {
  it("comment route imports and calls sendMentionEmail from mention-email module", () => {
    // Route should dynamically import sendMentionEmail
    expect(spmoRouteSrc).toContain("sendMentionEmail");
    expect(spmoRouteSrc).toMatch(/import\(.*mention-email/);
  });

  it("sendMentionEmail is exported from mention-email.ts", () => {
    expect(mentionEmailSrc).toMatch(/export\s+(async\s+)?function\s+sendMentionEmail/);
  });

  it("does not contain inline nodemailer/SMTP in comments route for mentions", () => {
    // The mention notification logic in the comment route should NOT create its own
    // SMTP transport; it should delegate to sendMentionEmail
    const commentSection = spmoRouteSrc.slice(
      spmoRouteSrc.indexOf('router.post("/spmo/comments"'),
      spmoRouteSrc.indexOf('router.delete("/spmo/comments'),
    );
    expect(commentSection).not.toContain("createTransport");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Email transport priority: Resend > SendGrid > SMTP
// ─────────────────────────────────────────────────────────────────────────────
describe("12. Email transport priority order", () => {
  it("checks Resend first, then SendGrid, then SMTP", () => {
    const resendIdx = mentionEmailSrc.indexOf("RESEND_API_KEY");
    const sendgridIdx = mentionEmailSrc.indexOf("SENDGRID_API_KEY");
    const smtpIdx = mentionEmailSrc.indexOf("SMTP_HOST");

    expect(resendIdx).toBeGreaterThan(-1);
    expect(sendgridIdx).toBeGreaterThan(-1);
    expect(smtpIdx).toBeGreaterThan(-1);

    // Order: Resend checked first, then SendGrid, then SMTP
    expect(resendIdx).toBeLessThan(sendgridIdx);
    expect(sendgridIdx).toBeLessThan(smtpIdx);
  });

  it("falls back to console log when no transport is configured", () => {
    expect(mentionEmailSrc).toContain("No transport configured");
    expect(mentionEmailSrc).toContain("console.log");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Initiative budget is computed (POST endpoint strips budget)
// ─────────────────────────────────────────────────────────────────────────────
describe("13. Initiative budget is computed — POST strips budget", () => {
  it("POST /spmo/initiatives strips budget from request body", () => {
    // The initiative creation route should destructure budget away
    expect(spmoRouteSrc).toMatch(/budget:\s*_ignoredBudget/);
    // And set budget to 0 explicitly
    expect(spmoRouteSrc).toContain("budget: 0");
    // Should have a comment explaining computed budget
    expect(spmoRouteSrc).toContain("Budget is computed from child projects");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Initiative budget stripped from PUT endpoint
// ─────────────────────────────────────────────────────────────────────────────
describe("14. Initiative budget stripped from PUT endpoint", () => {
  it("PUT /spmo/initiatives/:id strips budget", () => {
    // The initiative update route should also strip budget
    expect(spmoRouteSrc).toContain("_ignoredBudget2");
    // Should have a comment about stripping manual budget input
    expect(spmoRouteSrc).toMatch(/Budget is computed from child projects.*strip/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Milestone auto-weight accepts startDate/dueDate params
// ─────────────────────────────────────────────────────────────────────────────
describe("15. Milestone auto-weight accepts startDate/dueDate params", () => {
  it("milestone creation schema or route accepts startDate and dueDate", () => {
    // The POST endpoint for milestone creation should accept startDate
    expect(spmoRouteSrc).toMatch(/startDate.*dueDate|dueDate.*startDate/s);
    // The milestone creation in the route should pass startDate through
    expect(spmoRouteSrc).toContain("startDate: parsed.data.startDate");
  });

  it("frontend resetWeightsToDuration computes weights from date ranges", () => {
    expect(projectsSrc).toContain("resetWeightsToDuration");
    // Should compute days from startDate and dueDate
    expect(projectsSrc).toMatch(/m\.startDate.*m\.dueDate/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Duration button exists (resetWeightsToDuration)
// ─────────────────────────────────────────────────────────────────────────────
describe("16. Duration button exists", () => {
  it("projects page has resetWeightsToDuration function", () => {
    expect(projectsSrc).toMatch(/function\s+resetWeightsToDuration|resetWeightsToDuration\s*=/);
  });

  it("function is wired to a clickable button", () => {
    // The button should call resetWeightsToDuration
    expect(projectsSrc).toMatch(/onClick.*resetWeightsToDuration|onPress.*resetWeightsToDuration/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Duration button uses bulkWeightMutation (not per-milestone update)
// ─────────────────────────────────────────────────────────────────────────────
describe("17. Duration button uses bulkWeightMutation", () => {
  it("uses useSetBulkSpmoMilestoneWeights hook", () => {
    expect(projectsSrc).toContain("useSetBulkSpmoMilestoneWeights");
  });

  it("resetWeightsToDuration calls bulkWeightMutation", () => {
    // Extract the resetWeightsToDuration function body
    const fnStart = projectsSrc.indexOf("resetWeightsToDuration");
    expect(fnStart).toBeGreaterThan(-1);
    // After the function starts, it should call bulkWeightMutation
    const afterFn = projectsSrc.slice(fnStart, fnStart + 2000);
    expect(afterFn).toContain("bulkWeightMutation");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Admin panel has effortDays config fields
// ─────────────────────────────────────────────────────────────────────────────
describe("18. Admin panel has effortDays config fields", () => {
  it("admin page references defaultPlanningEffortDays", () => {
    expect(adminSrc).toContain("defaultPlanningEffortDays");
  });

  it("admin page references defaultTenderingEffortDays", () => {
    expect(adminSrc).toContain("defaultTenderingEffortDays");
  });

  it("admin page references defaultExecutionEffortDays", () => {
    expect(adminSrc).toContain("defaultExecutionEffortDays");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Phase gate weights configurable from admin
// ─────────────────────────────────────────────────────────────────────────────
describe("19. Phase gate weights configurable from admin", () => {
  it("admin page references defaultPlanningWeight", () => {
    expect(adminSrc).toContain("defaultPlanningWeight");
  });

  it("admin page references defaultTenderingWeight", () => {
    expect(adminSrc).toContain("defaultTenderingWeight");
  });

  it("admin page references defaultExecutionWeight", () => {
    expect(adminSrc).toContain("defaultExecutionWeight");
  });

  it("admin page sends phase gate weights to programme-config API", () => {
    expect(adminSrc).toMatch(/programme-config|spmo\/config/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. Execution placeholder phaseGate = "execution_placeholder" in project creation
// ─────────────────────────────────────────────────────────────────────────────
describe("20. Execution placeholder in project creation", () => {
  it("project POST route creates milestone with phaseGate 'execution_placeholder'", () => {
    expect(spmoRouteSrc).toMatch(/phaseGate:\s*["'`]execution_placeholder["'`]/);
  });

  it("execution milestone is named 'Execution & Delivery'", () => {
    expect(spmoRouteSrc).toMatch(
      /name:\s*["'`]Execution\s*&\s*Delivery["'`].*phaseGate:\s*["'`]execution_placeholder["'`]/s,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. Execution placeholder hidden in project detail
// ─────────────────────────────────────────────────────────────────────────────
describe("21. Execution placeholder hidden in project detail", () => {
  it("route has isExecPlaceholder / isExecutionPlaceholder filter", () => {
    const hasFilter =
      spmoRouteSrc.includes("isExecPlaceholderSingle") ||
      spmoRouteSrc.includes("isExecutionPlaceholder");
    expect(hasFilter).toBe(true);
  });

  it("spmo-calc.ts also filters execution placeholders", () => {
    expect(spmoCalcSrc).toContain("isExecPlaceholder");
    expect(spmoCalcSrc).toContain("execution_placeholder");
  });

  it("PHASE_ORDER record includes execution_placeholder", () => {
    expect(spmoRouteSrc).toMatch(/PHASE_ORDER.*execution_placeholder/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. Mobile dashboard has department health section
// ─────────────────────────────────────────────────────────────────────────────
describe("22. Mobile dashboard has department health section", () => {
  it("mobile dashboard fetches /spmo/dashboard/department-status", () => {
    expect(mobileDashboardSrc).toContain("/spmo/dashboard/department-status");
  });

  it("has DeptStatus type definition", () => {
    expect(mobileDashboardSrc).toContain("DeptStatus");
    expect(mobileDashboardSrc).toContain("departmentName");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 23. Mobile dashboard has budget overview section
// ─────────────────────────────────────────────────────────────────────────────
describe("23. Mobile dashboard has budget overview section", () => {
  it("mobile dashboard fetches budget data", () => {
    expect(mobileDashboardSrc).toContain("/spmo/budget");
  });

  it("renders 'Budget Overview' section", () => {
    expect(mobileDashboardSrc).toContain("Budget Overview");
  });

  it("shows totalAllocated and utilization", () => {
    expect(mobileDashboardSrc).toContain("totalAllocated");
    expect(mobileDashboardSrc).toMatch(/utiliz/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 24. Mobile project detail has approve/reject buttons
// ─────────────────────────────────────────────────────────────────────────────
describe("24. Mobile project detail has approve/reject buttons", () => {
  it("has handleApprove function", () => {
    expect(mobileProjectDetailSrc).toContain("handleApprove");
    expect(mobileProjectDetailSrc).toMatch(/milestones.*approve/);
  });

  it("has handleReject function", () => {
    expect(mobileProjectDetailSrc).toContain("handleReject");
    expect(mobileProjectDetailSrc).toMatch(/milestones.*reject/);
  });

  it("has canApprove check for admin/approver roles", () => {
    expect(mobileProjectDetailSrc).toContain("canApprove");
    expect(mobileProjectDetailSrc).toMatch(/role.*admin.*approver|role.*approver.*admin/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 25. Mobile tasks navigate with tab and milestoneId params
// ─────────────────────────────────────────────────────────────────────────────
describe("25. Mobile tasks navigate with tab and milestoneId params", () => {
  it("tasks screen passes tab param in navigation", () => {
    expect(mobileTasksSrc).toMatch(/tab/);
    expect(mobileTasksSrc).toMatch(/router\.push/);
  });

  it("tasks screen passes milestoneId in navigation params", () => {
    expect(mobileTasksSrc).toContain("milestoneId");
  });

  it("project detail screen accepts tab and milestoneId search params", () => {
    expect(mobileProjectDetailSrc).toContain("useLocalSearchParams");
    expect(mobileProjectDetailSrc).toMatch(/tab.*milestoneId|milestoneId.*tab/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 26. Analytics page wrapped in AdminGuard
// ─────────────────────────────────────────────────────────────────────────────
describe("26. Analytics page wrapped in AdminGuard", () => {
  it("App.tsx wraps Analytics route in AdminGuard", () => {
    // Should have AdminGuard wrapping Analytics on the /admin/analytics route
    expect(appTsxSrc).toMatch(/AdminGuard.*Analytics/s);
  });

  it("AdminGuard function is defined in App.tsx", () => {
    expect(appTsxSrc).toMatch(/function\s+AdminGuard/);
    expect(appTsxSrc).toContain('role !== "admin"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 27. Analytics route is /admin/analytics
// ─────────────────────────────────────────────────────────────────────────────
describe("27. Analytics route is /admin/analytics", () => {
  it("App.tsx has a Route for /admin/analytics", () => {
    expect(appTsxSrc).toMatch(/path=["'`]\/admin\/analytics["'`]/);
  });

  it("layout sidebar links to /admin/analytics", () => {
    const layoutSrc = read(path.join(FRONTEND_SRC, "components/layout.tsx"));
    expect(layoutSrc).toContain("/admin/analytics");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 28. Scenario panel has adjustWeight checkbox
// ─────────────────────────────────────────────────────────────────────────────
describe("28. Scenario panel has adjustWeight checkbox", () => {
  it("analytics page has adjustWeight state", () => {
    expect(analyticsSrc).toMatch(/\[\s*adjustWeight\s*,\s*setAdjustWeight\s*\]/);
  });

  it("adjustWeight is sent in scenario request body", () => {
    expect(analyticsSrc).toContain("body.adjustWeight");
  });

  it("there is a checkbox input for adjustWeight", () => {
    expect(analyticsSrc).toMatch(/type=["'`]checkbox["'`].*adjustWeight/s);
  });

  it("calls /api/spmo/analytics/scenario endpoint", () => {
    expect(analyticsSrc).toContain("/api/spmo/analytics/scenario");
  });
});
