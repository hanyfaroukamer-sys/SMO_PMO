import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const EXPORT_PATH = path.resolve(
  __dirname,
  "../../../../strategy-pmo/src/lib/export.ts",
);

describe("Export module (export.ts) - ExcelJS migration", () => {
  const content = fs.readFileSync(EXPORT_PATH, "utf-8");

  it('does not import the old xlsx dependency (import * as XLSX from "xlsx")', () => {
    expect(content).not.toContain('import * as XLSX from "xlsx"');
    expect(content).not.toContain("from 'xlsx'");
    expect(content).not.toContain('from "xlsx"');
  });

  it("uses ExcelJS instead of xlsx", () => {
    expect(content).toContain("ExcelJS");
    const excelJsImport = /import\s+ExcelJS\s+from\s+["']exceljs["']/.test(content);
    expect(excelJsImport).toBe(true);
  });

  it("exportToXlsx is an async function", () => {
    const asyncExport = /export\s+async\s+function\s+exportToXlsx/.test(content);
    expect(asyncExport).toBe(true);
  });

  it("exportMultiSheetXlsx is an async function", () => {
    const asyncMultiSheet = /export\s+async\s+function\s+exportMultiSheetXlsx/.test(content);
    expect(asyncMultiSheet).toBe(true);
  });

  it("uses Workbook from ExcelJS", () => {
    expect(content).toContain("new ExcelJS.Workbook()");
  });

  it("writes buffer asynchronously with writeBuffer", () => {
    expect(content).toContain("writeBuffer");
    // Should await the buffer write
    expect(content).toContain("await wb.xlsx.writeBuffer()");
  });
});
