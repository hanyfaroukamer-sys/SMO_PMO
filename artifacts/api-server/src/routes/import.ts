import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoKpisTable,
  spmoProgrammeConfigTable,
  spmoActivityLogTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

type AuthUser = { id: string; email?: string | null; firstName?: string | null; lastName?: string | null; role?: string | null } | undefined;

function getAuthUser(req: Request): AuthUser {
  return req.user as AuthUser;
}

function getUserDisplayName(user: AuthUser): string | null {
  if (!user) return null;
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : user.email ?? null;
}

function requireAuth(req: Request, res: Response): string | null {
  const user = getAuthUser(req);
  if (!user?.id) { res.status(401).json({ error: "Authentication required" }); return null; }
  return user.id;
}

// ─── TIMEOUT WRAPPER ─────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── TEXT EXTRACTION HELPERS ──────────────────────────────────────────────────

async function extractPdf(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse") as unknown as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getText: () => Promise<{ pages: Array<{ text: string }> }>;
    };
  };
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  return result.pages.map(p => p.text).join("\n");
}

async function extractXlsx(buf: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf);
  return wb.SheetNames.map((sn: string) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn]);
    return `[SHEET: ${sn}]\n${csv}`;
  }).join("\n\n");
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value;
}

async function extractPptx(buf: Buffer): Promise<string> {
  // officeparser v6: parseOffice returns an AST object; call .toText() to get the plain text
  const op = await import("officeparser") as unknown as {
    parseOffice: (input: Buffer) => Promise<{ toText: () => string }>;
  };
  const ast = await op.parseOffice(buf);
  return ast.toText();
}

// Extract text with a 25-second timeout per file to prevent hangs on large/corrupt files
async function extractFileText(buf: Buffer, name: string): Promise<string> {
  const fname = name.toLowerCase();
  let extractPromise: Promise<string>;

  if (fname.endsWith(".pdf")) {
    extractPromise = extractPdf(buf);
  } else if (fname.endsWith(".xlsx") || fname.endsWith(".xls") || fname.endsWith(".csv")) {
    extractPromise = extractXlsx(buf);
  } else if (fname.endsWith(".docx")) {
    extractPromise = extractDocx(buf);
  } else if (fname.endsWith(".pptx") || fname.endsWith(".ppt")) {
    extractPromise = extractPptx(buf);
  } else {
    return `[UNSUPPORTED FORMAT: ${name}]`;
  }

  try {
    return await withTimeout(extractPromise, 25_000, `extraction of ${name}`);
  } catch (err) {
    console.error(`[import] extract error for ${name}:`, err);
    return `[PARSE ERROR for ${name}: ${err instanceof Error ? err.message : "unknown"}]`;
  }
}

// ─── CLAUDE EXTRACTION PROMPT ────────────────────────────────────────────────

