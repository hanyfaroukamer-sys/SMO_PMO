/**
 * KFCA One-Time Seed Script
 * Run: pnpm exec tsx ./src/seed-kfca.ts
 */

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readFile } from "fs/promises";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Dept { name: string; code: string; color: string; }
interface Pillar { name: string; color: string; description: string; sortOrder: number; weight: number; }
interface Initiative { code: string; name: string; pillarName: string; owner: string; }
interface Project {
  projectCode: string; name: string; initiativeCode: string;
  departmentName: string; owner: string; phase: string;
  progress: number; weight: number; status: string;
}

interface Structure { departments: Dept[]; pillars: Pillar[]; initiatives: Initiative[]; }
interface Projects { projects: Project[]; }

// ─── CLAUDE CALLS ─────────────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text.replace(/```json|```/g, "").trim();
}

async function extractStructure(rawText: string): Promise<Structure> {
  console.log("[seed-kfca] Extracting structure (pillars, departments, initiatives)...");
  const text = await callClaude(`Extract departments, pillars and initiatives from this KFCA PMO data document.
Return ONLY valid JSON (no markdown, no extra text):
{
  "departments": [
    {"name":"Technology and Digitalization","code":"TECH","color":"#2563EB"},
    {"name":"Projects","code":"PROJ","color":"#7C3AED"},
    {"name":"Strategy and Enablement","code":"STRAT","color":"#0D9488"},
    {"name":"CX and Commercial","code":"CX","color":"#E8590C"},
    {"name":"GRC and Cybersecurity","code":"GRC","color":"#B91C1C"},
    {"name":"Shared Services","code":"SHARED","color":"#CA8A04"},
    {"name":"Operations and Maintenance","code":"OPS","color":"#15803D"},
    {"name":"Finance","code":"FIN","color":"#BE185D"},
    {"name":"Legal","code":"LEGAL","color":"#6366F1"},
    {"name":"HR","code":"HR","color":"#0891B2"}
  ],
  "pillars": [
    {"name":"...","color":"#2563EB","description":"...","sortOrder":1,"weight":11}
  ],
  "initiatives": [
    {"code":"I-01","name":"...","pillarName":"...","owner":""}
  ]
}
Use these pillar colors in order: #2563EB #7C3AED #E8590C #0D9488 #B91C1C #CA8A04 #15803D #BE185D #6366F1
There are 9 pillars and 26 initiatives. Infer initiative codes from context.

DOCUMENT:
${rawText}`);
  return JSON.parse(text) as Structure;
}

async function extractProjects(rawText: string, initiatives: Initiative[]): Promise<Projects> {
  console.log("[seed-kfca] Extracting projects...");
  const initList = initiatives.map(i => `${i.code}: ${i.name} (pillar: ${i.pillarName})`).join("\n");
  const text = await callClaude(`Extract ALL projects from this KFCA PMO data. Return ONLY valid JSON.

Initiative codes available:
${initList}

For each project set initiativeCode to the most logical initiative.
Map department names to full names: "Operations and Mai" → "Operations and Maintenance", "Technology and Dig" → "Technology and Digitalization", "Strategy and Enabl" → "Strategy and Enablement", "CX and Commercial" → "CX and Commercial", "GRC and cybersec" → "GRC and Cybersecurity".
Map phase: "Completed" stays "Completed", else use as-is.
Map status: "Completed on time" or "Completed with delays" → "on-track", "Delayed" or "Past due" → "at-risk", "Not started" → "on-track", "On Hold" → "on-hold".
progress: strip % and convert to integer.
weight: use Init Wt value as integer (strip %).

{
  "projects": [
    {
      "projectCode":"P1","name":"Meet iRAP requirements",
      "initiativeCode":"I-01","departmentName":"Operations and Maintenance",
      "owner":"O. Aldahash","phase":"Completed","progress":100,
      "weight":25,"status":"on-track"
    }
  ]
}

DOCUMENT:
${rawText}`);
  return JSON.parse(text) as Projects;
}

// ─── MILESTONE GENERATION ──────────────────────────────────────────────────────

