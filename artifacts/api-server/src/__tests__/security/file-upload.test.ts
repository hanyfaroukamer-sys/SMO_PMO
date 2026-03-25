import { describe, it, expect } from "vitest";

// Re-implement the file upload filter logic for isolated testing

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".xlsx",
  ".xls",
  ".csv",
  ".docx",
  ".pptx",
  ".ppt",
];

interface MockFile {
  originalname: string;
}

type FilterCallback = (error: Error | null, accept: boolean) => void;

function fileFilter(
  _req: unknown,
  file: MockFile,
  cb: FilterCallback
): void {
  const ext = "." + (file.originalname.split(".").pop() || "").toLowerCase();
  cb(null, ALLOWED_EXTENSIONS.includes(ext));
}

function checkFile(filename: string): Promise<boolean> {
  return new Promise((resolve) => {
    fileFilter(null, { originalname: filename }, (_err, accepted) => {
      resolve(accepted);
    });
  });
}

describe("File Upload Filter", () => {
  describe("allowed extensions", () => {
    it.each([
      "report.pdf",
      "data.xlsx",
      "data.xls",
      "export.csv",
      "document.docx",
      "presentation.pptx",
      "slides.ppt",
    ])("allows %s", async (filename) => {
      expect(await checkFile(filename)).toBe(true);
    });
  });

  describe("dangerous extensions rejected", () => {
    it.each([
      ["malware.exe", ".exe"],
      ["script.sh", ".sh"],
      ["code.js", ".js"],
      ["hack.py", ".py"],
      ["backdoor.php", ".php"],
      ["virus.bat", ".bat"],
      ["binary.bin", ".bin"],
      ["page.html", ".html"],
      ["archive.zip", ".zip"],
      ["archive.tar", ".tar"],
    ])("rejects %s (%s)", async (filename) => {
      expect(await checkFile(filename)).toBe(false);
    });
  });

  describe("case insensitive", () => {
    it("allows .PDF (uppercase)", async () => {
      expect(await checkFile("report.PDF")).toBe(true);
    });

    it("allows .XLSX (uppercase)", async () => {
      expect(await checkFile("data.XLSX")).toBe(true);
    });

    it("allows .Csv (mixed case)", async () => {
      expect(await checkFile("export.Csv")).toBe(true);
    });

    it("allows .DOCX (uppercase)", async () => {
      expect(await checkFile("document.DOCX")).toBe(true);
    });

    it("allows .PpTx (mixed case)", async () => {
      expect(await checkFile("slides.PpTx")).toBe(true);
    });
  });

  describe("double extensions", () => {
    it("rejects .pdf.exe (dangerous final extension)", async () => {
      expect(await checkFile("report.pdf.exe")).toBe(false);
    });

    it("rejects .xlsx.sh (dangerous final extension)", async () => {
      expect(await checkFile("data.xlsx.sh")).toBe(false);
    });

    it("rejects .csv.php (dangerous final extension)", async () => {
      expect(await checkFile("export.csv.php")).toBe(false);
    });
  });

  describe("no extension", () => {
    it("rejects file with no extension", async () => {
      expect(await checkFile("noextension")).toBe(false);
    });

    it("rejects file that is just a dot", async () => {
      // "." split gives ["", ""], pop gives "", ext becomes "."
      expect(await checkFile(".")).toBe(false);
    });
  });

  describe("files with dots in name", () => {
    it("allows report.2024.xlsx (valid final extension)", async () => {
      expect(await checkFile("report.2024.xlsx")).toBe(true);
    });

    it("allows Q1.financial.summary.pdf", async () => {
      expect(await checkFile("Q1.financial.summary.pdf")).toBe(true);
    });

    it("allows version.1.2.3.csv", async () => {
      expect(await checkFile("version.1.2.3.csv")).toBe(true);
    });

    it("rejects report.2024.txt (invalid final extension)", async () => {
      expect(await checkFile("report.2024.txt")).toBe(false);
    });
  });
});