function buildExtractionPrompt(mode: string): string {
  const mergeAction = mode === "merge" ? "create or update" : "create";
  return `You are extracting strategic planning data from government organisation documents.

Government entities structure their strategy in many ways. Look for ANY of these patterns:

PATTERN 1 — STRATEGY HOUSE
Vision → Mission → Pillars (3-6 themes) → Initiatives under pillars → Projects under initiatives

PATTERN 2 — BALANCED SCORECARD
Perspectives (Financial, Customer, Internal, Learning) → Objectives → Measures → Initiatives

PATTERN 3 — PROGRAMME PLAN
Programme → Workstreams → Projects → Milestones/deliverables

PATTERN 4 — FLAT PROJECT LIST
Just a list/table of projects with owners, budgets, dates — no hierarchy

PATTERN 5 — KPI FRAMEWORK
KPIs with targets, baselines, actuals — possibly linked to objectives or projects

PATTERN 6 — MIX OF ABOVE
Some combination of the above across multiple files

Your job: extract whatever structure exists and MAP it to this standard model:
- pillars = top-level strategic themes (or BSC perspectives, or programme workstreams)
- enablers = cross-cutting capabilities if mentioned (Talent, Technology, Data, Governance, etc.)
- initiatives = major bodies of work under each pillar
- projects = deliverable workstreams under each initiative
- strategicKpis = outcome-level KPIs linked to pillars
- operationalKpis = delivery-level KPIs linked to projects

If the documents only have projects with no hierarchy, create a single default pillar called "Programme" and a single initiative called "Core Programme", and put all projects under it.

If the documents have pillars but no explicit initiatives, treat each major objective or programme area as an initiative.

Return ONLY valid JSON. No text before or after. No markdown fences.

{
  "vision": "",
  "mission": "",
  "pillars": [
    {
      "name": "",
      "color": "",
      "description": "",
      "matchAction": "${mergeAction}",
      "matchId": null
    }
  ],
  "enablers": [""],
  "initiatives": [
    {
      "name": "",
      "pillar": "",
      "owner": "",
      "description": "",
      "budgetAllocated": null,
      "startDate": null,
      "endDate": null,
      "matchAction": "${mergeAction}",
      "matchId": null
    }
  ],
  "projects": [
    {
      "name": "",
      "initiative": "",
      "owner": "",
      "budgetAllocated": null,
      "budgetSpent": null,
      "startDate": null,
      "endDate": null,
      "milestones": [
        {
          "name": "",
          "progress": 0,
          "effort": 0,
          "dueDate": null
        }
      ],
      "matchAction": "${mergeAction}",
      "matchId": null
    }
  ],
  "strategicKpis": [
    {
      "name": "",
      "pillar": "",
      "target": null,
      "actual": null,
      "baseline": null,
      "unit": "",
      "owner": "",
      "matchAction": "${mergeAction}",
      "matchId": null
    }
  ],
  "operationalKpis": [
    {
      "name": "",
      "project": "",
      "target": null,
      "actual": null,
      "unit": "",
      "status": "",
      "matchAction": "${mergeAction}",
      "matchId": null
    }
  ],
  "confidence": {
    "overall": 0,
    "structureFound": "",
    "notes": ""
  }
}

RULES:
1. Extract ONLY what is in the documents. Never invent data.
2. If a field is not found, use null (numbers) or "" (strings). Never guess.
3. Dates: convert "Q3 2025" to startDate "2025-07-01" endDate "2025-09-30". Convert "H1 2026" to startDate "2026-01-01" endDate "2026-06-30". ISO format YYYY-MM-DD only.
4. Budgets: normalise to millions. "380M SAR" becomes 380. "1.2B" becomes 1200. "45,000,000" becomes 45.
5. Pillar colours: assign from this palette, no duplicates: #2563EB #7C3AED #E8590C #0D9488 #B91C1C #CA8A04 #15803D #BE185D
6. If milestones or deliverables are listed under a project, extract them with estimated progress 0 unless stated otherwise.
7. The "confidence.structureFound" field should say which pattern you detected (e.g., "Strategy House with 4 pillars").
8. If documents contain Arabic text, extract it as-is.
9. Owner names: extract exactly as written.
10. The confidence.overall should be 0-100 reflecting how much useful data was extracted.`;
}

// ─── FETCH EXISTING DATA FOR MERGE MODE ──────────────────────────────────────

async function fetchExistingData() {
  const pillars = await db.select().from(spmoPillarsTable);
  const initiatives = await db.select().from(spmoInitiativesTable);
  const projects = await db.select().from(spmoProjectsTable);
  const kpis = await db.select().from(spmoKpisTable);
  return { pillars, initiatives, projects, kpis };
}

// ─── ANALYSE ENDPOINT ────────────────────────────────────────────────────────
// POST /api/spmo/import/analyse
// Uses SSE streaming to keep the connection alive while Claude processes