function generateMilestones(proj: Project): Array<{
  name: string; phase: string; progress: number;
  weight: number; effortDays: number; dueDate: string | null;
}> {
  const p = proj.progress;
  const phase = proj.phase;

  // 4 standard phase-gate milestones
  const phases = ["Planning", "Tendering", "Execution", "Closure"];

  // Weights based on project config defaults: 5/5/85/5
  const weights = [5, 5, 85, 5];

  return phases.map((msPhase, i) => {
    let msProgress = 0;
    if (phase === "Completed") {
      msProgress = 100;
    } else if (phase === "Execution" || phase === "Closure") {
      if (msPhase === "Planning" || msPhase === "Tendering") msProgress = 100;
      else if (msPhase === "Execution") msProgress = Math.min(p, 100);
      else msProgress = 0;
    } else if (phase === "Tendering") {
      if (msPhase === "Planning") msProgress = 100;
      else if (msPhase === "Tendering") msProgress = Math.min(p, 100);
      else msProgress = 0;
    } else {
      msProgress = msPhase === "Planning" ? Math.min(p, 100) : 0;
    }

    return {
      name: `${msPhase} phase`,
      phase: msPhase,
      progress: msProgress,
      weight: weights[i],
      effortDays: [15, 30, 90, 15][i],
      dueDate: null,
    };
  });
}

// ─── DATABASE SEEDING ─────────────────────────────────────────────────────────

