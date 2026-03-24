/**
 * KFCA KPI Seed Script — 42 KPIs
 * Source: KFCA-KPI-Seed-Data PPTX (August 2025 Strategy Refresh)
 * Run: pnpm exec tsx ./src/seed-kpis.ts
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

interface KpiDef {
  num: number;
  type: "strategic" | "operational";
  name: string;
  kpiType: "rate" | "cumulative" | "reduction" | "milestone";
  direction: "higher" | "lower";
  pillar: string;
  formula: string;
  category: string;
  measurementFrequency: "annual" | "quarterly" | "monthly";
  baseline: number | null;
  target2025: number | null;
  target2026: number | null;
  target2027: number | null;
  target2028: number | null;
  target2029: number | null;
  target2030: number | null;
  unit: string;
}

const KPIS: KpiDef[] = [
  // ── Customer Experience (1-5) ─────────────────────────────────────────────
  {
    num: 1, type: "strategic",
    name: "Frequent traveler share (pax %)",
    kpiType: "rate", direction: "higher",
    pillar: "Customer Experience",
    formula: "% vehicles crossing > 4 days/week",
    category: "Customer Loyalty",
    measurementFrequency: "annual",
    baseline: 6.2, target2025: 5, target2026: 6, target2027: 7, target2028: 8, target2029: 9, target2030: 10,
    unit: "%",
  },
  {
    num: 2, type: "strategic",
    name: "Cargo prepaid e-Toll adoption rate (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Customer Experience",
    formula: "(Cargo prepaid e-toll txns / Total cargo toll txns) × 100",
    category: "Digital Adoption",
    measurementFrequency: "quarterly",
    baseline: null, target2025: 10, target2026: 25, target2027: 40, target2028: 55, target2029: 70, target2030: 80,
    unit: "%",
  },
  {
    num: 3, type: "strategic",
    name: "Customer Satisfaction Index (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Customer Experience",
    formula: "Standard CSAT survey score (incl. NPS)",
    category: "Customer Satisfaction",
    measurementFrequency: "annual",
    baseline: 92.8, target2025: 90, target2026: 90, target2027: 90, target2028: 90, target2029: 90, target2030: 90,
    unit: "%",
  },
  {
    num: 4, type: "operational",
    name: "Number of customer journey touchpoints (#)",
    kpiType: "reduction", direction: "lower",
    pillar: "Customer Experience",
    formula: "Count of touchpoints (eliminated if removed for >70% of traffic)",
    category: "CX Efficiency",
    measurementFrequency: "annual",
    baseline: 7, target2025: 6, target2026: 4, target2027: 4, target2028: 4, target2029: 4, target2030: 4,
    unit: "#",
  },
  {
    num: 5, type: "operational",
    name: "Digital toll payment uptake for pax (% pax)",
    kpiType: "rate", direction: "higher",
    pillar: "Customer Experience",
    formula: "# pax using digital payment / Total pax × 100%",
    category: "Digital Adoption",
    measurementFrequency: "quarterly",
    baseline: null, target2025: null, target2026: 70, target2027: 75, target2028: 75, target2029: 75, target2030: 75,
    unit: "%",
  },

  // ── Assets & Infrastructure (6-10) ────────────────────────────────────────
  {
    num: 6, type: "strategic",
    name: "Road network with iRAP ≥ 3 stars (#)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Assets & Infrastructure",
    formula: "Count of road segments meeting iRAP 3-star+",
    category: "Road Safety",
    measurementFrequency: "annual",
    baseline: 4, target2025: 4, target2026: 4, target2027: 4, target2028: 4, target2029: 4, target2030: 4,
    unit: "#",
  },
  {
    num: 7, type: "strategic",
    name: "Road network covered by automated monitoring (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Assets & Infrastructure",
    formula: "% road km covered by CCTV/cameras",
    category: "Asset Monitoring",
    measurementFrequency: "annual",
    baseline: 14.8, target2025: 100, target2026: 100, target2027: 100, target2028: 100, target2029: 100, target2030: 100,
    unit: "%",
  },
  {
    num: 8, type: "strategic",
    name: "Serious injuries & fatalities per 1M vehicles (#)",
    kpiType: "reduction", direction: "lower",
    pillar: "Assets & Infrastructure",
    formula: "Count / (Total crossings / 1M)",
    category: "Road Safety",
    measurementFrequency: "annual",
    baseline: 1.6, target2025: 0.50, target2026: 0.30, target2027: 0.25, target2028: 0.20, target2029: 0.10, target2030: 0,
    unit: "#/1M",
  },
  {
    num: 9, type: "operational",
    name: "Maintenance optimization – PM share (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Assets & Infrastructure",
    formula: "PM% vs CM%. Target: PM 75% / CM 25%",
    category: "Asset Management",
    measurementFrequency: "quarterly",
    baseline: null, target2025: 55, target2026: 60, target2027: 65, target2028: 70, target2029: 70, target2030: 75,
    unit: "%",
  },
  {
    num: 10, type: "strategic",
    name: "Major CapEx projects executed on time (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Assets & Infrastructure",
    formula: "Major CAPEX strategic projects on time / Total",
    category: "Project Delivery",
    measurementFrequency: "annual",
    baseline: 90, target2025: 91, target2026: 92, target2027: 93, target2028: 94, target2029: 94, target2030: 95,
    unit: "%",
  },

  // ── Commercialization (11-14) ──────────────────────────────────────────────
  {
    num: 11, type: "strategic",
    name: "Total revenue (SAR)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Commercialization",
    formula: "Total annual revenue incl. toll fees",
    category: "Revenue",
    measurementFrequency: "annual",
    baseline: 553000000, target2025: 500000000, target2026: 540000000, target2027: 580000000, target2028: 620000000, target2029: 700000000, target2030: 780000000,
    unit: "SAR",
  },
  {
    num: 12, type: "strategic",
    name: "Non-toll revenue (SAR)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Commercialization",
    formula: "Revenue from non-toll sources",
    category: "Revenue Diversification",
    measurementFrequency: "annual",
    baseline: 35000000, target2025: 70000000, target2026: 90000000, target2027: 110000000, target2028: 130000000, target2029: 170000000, target2030: 200000000,
    unit: "SAR",
  },
  {
    num: 13, type: "operational",
    name: "Liquidity ratio (times)",
    kpiType: "rate", direction: "higher",
    pillar: "Commercialization",
    formula: "Current assets / Current liabilities",
    category: "Financial Health",
    measurementFrequency: "quarterly",
    baseline: 1.12, target2025: 1.5, target2026: 1.5, target2027: 1.5, target2028: 1.5, target2029: 1.5, target2030: 1.5,
    unit: "x",
  },
  {
    num: 14, type: "operational",
    name: "Annual investment rate of return (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Commercialization",
    formula: "(Investment income + gains) / Avg capital",
    category: "Financial Performance",
    measurementFrequency: "annual",
    baseline: 6.37, target2025: 4.5, target2026: 3.5, target2027: 3.5, target2028: 3.5, target2029: 3.5, target2030: 3.5,
    unit: "%",
  },

  // ── Governance & Steering (15-21) ─────────────────────────────────────────
  {
    num: 15, type: "strategic",
    name: "Projects executed on time (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Governance & Steering",
    formula: "Projects on time / Total completed",
    category: "Governance",
    measurementFrequency: "quarterly",
    baseline: 97.3, target2025: 95, target2026: 95, target2027: 95, target2028: 95, target2029: 95, target2030: 95,
    unit: "%",
  },
  {
    num: 16, type: "operational",
    name: "Annual internal audit plan completion (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Governance & Steering",
    formula: "Completed audits / Planned audits",
    category: "Compliance",
    measurementFrequency: "annual",
    baseline: 63, target2025: 80, target2026: 85, target2027: 90, target2028: 90, target2029: 90, target2030: 90,
    unit: "%",
  },
  {
    num: 17, type: "operational",
    name: "Internal audit maturity index (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Governance & Steering",
    formula: "Audit capability maturity assessment",
    category: "Audit Quality",
    measurementFrequency: "annual",
    baseline: null, target2025: 80, target2026: 85, target2027: 90, target2028: 90, target2029: 90, target2030: 90,
    unit: "%",
  },
  {
    num: 18, type: "operational",
    name: "Vacant positions (%)",
    kpiType: "rate", direction: "lower",
    pillar: "Governance & Steering",
    formula: "Vacant / Total approved positions",
    category: "HR",
    measurementFrequency: "quarterly",
    baseline: null, target2025: 5, target2026: 5, target2027: 5, target2028: 5, target2029: 5, target2030: 5,
    unit: "%",
  },
  {
    num: 19, type: "strategic",
    name: "Compliance with SLAs (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Governance & Steering",
    formula: "SLAs met / Total SLAs",
    category: "Service Delivery",
    measurementFrequency: "quarterly",
    baseline: 91, target2025: 77, target2026: 81, target2027: 84, target2028: 88, target2029: 91, target2030: 95,
    unit: "%",
  },
  {
    num: 20, type: "strategic",
    name: "Stakeholder satisfaction index (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Governance & Steering",
    formula: "Weighted avg stakeholder survey score",
    category: "Stakeholder Relations",
    measurementFrequency: "annual",
    baseline: 94.8, target2025: 84, target2026: 86, target2027: 89, target2028: 91, target2029: 93, target2030: 95,
    unit: "%",
  },
  {
    num: 21, type: "operational",
    name: "GRC maturity index (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Governance & Steering",
    formula: "GRC maturity assessment score",
    category: "Risk Management",
    measurementFrequency: "annual",
    baseline: null, target2025: 30, target2026: 35, target2027: 40, target2028: 45, target2029: 50, target2030: 60,
    unit: "%",
  },

  // ── Operational Excellence (22-27) ────────────────────────────────────────
  {
    num: 22, type: "operational",
    name: "CapEx budget execution rate (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Operational Excellence",
    formula: "Actual CapEx / Approved CapEx budget",
    category: "Budget",
    measurementFrequency: "quarterly",
    baseline: 79, target2025: 90, target2026: 90, target2027: 90, target2028: 90, target2029: 90, target2030: 90,
    unit: "%",
  },
  {
    num: 23, type: "operational",
    name: "EBITDA margin (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Operational Excellence",
    formula: "EBITDA / Total Revenue × 100%",
    category: "Financial Performance",
    measurementFrequency: "annual",
    baseline: 45, target2025: 35, target2026: 35, target2027: 35, target2028: 35, target2029: 35, target2030: 35,
    unit: "%",
  },
  {
    num: 24, type: "strategic",
    name: "Peak crossing time for pax (min.)",
    kpiType: "reduction", direction: "lower",
    pillar: "Operational Excellence",
    formula: "Avg toll-to-exit time during peak hours",
    category: "Border Performance",
    measurementFrequency: "monthly",
    baseline: 21, target2025: 25, target2026: 25, target2027: 25, target2028: 25, target2029: 25, target2030: 20,
    unit: "min",
  },
  {
    num: 25, type: "operational",
    name: "High peak crossing time for pax (min.)",
    kpiType: "reduction", direction: "lower",
    pillar: "Operational Excellence",
    formula: "Avg toll-to-exit time during highest traffic",
    category: "Border Performance",
    measurementFrequency: "monthly",
    baseline: null, target2025: 35, target2026: 40, target2027: 36, target2028: 34, target2029: 32, target2030: 30,
    unit: "min",
  },
  {
    num: 26, type: "strategic",
    name: "Average crossing time for cargo (hrs)",
    kpiType: "reduction", direction: "lower",
    pillar: "Operational Excellence",
    formula: "Avg cargo entry-to-exit incl. processing",
    category: "Border Performance",
    measurementFrequency: "monthly",
    baseline: 1.5, target2025: 3, target2026: 3, target2027: 3, target2028: 2.5, target2029: 2.5, target2030: 2,
    unit: "hrs",
  },
  {
    num: 27, type: "operational",
    name: "Cargo slot management on-time performance (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Operational Excellence",
    formula: "Trucks at booked slot / Total dispatched",
    category: "Logistics",
    measurementFrequency: "monthly",
    baseline: null, target2025: null, target2026: 80, target2027: 85, target2028: 90, target2029: 90, target2030: 95,
    unit: "%",
  },

  // ── Technology & Innovation (28-33) ───────────────────────────────────────
  {
    num: 28, type: "operational",
    name: "TMS use cases accuracy adherence (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Technology & Innovation",
    formula: "TMS predictions within ±10% vs actual crossings",
    category: "Systems Performance",
    measurementFrequency: "monthly",
    baseline: null, target2025: null, target2026: null, target2027: 100, target2028: 100, target2029: 100, target2030: 100,
    unit: "%",
  },
  {
    num: 29, type: "strategic",
    name: "Digitization across journey touchpoints (%)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Technology & Innovation",
    formula: "# digital touchpoints / Total touchpoints × 100",
    category: "Digital Transformation",
    measurementFrequency: "annual",
    baseline: 13, target2025: 23, target2026: 35, target2027: 48, target2028: 60, target2029: 72, target2030: 85,
    unit: "%",
  },
  {
    num: 30, type: "operational",
    name: "IT systems availability/uptime (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Technology & Innovation",
    formula: "Hours systems available / Total hours × 100",
    category: "IT Reliability",
    measurementFrequency: "monthly",
    baseline: 97, target2025: 99, target2026: 99, target2027: 99.5, target2028: 99.5, target2029: 99.5, target2030: 99.9,
    unit: "%",
  },
  {
    num: 31, type: "operational",
    name: "Cybersecurity incident response time (hrs)",
    kpiType: "reduction", direction: "lower",
    pillar: "Technology & Innovation",
    formula: "Avg time from detection to containment (critical incidents)",
    category: "Cybersecurity",
    measurementFrequency: "quarterly",
    baseline: 48, target2025: 24, target2026: 12, target2027: 8, target2028: 4, target2029: 4, target2030: 2,
    unit: "hrs",
  },
  {
    num: 32, type: "strategic",
    name: "Digital services adoption rate (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Technology & Innovation",
    formula: "Active users of digital services / Total eligible users × 100",
    category: "Digital Adoption",
    measurementFrequency: "quarterly",
    baseline: 22, target2025: 35, target2026: 50, target2027: 65, target2028: 75, target2029: 85, target2030: 90,
    unit: "%",
  },
  {
    num: 33, type: "operational",
    name: "IT project delivery on-time rate (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Technology & Innovation",
    formula: "IT projects delivered on time / Total IT projects × 100",
    category: "IT Delivery",
    measurementFrequency: "annual",
    baseline: 72, target2025: 80, target2026: 85, target2027: 88, target2028: 90, target2029: 92, target2030: 95,
    unit: "%",
  },

  // ── Capabilities Building (34-38) ─────────────────────────────────────────
  {
    num: 34, type: "strategic",
    name: "Employee organizational health index (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Capability Building",
    formula: "Standard OHI survey score",
    category: "Employee Wellbeing",
    measurementFrequency: "annual",
    baseline: null, target2025: 60, target2026: 65, target2027: 70, target2028: 75, target2029: 80, target2030: 85,
    unit: "%",
  },
  {
    num: 35, type: "strategic",
    name: "Talent retention rate (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Capability Building",
    formula: "(Total - Voluntary departures) / Total",
    category: "Talent Management",
    measurementFrequency: "annual",
    baseline: null, target2025: 90, target2026: 92, target2027: 93, target2028: 94, target2029: 95, target2030: 96,
    unit: "%",
  },
  {
    num: 36, type: "operational",
    name: "Successor readiness (%)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Capability Building",
    formula: "% critical roles with ready successor",
    category: "Succession Planning",
    measurementFrequency: "annual",
    baseline: null, target2025: 25, target2026: 40, target2027: 70, target2028: 90, target2029: 100, target2030: 100,
    unit: "%",
  },
  {
    num: 37, type: "strategic",
    name: "Workforce with fulfilled training plan (%)",
    kpiType: "rate", direction: "higher",
    pillar: "Capability Building",
    formula: "Employees with completed plan / Total",
    category: "Training",
    measurementFrequency: "annual",
    baseline: 84, target2025: 50, target2026: 55, target2027: 60, target2028: 65, target2029: 70, target2030: 75,
    unit: "%",
  },
  {
    num: 38, type: "operational",
    name: "Employee attrition rate (%)",
    kpiType: "rate", direction: "lower",
    pillar: "Capability Building",
    formula: "Voluntary departures / Total employees",
    category: "Talent Retention",
    measurementFrequency: "annual",
    baseline: null, target2025: null, target2026: 4, target2027: 4, target2028: 4, target2029: 4, target2030: 4,
    unit: "%",
  },

  // ── Branding & Social Contribution (39-41) ────────────────────────────────
  {
    num: 39, type: "operational",
    name: "Marketing events to strengthen brand (#)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Branding & Social",
    formula: "Count of events/campaigns per year",
    category: "Brand",
    measurementFrequency: "annual",
    baseline: 14, target2025: 6, target2026: 6, target2027: 8, target2028: 8, target2029: 10, target2030: 12,
    unit: "#",
  },
  {
    num: 40, type: "strategic",
    name: "Environmental footprint reduction (%)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Branding & Social",
    formula: "% carbon footprint reduction vs baseline",
    category: "ESG",
    measurementFrequency: "annual",
    baseline: null, target2025: 7, target2026: 8, target2027: 10, target2028: 12, target2029: 13, target2030: 15,
    unit: "%",
  },
  {
    num: 41, type: "strategic",
    name: "Compliance to Universal Accessibility Guidelines (%)",
    kpiType: "cumulative", direction: "higher",
    pillar: "Branding & Social",
    formula: "% facilities meeting UAG standards",
    category: "Social",
    measurementFrequency: "annual",
    baseline: 54.6, target2025: 57, target2026: 63, target2027: 70, target2028: 77, target2029: 83, target2030: 90,
    unit: "%",
  },

  // ── PS Participation & Funding (42) ───────────────────────────────────────
  {
    num: 42, type: "strategic",
    name: "Private sector concession fees (SAR)",
    kpiType: "cumulative", direction: "higher",
    pillar: "PS Participation",
    formula: "Guaranteed revenue from all concessions (incl. MAG)",
    category: "Private Sector",
    measurementFrequency: "annual",
    baseline: null, target2025: null, target2026: 10800000, target2027: 16500000, target2028: 26000000, target2029: 42500000, target2030: 60000000,
    unit: "SAR",
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed-kpis] Starting KPI seed — 42 KPIs...");

  // Get pillar IDs
  const pillars = await db.execute(sql`SELECT id, name FROM spmo_pillars`);
  const pillarIdByName = new Map<string, number>();
  for (const row of pillars.rows as { id: number; name: string }[]) {
    pillarIdByName.set(row.name, row.id);
    // Partial key matching
    row.name.split(" ").filter(w => w.length > 4).forEach(w =>
      pillarIdByName.set(w.toLowerCase(), row.id)
    );
  }

  // Wipe existing KPIs and measurements
  await db.execute(sql`TRUNCATE TABLE spmo_kpi_measurements CASCADE`);
  await db.execute(sql`TRUNCATE TABLE spmo_kpis CASCADE`);
  console.log("[seed-kpis] Wiped existing KPIs.");

  // Insert KPIs
  let inserted = 0;
  for (const kpi of KPIS) {
    const pillarId = resolvePillar(kpi.pillar, pillarIdByName);
    if (!pillarId) {
      console.warn(`  No pillar found for: "${kpi.pillar}" (KPI #${kpi.num})`);
    }

    const baseline = kpi.baseline ?? kpi.target2026 ?? 0;
    const actual   = kpi.baseline ?? 0;
    const target   = kpi.target2026 ?? kpi.target2025 ?? 0;
    const unit     = kpi.unit;

    await db.execute(sql`
      INSERT INTO spmo_kpis (
        type, name, description, unit, kpi_type, direction,
        measurement_period, formula, category,
        baseline, actual, target,
        target_2026, target_2027, target_2028, target_2029,
        actual_2026, actual_2027, actual_2028, actual_2029,
        next_year_target, target_2030,
        pillar_id, owner_id, owner_name,
        period_start, period_end,
        status, created_at, updated_at
      ) VALUES (
        ${kpi.type},
        ${kpi.name},
        ${kpi.formula},
        ${unit},
        ${kpi.kpiType},
        ${kpi.direction},
        ${kpi.measurementFrequency},
        ${kpi.formula},
        ${kpi.category},
        ${baseline},
        ${actual},
        ${target},
        ${kpi.target2026},
        ${kpi.target2027},
        ${kpi.target2028},
        ${kpi.target2029},
        null, null, null, null,
        ${kpi.target2027},
        ${kpi.target2030},
        ${pillarId ?? null},
        'system',
        'Programme Office',
        '2026-01-01',
        '2026-12-31',
        'on_track',
        NOW(), NOW()
      )
    `);
    inserted++;
    process.stdout.write(`  [${inserted}/42] ${kpi.name.slice(0, 55)}\n`);
  }

  const result = await db.execute(sql`SELECT COUNT(*) as cnt, type FROM spmo_kpis GROUP BY type`);
  console.log(`\n✅ KPI seed complete — ${inserted} KPIs inserted:`);
  for (const row of result.rows as { cnt: string; type: string }[]) {
    console.log(`  ${row.type}: ${row.cnt}`);
  }

  process.exit(0);
}

function resolvePillar(name: string, map: Map<string, number>): number | null {
  // Exact match
  if (map.has(name)) return map.get(name)!;
  // Word match
  const lc = name.toLowerCase();
  for (const [key, val] of map) {
    if (lc.includes(key.toLowerCase()) || key.toLowerCase().includes(lc.split(" ")[0].toLowerCase())) {
      return val;
    }
  }
  return null;
}

main().catch(err => {
  console.error("[seed-kpis] Fatal:", err);
  process.exit(1);
});