router.post(
  "/spmo/import/analyse",
  upload.array("files", 10) as unknown as (req: Request, res: Response, next: () => void) => void,
  async (req: Request, res: Response): Promise<void> => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const files = req.files as Express.Multer.File[] | undefined;
    const mode = (req.body?.mode as string) || "new";
    const guidance = (req.body?.guidance as string) || "";

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    // ── Step 1: Extract text from all files (with per-file timeout) ──────────
    const extracted: string[] = [];
    for (const file of files) {
      console.log(`[import] extracting ${file.originalname} (${Math.round(file.size / 1024)}KB)`);
      const text = await extractFileText(file.buffer, file.originalname);
      const preview = text.substring(0, 80).replace(/\n/g, " ");
      console.log(`[import] extracted ${text.length} chars from ${file.originalname}: "${preview}..."`);
      extracted.push(`[FILE: ${file.originalname}]\n${text}`);
    }

    let documentContent = extracted.join("\n\n===\n\n");

    // ── Step 2: Build context (merge mode fetches existing data) ──────────────
    let existingContext = "";
    if (mode === "merge") {
      const existing = await fetchExistingData();
      existingContext = `\n\nEXISTING DATA IN THE TOOL (for reference — do not duplicate these):\n${JSON.stringify(existing, null, 2)}\n\nWhen items in the documents match existing items, set "matchAction": "update" and "matchId" to the existing item's id.\nFor NEW items not in existing data, set "matchAction": "create".\n`;
    }

    // ── Step 3: Truncate to 25K chars to keep Claude fast and within limits ───
    const MAX_CHARS = 25_000;
    if (documentContent.length > MAX_CHARS) {
      documentContent = documentContent.substring(0, MAX_CHARS) + "\n\n[DOCUMENT TRUNCATED — ABOVE IS A REPRESENTATIVE SAMPLE]";
    }

    const guidanceSection = guidance
      ? `\n\n---\n\nUSER GUIDANCE (follow these instructions carefully — the user knows the document structure):\n${guidance}\n`
      : "";

    const promptText = buildExtractionPrompt(mode) + existingContext + guidanceSection + "\n\n---\n\nDOCUMENT CONTENT:\n" + documentContent;

    console.log(`[import] sending to Claude: prompt ${promptText.length} chars, doc ${documentContent.length} chars`);

    // ── Step 4: Stream the Claude response to keep the connection alive ────────
    // Streaming prevents the Replit AI proxy from timing out on large documents.
    let fullText = "";
    try {
      const stream = anthropic.messages.stream({
        model: "claude-haiku-4-5",
        max_tokens: 8192,
        messages: [{ role: "user", content: promptText }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullText += event.delta.text;
        }
      }
    } catch (err) {
      console.error("[import] Claude streaming error:", err);
      const msg = err instanceof Error ? err.message : "unknown";
      res.status(500).json({ error: `AI extraction failed: ${msg}. Please try a smaller file or add guidance about the document structure.` });
      return;
    }

    console.log(`[import] Claude returned ${fullText.length} chars`);

    // ── Step 5: Parse the JSON (with one retry) ────────────────────────────────
    let parsed: unknown;
    try {
      parsed = JSON.parse(fullText.replace(/```json|```/g, "").trim());
    } catch {
      console.log("[import] JSON parse failed, retrying...");
      try {
        let retryText = "";
        const retryStream = anthropic.messages.stream({
          model: "claude-haiku-4-5",
          max_tokens: 8192,
          messages: [
            { role: "user", content: promptText },
            { role: "assistant", content: fullText },
            { role: "user", content: "That was not valid JSON. Return ONLY the JSON object. No text before or after. No markdown fences." },
          ],
        });
        for await (const event of retryStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            retryText += event.delta.text;
          }
        }
        parsed = JSON.parse(retryText.replace(/```json|```/g, "").trim());
      } catch {
        res.status(500).json({ error: "AI returned invalid JSON. Try adding guidance to specify the document structure (e.g. 'Strategy house with 5 pillars, extract projects from the appendix table')." });
        return;
      }
    }

    res.json(parsed);
  }
);

// ─── SAVE ENDPOINT ─────────────────────────────────────────────────────────────
// POST /api/spmo/import/save