async function seedDatabase(structure: Structure, projectData: Projects) {
  console.log("[seed-kfca] Wiping existing data...");

  await db.execute(sql`SET session_replication_role = replica`);
  const tables = [
    "spmo_raci_entries","spmo_actions","spmo_change_requests",
    "spmo_weekly_reports","spmo_procurement","spmo_budgets",
    "spmo_risk_mitigations","spmo_risks","spmo_kpi_measurements",
    "spmo_kpis","spmo_milestones","spmo_projects","spmo_initiatives",
    "spmo_pillars","spmo_departments","spmo_activity_log",
  ];
  for (const t of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${t} CASCADE`));
  }
  await db.execute(sql`SET session_replication_role = DEFAULT`);

  // Update programme config
  await db.execute(sql`
    INSERT INTO spmo_programme_config (
      id, programme_name, vision, mission, reporting_currency,
      fiscal_year_start, project_at_risk_threshold, project_delayed_threshold,
      milestone_at_risk_threshold, weekly_reset_day,
      default_planning_weight, default_tendering_weight,
      default_execution_weight, default_closure_weight, created_at, updated_at
    ) VALUES (
      1, 'KFCA Corporate Strategy Programme',
      'To be a world-class authority managing King Fahd Causeway, delivering exceptional infrastructure and cross-border services.',
      'Drive transformation across all strategic pillars to enhance connectivity, safety, and customer experience on the King Fahd Causeway.',
      'SAR', 1, 5, 10, 5, 3, 5, 5, 85, 5, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE SET
      programme_name = EXCLUDED.programme_name,
      vision = EXCLUDED.vision,
      mission = EXCLUDED.mission,
      updated_at = NOW()
  `);

  // Departments
  console.log("[seed-kfca] Inserting departments...");
  const deptMap = new Map<string, number>();
  for (const dept of structure.departments) {
    const r = await db.execute(sql`
      INSERT INTO spmo_departments (name, code, color, created_at, updated_at)
      VALUES (${dept.name}, ${dept.code}, ${dept.color}, NOW(), NOW())
      RETURNING id
    `);
    const id = (r.rows[0] as { id: number }).id;
    deptMap.set(dept.name.toLowerCase(), id);
    // Add abbreviated keys
    dept.name.toLowerCase().split(" ").forEach(word => {
      if (word.length > 3) deptMap.set(word, id);
    });
  }

  // Pillars
  console.log("[seed-kfca] Inserting pillars...");
  const pillarMap = new Map<string, number>();
  for (const pillar of structure.pillars) {
    const r = await db.execute(sql`
      INSERT INTO spmo_pillars (name, color, description, sort_order, weight, created_at, updated_at)
      VALUES (${pillar.name}, ${pillar.color}, ${pillar.description}, ${pillar.sortOrder}, ${pillar.weight}, NOW(), NOW())
      RETURNING id
    `);
    const id = (r.rows[0] as { id: number }).id;
    pillarMap.set(pillar.name.toLowerCase(), id);
    pillar.name.toLowerCase().split(" ").forEach(word => {
      if (word.length > 4) pillarMap.set(word, id);
    });
  }

  // Initiatives
  console.log("[seed-kfca] Inserting initiatives...");
  const initiativeMap = new Map<string, number>();
  for (const ini of structure.initiatives) {
    const pillarId = resolvePillar(ini.pillarName, pillarMap);
    const r = await db.execute(sql`
      INSERT INTO spmo_initiatives (pillar_id, name, description, owner, budget_allocated, start_date, end_date, created_at, updated_at)
      VALUES (${pillarId}, ${ini.name}, '', ${ini.owner ?? ''}, null, null, null, NOW(), NOW())
      RETURNING id
    `);
    const id = (r.rows[0] as { id: number }).id;
    initiativeMap.set(ini.code, id);
  }

  // Fallback initiative
  const defaultInitId = [...initiativeMap.values()][0];

  // Projects + milestones
  console.log("[seed-kfca] Inserting projects and milestones...");
  const phaseToDb: Record<string, string> = {
    "Completed": "Closure", "Execution": "Execution",
    "Tendering": "Tendering", "Planning": "Planning",
    "Not Started": "Planning", "On Hold": "Planning",
  };

  for (const proj of projectData.projects) {
    const initiativeId = initiativeMap.get(proj.initiativeCode) ?? defaultInitId;
    const deptId = resolveDept(proj.departmentName, deptMap);
    const dbPhase = phaseToDb[proj.phase] ?? "Planning";
    const status = proj.status ?? "on-track";

    const r = await db.execute(sql`
      INSERT INTO spmo_projects (
        initiative_id, department_id, project_code, name, owner,
        phase, progress, weight, budget_allocated, budget_spent,
        start_date, end_date, status, created_at, updated_at
      ) VALUES (
        ${initiativeId}, ${deptId}, ${proj.projectCode}, ${proj.name}, ${proj.owner ?? ''},
        ${dbPhase}, ${proj.progress}, ${proj.weight}, null, null,
        null, null, ${status}, NOW(), NOW()
      ) RETURNING id
    `);
    const projectId = (r.rows[0] as { id: number }).id;

    const milestones = generateMilestones(proj);
    for (const ms of milestones) {
      await db.execute(sql`
        INSERT INTO spmo_milestones (
          project_id, name, phase, progress, weight, effort_days,
          due_date, assignee_name, created_at, updated_at
        ) VALUES (
          ${projectId}, ${ms.name}, ${ms.phase}, ${ms.progress},
          ${ms.weight}, ${ms.effortDays}, ${ms.dueDate}, ${proj.owner ?? null},
          NOW(), NOW()
        )
      `);
    }
  }

  const totalMs = projectData.projects.length * 4;
  console.log(`\n[seed-kfca] ✅ Seed complete:`);
  console.log(`  Departments: ${structure.departments.length}`);
  console.log(`  Pillars: ${structure.pillars.length}`);
  console.log(`  Initiatives: ${structure.initiatives.length}`);
  console.log(`  Projects: ${projectData.projects.length}`);
  console.log(`  Milestones: ~${totalMs}`);
}

function resolvePillar(name: string, map: Map<string, number>): number {
  const lower = name.toLowerCase();
  if (map.has(lower)) return map.get(lower)!;
  for (const [key, val] of map) {
    if (lower.includes(key) || key.includes(lower.split(" ")[0])) return val;
  }
  return [...map.values()][0];
}

function resolveDept(name: string, map: Map<string, number>): number | null {
  const lower = name.toLowerCase();
  if (map.has(lower)) return map.get(lower)!;
  for (const [key, val] of map) {
    if (lower.includes(key) || key.includes(lower.split(" ")[0])) return val;
  }
  return null;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed-kfca] Starting KFCA seed from PPTX...");

  const pptxPath = "/home/runner/workspace/attached_assets/KFCA-Complete-Seed-Data_1774320152744.pptx";
  const buf = await readFile(pptxPath);
  const op = await import("officeparser") as unknown as {
    parseOffice: (input: Buffer) => Promise<{ toText: () => string }>;
  };
  const ast = await op.parseOffice(buf);
  const rawText = ast.toText();
  console.log(`[seed-kfca] Extracted ${rawText.length} chars from PPTX`);

  const structure = await extractStructure(rawText);
  console.log(`  → ${structure.pillars.length} pillars, ${structure.initiatives.length} initiatives, ${structure.departments.length} departments`);

  const projectData = await extractProjects(rawText, structure.initiatives);
  console.log(`  → ${projectData.projects.length} projects`);

  await seedDatabase(structure, projectData);
  process.exit(0);
}

main().catch(err => {
  console.error("[seed-kfca] Fatal:", err);
  process.exit(1);
});
