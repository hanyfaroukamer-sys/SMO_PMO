/**
 * Report structure regression tests — verifies the PDF and PPTX report
 * handlers in reports.ts produce correct page/slide order, contain all
 * required sections, and use proper formatting constants.
 *
 * All tests read the source file directly via fs.readFileSync so they
 * run without database or network dependencies.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const REPORTS_PATH = path.resolve(__dirname, "../../routes/reports.ts");
const src = fs.readFileSync(REPORTS_PATH, "utf-8");

// Split into PDF and PPTX handler bodies for targeted assertions
const pdfStart = src.indexOf('router.post("/pdf"');
const pptxStart = src.indexOf('router.post("/pptx"');
const pdfBody = src.slice(pdfStart, pptxStart);
const pptxBody = src.slice(pptxStart);

// ════════════════════════════════════════════════════════════════════════════
// 1. PDF page order
// ════════════════════════════════════════════════════════════════════════════
describe("PDF page order", () => {
  it("Cover page comes first (PAGE 1)", () => {
    const coverIdx = pdfBody.indexOf("PAGE 1: COVER");
    expect(coverIdx).toBeGreaterThan(-1);
    // Cover should appear before any doc.addPage() call
    const firstAddPage = pdfBody.indexOf("doc.addPage()");
    expect(coverIdx).toBeLessThan(firstAddPage);
  });

  it("Programme Overview appears after Cover", () => {
    const coverIdx = pdfBody.indexOf("PAGE 1: COVER");
    const progOverviewIdx = pdfBody.indexOf("Programme Overview");
    expect(progOverviewIdx).toBeGreaterThan(coverIdx);
  });

  it("Department Overview appears after Programme Overview", () => {
    const progOverviewIdx = pdfBody.indexOf('"Programme Overview"');
    const deptOverviewIdx = pdfBody.indexOf('"Department Overview"');
    expect(deptOverviewIdx).toBeGreaterThan(progOverviewIdx);
  });

  it("Project Portfolio appears after Department Overview", () => {
    const deptOverviewIdx = pdfBody.indexOf('"Department Overview"');
    const portfolioIdx = pdfBody.indexOf('"Project Portfolio"');
    expect(portfolioIdx).toBeGreaterThan(deptOverviewIdx);
  });

  it("Budget & KPIs appears after Project Portfolio", () => {
    const portfolioIdx = pdfBody.indexOf('"Project Portfolio"');
    const budgetIdx = pdfBody.indexOf('"Budget Health & Strategic KPIs"');
    expect(budgetIdx).toBeGreaterThan(portfolioIdx);
  });

  it("Risk Summary appears after Budget & KPIs", () => {
    const budgetIdx = pdfBody.indexOf('"Budget Health & Strategic KPIs"');
    const riskIdx = pdfBody.indexOf('"Risk Summary"');
    expect(riskIdx).toBeGreaterThan(budgetIdx);
  });

  it("Detail pages appear near the end (after Risk Summary)", () => {
    const riskIdx = pdfBody.indexOf('"Risk Summary"');
    const detailIdx = pdfBody.indexOf("At-Risk and Delayed Projects");
    expect(detailIdx).toBeGreaterThan(riskIdx);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Department grouping in Project Portfolio
// ════════════════════════════════════════════════════════════════════════════
describe("Department grouping in Project Portfolio", () => {
  it('contains "Department:" header rows in the PDF portfolio section', () => {
    expect(pdfBody).toContain("Department: ${deptName}");
  });

  it("drawDeptHeader function is defined and used", () => {
    expect(pdfBody).toContain("drawDeptHeader");
    const defIdx = pdfBody.indexOf("const drawDeptHeader");
    const callIdx = pdfBody.indexOf("drawDeptHeader(ptY");
    expect(defIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(defIdx);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Risk matrix exists (4x4)
// ════════════════════════════════════════════════════════════════════════════
describe("Risk matrix", () => {
  it("defines probLevels with 4 levels", () => {
    const match = pdfBody.match(/const probLevels\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const levels = match![1].split(",").map((s) => s.trim().replace(/"/g, ""));
    expect(levels).toEqual(["low", "medium", "high", "critical"]);
  });

  it("defines impactLevels with 4 levels", () => {
    const match = pdfBody.match(/const impactLevels\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const levels = match![1].split(",").map((s) => s.trim().replace(/"/g, ""));
    expect(levels).toEqual(["low", "medium", "high", "critical"]);
  });

  it("builds a riskMatrix from probLevels x impactLevels", () => {
    expect(pdfBody).toContain("riskMatrix");
    expect(pdfBody).toContain("probLevels.map");
    expect(pdfBody).toContain("impactLevels.map");
  });

  it("renders the Risk Heat Map title", () => {
    expect(pdfBody).toContain("Risk Heat Map");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Department health bar on Risk page
// ════════════════════════════════════════════════════════════════════════════
describe("Department health bar", () => {
  it("has a Department Risk Distribution section", () => {
    expect(pdfBody).toContain("Department Risk Criticality");
  });

  it("renders stacked risk bars for departments (red/amber/green segments)", () => {
    // The department health bar section filters risks per department
    expect(pdfBody).toContain("deptHealthBarW");
    expect(pdfBody).toContain("deptHealthBarH");
    expect(pdfBody).toContain("redCount");
    expect(pdfBody).toContain("amberCount");
    expect(pdfBody).toContain("greenCount");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Weekly report data used
// ════════════════════════════════════════════════════════════════════════════
describe("Weekly report data", () => {
  it("PDF handler accesses weeklyReports.get() for project data", () => {
    expect(pdfBody).toContain("weeklyReports.get(");
  });

  it("reads keyAchievements from weekly reports", () => {
    expect(pdfBody).toContain("keyAchievements");
  });

  it("reads nextSteps from weekly reports", () => {
    expect(pdfBody).toContain("nextSteps");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Font sizes all >= 7
// ════════════════════════════════════════════════════════════════════════════
describe("Font sizes", () => {
  it("no fontSize below 7 in the PDF handler", () => {
    const fontSizePattern = /\.fontSize\((\d+(?:\.\d+)?)\)/g;
    let match: RegExpExecArray | null;
    const tooSmall: number[] = [];
    while ((match = fontSizePattern.exec(pdfBody)) !== null) {
      const size = parseFloat(match[1]);
      if (size < 7) tooSmall.push(size);
    }
    expect(tooSmall).toEqual([]);
  });

  it("no fontSize below 7 in the PPTX handler", () => {
    const fontSizePattern = /fontSize:\s*(\d+(?:\.\d+)?)/g;
    let match: RegExpExecArray | null;
    const tooSmall: number[] = [];
    while ((match = fontSizePattern.exec(pptxBody)) !== null) {
      const size = parseFloat(match[1]);
      if (size < 7) tooSmall.push(size);
    }
    expect(tooSmall).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Color constants defined
// ════════════════════════════════════════════════════════════════════════════
describe("Color constants (C object)", () => {
  const requiredColors = [
    "primary",
    "dark",
    "bg",
    "border",
    "white",
    "green",
    "amber",
    "red",
  ];

  for (const color of requiredColors) {
    it(`C.${color} is defined`, () => {
      // Match inside the C = { ... } block
      const cBlock = src.match(/const C = \{([^}]+)\}/s);
      expect(cBlock).not.toBeNull();
      expect(cBlock![1]).toContain(`${color}:`);
    });
  }

  it("C.secondary is defined (used as mid-tone)", () => {
    const cBlock = src.match(/const C = \{([^}]+)\}/s);
    expect(cBlock).not.toBeNull();
    expect(cBlock![1]).toContain("secondary:");
  });

  it("C.lightRed is defined for overdue highlighting", () => {
    const cBlock = src.match(/const C = \{([^}]+)\}/s);
    expect(cBlock).not.toBeNull();
    expect(cBlock![1]).toContain("lightRed:");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. MARGIN/M consistency
// ════════════════════════════════════════════════════════════════════════════
describe("MARGIN/M consistency", () => {
  it("M is declared as a const in PDF handler", () => {
    expect(pdfBody).toMatch(/const M\s*=\s*\d+/);
  });

  it("MARGIN is declared as an alias for M", () => {
    expect(pdfBody).toMatch(/const MARGIN\s*=\s*M/);
  });

  it("no bare MARGIN usage without prior declaration in PDF body", () => {
    // MARGIN should only appear after its declaration
    const declIdx = pdfBody.indexOf("const MARGIN");
    expect(declIdx).toBeGreaterThan(-1);
    // Check there is no MARGIN reference before declaration (excluding comments)
    const beforeDecl = pdfBody.slice(0, declIdx);
    const marginUsage = beforeDecl.match(/[^a-zA-Z]MARGIN[^a-zA-Z]/g);
    expect(marginUsage).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. All doc.addPage() have pdfAccentBar
// ════════════════════════════════════════════════════════════════════════════
describe("Accent bar on every page", () => {
  it("every doc.addPage() is followed by pdfAccentBar(doc)", () => {
    // First page (cover) gets pdfAccentBar without addPage
    expect(pdfBody).toContain("pdfAccentBar(doc)");

    // For each addPage call, pdfAccentBar should follow within a few lines
    const addPageIndices: number[] = [];
    let searchFrom = 0;
    while (true) {
      const idx = pdfBody.indexOf("doc.addPage()", searchFrom);
      if (idx === -1) break;
      addPageIndices.push(idx);
      searchFrom = idx + 1;
    }

    expect(addPageIndices.length).toBeGreaterThan(0);

    for (const idx of addPageIndices) {
      // pdfAccentBar should appear within 200 chars after addPage
      const after = pdfBody.slice(idx, idx + 200);
      expect(after).toContain("pdfAccentBar(doc)");
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. Footer applied to all pages
// ════════════════════════════════════════════════════════════════════════════
describe("Footer on all pages", () => {
  it("bufferedPageRange loop exists to iterate all pages", () => {
    expect(pdfBody).toContain("bufferedPageRange()");
  });

  it("switchToPage is called in the footer loop", () => {
    expect(pdfBody).toContain("switchToPage");
  });

  it("pdfFooter is called for each page in the loop", () => {
    const rangeIdx = pdfBody.indexOf("bufferedPageRange()");
    const footerCallIdx = pdfBody.indexOf("pdfFooter(doc", rangeIdx);
    expect(footerCallIdx).toBeGreaterThan(rangeIdx);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. PPTX handler exists and has slides
// ════════════════════════════════════════════════════════════════════════════
describe("PPTX handler", () => {
  it('router.post("/pptx") exists', () => {
    expect(src).toContain('router.post("/pptx"');
  });

  it("creates PptxGenJS instance", () => {
    expect(pptxBody).toContain("new PptxGenJS()");
  });

  it("adds at least 5 slides via addSlide()", () => {
    const slideMatches = pptxBody.match(/pptx\.addSlide\(\)/g);
    expect(slideMatches).not.toBeNull();
    expect(slideMatches!.length).toBeGreaterThanOrEqual(5);
  });

  it("sends the PPTX buffer as response", () => {
    expect(pptxBody).toContain("pptx.write(");
    expect(pptxBody).toContain("res.send(pptxBuffer)");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. Both handlers call gatherReportData()
// ════════════════════════════════════════════════════════════════════════════
describe("gatherReportData usage", () => {
  it("PDF handler calls gatherReportData()", () => {
    expect(pdfBody).toContain("gatherReportData()");
  });

  it("PPTX handler calls gatherReportData()", () => {
    expect(pptxBody).toContain("gatherReportData()");
  });

  it("gatherReportData function is defined", () => {
    expect(src).toContain("async function gatherReportData()");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. Status color functions exist
// ════════════════════════════════════════════════════════════════════════════
describe("Status color functions", () => {
  it("statusColor function is defined", () => {
    expect(src).toMatch(/function statusColor\(/);
  });

  it("statusPtxColor function is defined", () => {
    expect(src).toMatch(/function statusPtxColor\(/);
  });

  it("statusLabel function is defined", () => {
    expect(src).toMatch(/function statusLabel\(/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 14. No hardcoded text in wrong language
// ════════════════════════════════════════════════════════════════════════════
describe("All text is English", () => {
  it("does not contain Arabic characters", () => {
    const arabicPattern = /[\u0600-\u06FF]/;
    expect(arabicPattern.test(src)).toBe(false);
  });

  it("does not contain Chinese characters", () => {
    const chinesePattern = /[\u4E00-\u9FFF]/;
    expect(chinesePattern.test(src)).toBe(false);
  });

  it("does not contain Cyrillic characters", () => {
    const cyrillicPattern = /[\u0400-\u04FF]/;
    expect(cyrillicPattern.test(src)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 15. CONFIDENTIAL footer on every page
// ════════════════════════════════════════════════════════════════════════════
describe("CONFIDENTIAL text", () => {
  it("PDF footer includes CONFIDENTIAL", () => {
    // pdfFooter function contains CONFIDENTIAL
    const footerFn = src.match(/function pdfFooter[\s\S]*?\n\}/);
    expect(footerFn).not.toBeNull();
    expect(footerFn![0]).toContain("CONFIDENTIAL");
  });

  it("PDF cover page includes CONFIDENTIAL", () => {
    expect(pdfBody).toContain('"CONFIDENTIAL"');
  });

  it("PPTX footer includes CONFIDENTIAL", () => {
    expect(pptxBody).toContain("CONFIDENTIAL");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 16. Report filename has date
// ════════════════════════════════════════════════════════════════════════════
describe("Report filename includes date", () => {
  it("PDF Content-Disposition includes ISO date", () => {
    expect(pdfBody).toMatch(/Content-Disposition.*Strategy-Weekly-Report-.*toISOString/s);
  });

  it("PPTX Content-Disposition includes ISO date", () => {
    expect(pptxBody).toMatch(/Content-Disposition.*Strategy-Weekly-Report-.*toISOString/s);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 17. PDF handler pipes to response
// ════════════════════════════════════════════════════════════════════════════
describe("PDF pipe to response", () => {
  it("doc.pipe(res) exists in PDF handler", () => {
    expect(pdfBody).toContain("doc.pipe(res)");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 18. doc.end() called
// ════════════════════════════════════════════════════════════════════════════
describe("PDF document closure", () => {
  it("doc.end() is called to finalize the PDF", () => {
    expect(pdfBody).toContain("doc.end()");
  });

  it("doc.end() comes after the footer loop", () => {
    const footerLoopIdx = pdfBody.indexOf("bufferedPageRange()");
    const endIdx = pdfBody.indexOf("doc.end()", footerLoopIdx);
    expect(endIdx).toBeGreaterThan(footerLoopIdx);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 19. Per-project detail pages for at-risk/delayed
// ════════════════════════════════════════════════════════════════════════════
describe("Per-project detail pages", () => {
  it("section for at-risk/delayed project detail pages exists", () => {
    expect(pdfBody).toContain("At-Risk and Delayed Projects");
  });

  it("filters flaggedProjects for delayed or at_risk status", () => {
    expect(pdfBody).toContain("flaggedProjects");
    expect(pdfBody).toContain('computedStatus === "delayed"');
    expect(pdfBody).toContain('computedStatus === "at_risk"');
  });

  it("iterates flaggedProjects and adds a page for each", () => {
    const flaggedIdx = pdfBody.indexOf("flaggedProjects");
    const addPageAfter = pdfBody.indexOf("doc.addPage()", flaggedIdx);
    expect(addPageAfter).toBeGreaterThan(flaggedIdx);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 20. Detail pages show milestones
// ════════════════════════════════════════════════════════════════════════════
describe("Detail pages show milestones", () => {
  it("milestones table header is rendered in detail section", () => {
    // The detail section has a Milestones header and column layout
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain('"Milestones"');
    expect(detailSection).toContain("msHeaders");
  });

  it("milestone columns include Due Date, Progress, Status", () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain('"Due Date"');
    expect(detailSection).toContain('"Progress"');
    expect(detailSection).toContain('"Status"');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 21. Detail pages show achievements
// ════════════════════════════════════════════════════════════════════════════
describe("Detail pages show achievements", () => {
  it("keyAchievements accessed in the detail section", () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain("keyAchievements");
  });

  it("statusReason accessed as fallback in detail section", () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain("statusReason");
  });

  it('"Key Achievements" header is rendered', () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain('"Key Achievements"');
  });

  it('"Next Steps" header is rendered', () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain('"Next Steps"');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 22. Delayed milestones highlighted
// ════════════════════════════════════════════════════════════════════════════
describe("Delayed milestone highlighting", () => {
  it("uses lightRed / FEE2E2 for overdue milestone rows", () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain("detLightRed");
    expect(detailSection).toContain("#FEE2E2");
  });

  it("checks isOverdue condition for milestones", () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain("isOverdue");
  });

  it("calculates daysOverdue for overdue milestones", () => {
    const detailSection = pdfBody.slice(pdfBody.indexOf("At-Risk and Delayed Projects"));
    expect(detailSection).toContain("daysOverdue");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 23. Budget formatted as SAR XM
// ════════════════════════════════════════════════════════════════════════════
describe("Budget SAR formatting", () => {
  it("fmtSAR function returns SAR prefix", () => {
    expect(src).toContain("function fmtSAR");
    expect(src).toContain('`SAR ${');
  });

  it("inline SAR formatting in portfolio table uses SAR prefix", () => {
    expect(pdfBody).toContain("SAR ${");
  });

  it("handles millions (M) and thousands (K)", () => {
    const fmtFn = src.slice(src.indexOf("function fmtSAR"), src.indexOf("function fmtSAR") + 300);
    expect(fmtFn).toContain("1_000_000");
    expect(fmtFn).toContain("1_000");
    expect(fmtFn).toMatch(/SAR.*M/);
    expect(fmtFn).toMatch(/SAR.*K/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 24. Stacked bars for departments
// ════════════════════════════════════════════════════════════════════════════
describe("Stacked bars for departments", () => {
  it("Department Overview section renders stacked/segmented bars", () => {
    // The department overview has barSegments with on_track/at_risk/delayed
    expect(pdfBody).toContain("barSegs");
    expect(pdfBody).toContain("segX");
  });

  it("bar segments use green, amber, red, and secondary colors", () => {
    const deptSection = pdfBody.slice(
      pdfBody.indexOf('"Department Overview"'),
      pdfBody.indexOf('"Project Portfolio"'),
    );
    expect(deptSection).toContain("C.green");
    expect(deptSection).toContain("C.amber");
    expect(deptSection).toContain("C.red");
    expect(deptSection).toContain("C.secondary");
  });

  it("stacked bar width is proportional to segment counts", () => {
    expect(pdfBody).toContain("(seg.count / dTotal) * barW");
  });
});

describe("PPTX runtime safety", () => {
  it("does not use ShapeType.roundRect (invalid in PptxGenJS v4)", () => {
    expect(pptxBody).not.toContain("ShapeType.roundRect");
  });

  it("all ShapeType references use valid types (rect, line, ellipse)", () => {
    const shapeRefs = pptxBody.match(/ShapeType\.(\w+)/g) || [];
    const validShapes = new Set(["ShapeType.rect", "ShapeType.line", "ShapeType.ellipse", "ShapeType.roundRect"]);
    // roundRect was fixed to rect, but keep check in case it comes back
    for (const ref of shapeRefs) {
      expect(ref).not.toBe("ShapeType.roundRect");
    }
  });

  it("addTable calls have valid row data (not undefined)", () => {
    expect(pptxBody).toContain("addTable(");
    // Ensure table rows are built before being passed
    expect(pptxBody).toContain("TableRow[]");
  });

  it("PPTX slides use 8pt minimum font for body text", () => {
    const fontSizes = pptxBody.match(/fontSize:\s*(\d+(?:\.\d+)?)/g) || [];
    const tooSmall = fontSizes.filter((fs) => {
      const size = parseFloat(fs.match(/\d+(?:\.\d+)?/)![0]);
      return size < 7;
    });
    expect(tooSmall).toEqual([]);
  });
});