interface ImportKpiItem {
  name: string;
  pillar?: string;
  project?: string;
  target?: number | null;
  actual?: number | null;
  baseline?: number | null;
  unit?: string;
  matchAction: string;
  matchId?: number | null;
}

interface ImportData {
  vision?: string;
  mission?: string;
  pillars?: Array<{ name: string; color?: string; description?: string; matchAction: string; matchId?: number | null }>;
  initiatives?: Array<{ name: string; pillar: string; owner?: string; description?: string; budgetAllocated?: number | null; startDate?: string | null; endDate?: string | null; matchAction: string; matchId?: number | null }>;
  projects?: Array<{ name: string; projectCode?: string; initiative: string; owner?: string; budgetAllocated?: number | null; budgetSpent?: number | null; startDate?: string | null; endDate?: string | null; milestones?: Array<{ name: string; progress?: number; effort?: number; dueDate?: string | null }>; matchAction: string; matchId?: number | null }>;
  strategicKpis?: ImportKpiItem[];
  operationalKpis?: ImportKpiItem[];
}

router.post("/spmo/import/save", async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { mode, data } = req.body as { mode: "new" | "merge" | "replace"; data: ImportData };
  if (!data) { res.status(400).json({ error: "Missing data" }); return; }

  const today = new Date().toISOString().split("T")[0];
  const colorPalette = ["#2563EB", "#7C3AED", "#E8590C", "#0D9488", "#B91C1C", "#CA8A04", "#15803D", "#BE185D"];

  try {
    if (mode === "replace") {
      await db.delete(spmoPillarsTable);
      await db.delete(spmoKpisTable);
    }

    let colorIdx = 0;
    const pillarMap: Record<string, number> = {};
    for (const p of data.pillars ?? []) {
      if (!p.name?.trim()) continue;
      const color = p.color || colorPalette[colorIdx++ % colorPalette.length];
      if (p.matchAction === "update" && p.matchId) {
        await db.update(spmoPillarsTable).set({ name: p.name, color, description: p.description || null, updatedAt: new Date() }).where(eq(spmoPillarsTable.id, p.matchId));
        pillarMap[p.name] = p.matchId;
      } else {
        const [created] = await db.insert(spmoPillarsTable).values({ name: p.name, color, description: p.description || null }).returning({ id: spmoPillarsTable.id });
        pillarMap[p.name] = created.id;
      }
    }

    const iniMap: Record<string, number> = {};
    for (const ini of data.initiatives ?? []) {
      if (!ini.name?.trim()) continue;
      const pillarId = pillarMap[ini.pillar];
      if (!pillarId) continue;
      const startDate = ini.startDate || today;
      const targetDate = ini.endDate || today;
      if (ini.matchAction === "update" && ini.matchId) {
        await db.update(spmoInitiativesTable).set({ name: ini.name, description: ini.description || null, ownerName: ini.owner || null, budget: ini.budgetAllocated ?? 0, startDate, targetDate, updatedAt: new Date() }).where(eq(spmoInitiativesTable.id, ini.matchId));
        iniMap[ini.name] = ini.matchId;
      } else {
        const [created] = await db.insert(spmoInitiativesTable).values({ pillarId, name: ini.name, description: ini.description || null, ownerId: userId, ownerName: ini.owner || null, budget: ini.budgetAllocated ?? 0, startDate, targetDate }).returning({ id: spmoInitiativesTable.id });
        iniMap[ini.name] = created.id;
      }
    }

    const existingProjects = await db.select({ id: spmoProjectsTable.id }).from(spmoProjectsTable);
    let nextCodeNum = existingProjects.length + 1;

    const projMap: Record<string, number> = {};
    for (const proj of data.projects ?? []) {
      if (!proj.name?.trim()) continue;
      const initiativeId = iniMap[proj.initiative];
      if (!initiativeId) continue;
      const startDate = proj.startDate || today;
      const targetDate = proj.endDate || today;
      let projId: number;
      if (proj.matchAction === "update" && proj.matchId) {
        const updateFields: Record<string, unknown> = { name: proj.name, ownerName: proj.owner || null, budget: proj.budgetAllocated ?? 0, budgetSpent: proj.budgetSpent ?? 0, startDate, targetDate, updatedAt: new Date() };
        if (proj.projectCode) updateFields.projectCode = proj.projectCode;
        await db.update(spmoProjectsTable).set(updateFields).where(eq(spmoProjectsTable.id, proj.matchId));
        projId = proj.matchId;
      } else {
        const projectCode = proj.projectCode?.trim() || `P${String(nextCodeNum).padStart(2, "0")}`;
        nextCodeNum++;
        const [created] = await db.insert(spmoProjectsTable).values({ initiativeId, name: proj.name, projectCode, ownerId: userId, ownerName: proj.owner || null, budget: proj.budgetAllocated ?? 0, budgetSpent: proj.budgetSpent ?? 0, startDate, targetDate }).returning({ id: spmoProjectsTable.id });
        projId = created.id;
      }
      projMap[proj.name] = projId;

      for (const ms of proj.milestones ?? []) {
        if (!ms.name?.trim()) continue;
        await db.insert(spmoMilestonesTable).values({ projectId: projId, name: ms.name, progress: ms.progress ?? 0, effortDays: ms.effort ?? null, dueDate: ms.dueDate || null });
      }
    }

    for (const kpi of data.strategicKpis ?? []) {
      if (!kpi.name?.trim()) continue;
      const pillarId = kpi.pillar ? pillarMap[kpi.pillar] ?? null : null;
      if (kpi.matchAction === "update" && kpi.matchId) {
        await db.update(spmoKpisTable).set({ name: kpi.name, target: kpi.target ?? 0, actual: kpi.actual ?? 0, baseline: kpi.baseline ?? 0, unit: kpi.unit || "", pillarId, updatedAt: new Date() }).where(eq(spmoKpisTable.id, kpi.matchId));
      } else {
        await db.insert(spmoKpisTable).values({ type: "strategic", name: kpi.name, target: kpi.target ?? 0, actual: kpi.actual ?? 0, baseline: kpi.baseline ?? 0, unit: kpi.unit || "", pillarId });
      }
    }

    for (const kpi of data.operationalKpis ?? []) {
      if (!kpi.name?.trim()) continue;
      const projectId = kpi.project ? projMap[kpi.project] ?? null : null;
      if (kpi.matchAction === "update" && kpi.matchId) {
        await db.update(spmoKpisTable).set({ name: kpi.name, target: kpi.target ?? 0, actual: kpi.actual ?? 0, unit: kpi.unit || "", projectId, updatedAt: new Date() }).where(eq(spmoKpisTable.id, kpi.matchId));
      } else {
        await db.insert(spmoKpisTable).values({ type: "operational", name: kpi.name, target: kpi.target ?? 0, actual: kpi.actual ?? 0, unit: kpi.unit || "", projectId });
      }
    }

    if (data.vision || data.mission) {
      const existing = await db.select().from(spmoProgrammeConfigTable).limit(1);
      if (existing.length > 0) {
        await db.update(spmoProgrammeConfigTable).set({ vision: data.vision || existing[0].vision, mission: data.mission || existing[0].mission });
      } else {
        await db.insert(spmoProgrammeConfigTable).values({ vision: data.vision || null, mission: data.mission || null });
      }
    }

    const user = getAuthUser(req);
    const displayName = getUserDisplayName(user);
    const pCount = (data.pillars ?? []).length;
    const iCount = (data.initiatives ?? []).length;
    const prCount = (data.projects ?? []).length;
    const summary = `Strategy imported (${mode}): ${pCount} pillars, ${iCount} initiatives, ${prCount} projects`;
    await db.insert(spmoActivityLogTable).values({ actorId: userId, actorName: displayName, action: "created", entityType: "programme", entityId: 0, entityName: summary });

    res.json({ success: true });
  } catch (err) {
    console.error("Import save error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Import failed" });
  }
});

export default router;
