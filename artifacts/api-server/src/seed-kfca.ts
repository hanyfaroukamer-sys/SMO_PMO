/**
 * KFCA Complete Seed Script — Pillars & Enablers (v2)
 * Source: KFCA-Complete-Seed-Data PPTX (March 2026)
 * 3 Pillars + 6 Enablers · 26 Initiatives · 100 Projects
 * Run: cd artifacts/api-server && pnpm exec tsx ./src/seed-kfca.ts
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeptDef { name: string; code: string; color: string; }
interface PillarDef {
  name: string; color: string; description: string;
  sortOrder: number; weight: number; pillarType: "pillar" | "enabler";
}
interface InitDef { code: string; name: string; pillarKey: string; description: string; }
interface ProjectDef {
  code: string; name: string; initCode: string; dept: string;
  owner: string; start: string; end: string;
  phase: string; progress: number; weight: number; status: string;
  budgetCapex: number; budgetOpex: number;
}

// ── Departments ────────────────────────────────────────────────────────────────

const DEPARTMENTS: DeptDef[] = [
  { name: "Technology and Digitalization", code: "TECH",   color: "#2563EB" },
  { name: "Projects",                       code: "PROJ",   color: "#7C3AED" },
  { name: "Strategy and Enablement",        code: "STRAT",  color: "#0D9488" },
  { name: "CX and Commercial",              code: "CX",     color: "#E8590C" },
  { name: "GRC and Cybersecurity",          code: "GRC",    color: "#B91C1C" },
  { name: "Shared Services",                code: "SHARED", color: "#CA8A04" },
  { name: "Operations and Maintenance",     code: "OPS",    color: "#15803D" },
  { name: "Finance",                        code: "FIN",    color: "#BE185D" },
  { name: "Legal",                          code: "LEGAL",  color: "#6366F1" },
  { name: "HR",                             code: "HR",     color: "#0891B2" },
];

// ── Pillars & Enablers ────────────────────────────────────────────────────────

const PILLARS: PillarDef[] = [
  // Strategic Pillars — define WHAT KFCA delivers
  { name: "Customer Experience",        pillarType: "pillar",  color: "#7C3AED", sortOrder: 1,  weight: 8,  description: "Customer journey optimization, fast lanes, trusted traveler, and satisfaction." },
  { name: "Assets & Infrastructure",   pillarType: "pillar",  color: "#2563EB", sortOrder: 2,  weight: 22, description: "Infrastructure development, road safety, asset management, and terminal enhancement." },
  { name: "Commercialization",          pillarType: "pillar",  color: "#E8590C", sortOrder: 3,  weight: 10, description: "Dynamic pricing, digital payments, data monetization, and commercial expansion." },
  // Cross-Cutting Enablers — define HOW KFCA delivers
  { name: "Governance & Steering",      pillarType: "enabler", color: "#0D9488", sortOrder: 4,  weight: 17, description: "Strategy governance, policy revision, compliance, risk management, and external relations." },
  { name: "Operational Excellence",     pillarType: "enabler", color: "#B91C1C", sortOrder: 5,  weight: 9,  description: "Operational efficiency, financial control, outsourcing, and border optimization." },
  { name: "Technology & Innovation",    pillarType: "enabler", color: "#CA8A04", sortOrder: 6,  weight: 19, description: "TMS, digital services, IT infrastructure, cybersecurity, and digital transformation." },
  { name: "Capabilities Building",      pillarType: "enabler", color: "#15803D", sortOrder: 7,  weight: 9,  description: "HR development, training, career paths, leadership, and organizational health." },
  { name: "Branding & Social",          pillarType: "enabler", color: "#BE185D", sortOrder: 8,  weight: 4,  description: "Brand marketing, ESG, accessibility, and women empowerment." },
  { name: "PS Participation",           pillarType: "enabler", color: "#6366F1", sortOrder: 9,  weight: 2,  description: "Private sector participation, corporatization readiness, and funding diversification." },
];

// ── Initiatives ────────────────────────────────────────────────────────────────

const INITIATIVES: InitDef[] = [
  // Customer Experience
  { code: "I-05", name: "Border Crossing Experience",     pillarKey: "Customer Experience",    description: "Fast lane, trusted traveler program, and crossing journey improvement." },
  { code: "I-06", name: "Customer Care & Satisfaction",   pillarKey: "Customer Experience",    description: "Customer care centralization, satisfaction surveys, sentiment analysis." },
  // Assets & Infrastructure
  { code: "I-01", name: "Road Safety & Compliance",       pillarKey: "Assets & Infrastructure",description: "iRAP standards, CCTV coverage, road assessment technologies." },
  { code: "I-02", name: "Asset & Facility Management",    pillarKey: "Assets & Infrastructure",description: "Road and facility asset management system." },
  { code: "I-03", name: "Traffic & Logistics Systems",    pillarKey: "Assets & Infrastructure",description: "Traffic monitoring, forecasting, and cargo journey optimization." },
  { code: "I-04", name: "Terminal & Island Development",  pillarKey: "Assets & Infrastructure",description: "Enhancement of terminals, access roads, and Central Island master plan." },
  // Commercialization
  { code: "I-08", name: "Revenue & Pricing Strategy",     pillarKey: "Commercialization",      description: "Dynamic pricing, tolling packages, and digital payments incentivization." },
  { code: "I-09", name: "Data & Digital Commerce",        pillarKey: "Commercialization",      description: "Data monetization, digital advertising, and e-commerce offerings." },
  { code: "I-10", name: "Commercial Development",         pillarKey: "Commercialization",      description: "Central island commercial development and investment optimization." },
  // Governance & Steering
  { code: "I-11", name: "Strategy Communication",         pillarKey: "Governance & Steering",  description: "Strategy communication plan and stakeholder engagement." },
  { code: "I-12", name: "Policy & Compliance",            pillarKey: "Governance & Steering",  description: "Internal policies revision, compliance, cybersecurity, and risk management." },
  { code: "I-13", name: "External Governance & Data",     pillarKey: "Governance & Steering",  description: "External governance model, bilateral agreements, data management office." },
  // Operational Excellence
  { code: "I-15", name: "Operational Efficiency",         pillarKey: "Operational Excellence", description: "Outsourcing revision, incentive schemes, and operational performance." },
  { code: "I-16", name: "Financial & Asset Control",      pillarKey: "Operational Excellence", description: "Financial controlling, fixed assets tagging, and supply chain." },
  { code: "I-17", name: "Border & Toll Operations",       pillarKey: "Operational Excellence", description: "Toll gate expansion, pre-clearance, and traveler pre-registration." },
  // Technology & Innovation
  { code: "I-18", name: "Traffic Management Systems",     pillarKey: "Technology & Innovation",description: "TMS implementation, real-time monitoring and dynamic messaging." },
  { code: "I-19", name: "Digital Innovation",             pillarKey: "Technology & Innovation",description: "Digital innovation hub, data analytics, and digital crossings." },
  { code: "I-20", name: "Digital Services & Mobile",      pillarKey: "Technology & Innovation",description: "One-stop shop mobile app, JESR app, and process digitization." },
  { code: "I-21", name: "IT Infrastructure & Resilience", pillarKey: "Technology & Innovation",description: "IT network upgrade, ERP, ITSM, and business continuity." },
  { code: "I-22", name: "Cybersecurity Excellence",       pillarKey: "Technology & Innovation",description: "Cybersecurity and data protection resilience program." },
  // Capabilities Building
  { code: "I-23", name: "Talent & Organizational Health", pillarKey: "Capabilities Building",  description: "Employee health, career paths, EVP, inclusion, and leadership." },
  { code: "I-24", name: "Learning & Partnership",         pillarKey: "Capabilities Building",  description: "Training plans, university partnerships, and global exchanges." },
  // Branding & Social
  { code: "I-25", name: "Brand & ESG Programme",          pillarKey: "Branding & Social",      description: "Brand marketing, ESG strategy, social media, and environmental footprint." },
  { code: "I-26", name: "Inclusion & Accessibility",      pillarKey: "Branding & Social",      description: "Universal accessibility guidelines and women empowerment programmes." },
  // PS Participation
  { code: "I-27", name: "Private Sector Engagement",      pillarKey: "PS Participation",       description: "Private sector involvement opportunities and concession studies." },
  { code: "I-28", name: "Corporatization & Funding",      pillarKey: "PS Participation",       description: "Corporatization readiness and alternative funding mechanisms." },
];

// ── Projects (100 total) ──────────────────────────────────────────────────────
// budgetCapex + budgetOpex = total project budget (SAR millions)

const PROJECTS: ProjectDef[] = [

  // ── Customer Experience — 8 projects ─────────────────────────────────────
  { code:"P19",  name:"Trusted traveler program",                          initCode:"I-05", dept:"OPS",   owner:"A. Al Shrhan", start:"2027-02-01", end:"2028-06-30", phase:"Not Started", progress:0,   weight:33, status:"on_hold",   budgetCapex:8,   budgetOpex:4   },
  { code:"P20",  name:"Fast lane construction & optimization",             initCode:"I-05", dept:"OPS",   owner:"O. Aldahash",  start:"2023-12-01", end:"2024-07-29", phase:"Completed",   progress:100, weight:33, status:"completed", budgetCapex:35,  budgetOpex:5   },
  { code:"P21",  name:"Customer journey optimization",                     initCode:"I-05", dept:"OPS",   owner:"T. Mofarrij",  start:"2024-01-04", end:"2026-11-30", phase:"Execution",   progress:64,  weight:20, status:"active",    budgetCapex:5,   budgetOpex:10  },
  { code:"P22",  name:"Customer journey mapping & experience design",      initCode:"I-06", dept:"OPS",   owner:"M. Fattah",    start:"2023-10-15", end:"2024-02-15", phase:"Completed",   progress:100, weight:20, status:"completed", budgetCapex:2,   budgetOpex:3   },
  { code:"P23A", name:"Customer care centralization (Phase 1)",            initCode:"I-06", dept:"CX",    owner:"B. AlTurki",   start:"2024-05-12", end:"2025-07-31", phase:"Completed",   progress:100, weight:20, status:"completed", budgetCapex:3,   budgetOpex:7   },
  { code:"P23B", name:"Customer care centralization (Phase 2)",            initCode:"I-06", dept:"CX",    owner:"B. AlTurki",   start:"2026-10-01", end:"2027-12-31", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:2,   budgetOpex:6   },
  { code:"P24",  name:"Customer satisfaction survey optimization",         initCode:"I-06", dept:"CX",    owner:"S. Marzooq",   start:"2024-04-01", end:"2026-01-05", phase:"Completed",   progress:100, weight:20, status:"completed", budgetCapex:1,   budgetOpex:4   },
  { code:"P92",  name:"Enhance CX & gauge customer sentiment",             initCode:"I-06", dept:"STRAT", owner:"TBD",          start:"2027-02-01", end:"2028-06-30", phase:"Not Started", progress:0,   weight:33, status:"active",    budgetCapex:2,   budgetOpex:5   },

  // ── Assets & Infrastructure — 22 projects ────────────────────────────────
  { code:"P1",   name:"Meet iRAP road safety requirements",                initCode:"I-01", dept:"OPS",   owner:"O. Aldahash",  start:"2023-11-22", end:"2024-08-18", phase:"Completed",   progress:100, weight:25, status:"completed", budgetCapex:18,  budgetOpex:4   },
  { code:"P2",   name:"Automated equipment coverage (CCTV)",               initCode:"I-01", dept:"TECH",  owner:"B. Alruwaili", start:"2023-10-10", end:"2025-09-13", phase:"Completed",   progress:100, weight:25, status:"completed", budgetCapex:22,  budgetOpex:5   },
  { code:"P3",   name:"Road incident detection and response system",       initCode:"I-01", dept:"OPS",   owner:"F. Yusuf",     start:"2025-06-01", end:"2026-09-30", phase:"Execution",   progress:35,  weight:25, status:"active",    budgetCapex:12,  budgetOpex:3   },
  { code:"P4",   name:"Border lighting and emergency infrastructure",      initCode:"I-01", dept:"PROJ",  owner:"TBD",          start:"2026-03-01", end:"2027-03-31", phase:"Planning",    progress:8,   weight:25, status:"active",    budgetCapex:25,  budgetOpex:5   },
  { code:"P5",   name:"Cargo journey optimization",                        initCode:"I-03", dept:"PROJ",  owner:"A. Bumteia",   start:"2023-12-15", end:"2026-05-15", phase:"Execution",   progress:82,  weight:25, status:"active",    budgetCapex:15,  budgetOpex:8   },
  { code:"P6",   name:"Road assessment technologies",                      initCode:"I-01", dept:"OPS",   owner:"F. Yusuf",     start:"2023-11-29", end:"2025-07-17", phase:"Completed",   progress:100, weight:25, status:"completed", budgetCapex:10,  budgetOpex:3   },
  { code:"P7",   name:"Road and Facility Asset Management System",         initCode:"I-02", dept:"TECH",  owner:"M. Albutery",  start:"2024-08-08", end:"2025-07-17", phase:"Completed",   progress:100, weight:60, status:"completed", budgetCapex:20,  budgetOpex:10  },
  { code:"P8",   name:"Maintenance yard and operations center upgrade",    initCode:"I-02", dept:"OPS",   owner:"TBD",          start:"2026-07-01", end:"2027-06-30", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:45,  budgetOpex:8   },
  { code:"P9",   name:"Traffic monitoring and forecasting system",         initCode:"I-03", dept:"STRAT", owner:"TBD",          start:"2026-07-01", end:"2028-12-31", phase:"Not Started", progress:0,   weight:40, status:"active",    budgetCapex:12,  budgetOpex:6   },
  { code:"P10A", name:"Enhancement of terminals & access roads",           initCode:"I-04", dept:"PROJ",  owner:"M. Salmeen",   start:"2023-12-10", end:"2024-08-28", phase:"Completed",   progress:100, weight:8,  status:"completed", budgetCapex:55,  budgetOpex:8   },
  { code:"P10B", name:"Enhancement of customer terminals & facilities",    initCode:"I-04", dept:"PROJ",  owner:"A. Nimshan",   start:"2025-01-01", end:"2026-12-27", phase:"Execution",   progress:49,  weight:8,  status:"active",    budgetCapex:70,  budgetOpex:12  },
  { code:"P11A", name:"Central Island master plan — Phase 1",              initCode:"I-04", dept:"PROJ",  owner:"A. Bumatia",   start:"2023-01-01", end:"2024-03-12", phase:"Completed",   progress:100, weight:8,  status:"completed", budgetCapex:120, budgetOpex:15  },
  { code:"P11B", name:"Central Island Phase 2 — Civil works",             initCode:"I-04", dept:"PROJ",  owner:"A. Alsaif",    start:"2025-02-01", end:"2026-03-31", phase:"Tendering",   progress:9,   weight:8,  status:"active",    budgetCapex:180, budgetOpex:20  },
  { code:"P11C", name:"Central Island Phase 2 — Power & utilities",       initCode:"I-04", dept:"PROJ",  owner:"M. Mahfouz",   start:"2026-01-01", end:"2026-12-31", phase:"Execution",   progress:23,  weight:8,  status:"active",    budgetCapex:60,  budgetOpex:10  },
  { code:"P11D", name:"Central Island Phase 2 — Government buildings",    initCode:"I-04", dept:"PROJ",  owner:"TBD",          start:"2028-01-01", end:"2030-06-30", phase:"Not Started", progress:0,   weight:8,  status:"active",    budgetCapex:90,  budgetOpex:12  },
  { code:"P11E", name:"Central Island Phase 2 — Cargo separation",        initCode:"I-04", dept:"PROJ",  owner:"TBD",          start:"2028-01-01", end:"2030-06-30", phase:"Not Started", progress:0,   weight:8,  status:"active",    budgetCapex:75,  budgetOpex:10  },
  { code:"P11F", name:"Central Island Phase 2 — Procedures buildings",    initCode:"I-04", dept:"PROJ",  owner:"TBD",          start:"2028-01-01", end:"2030-06-30", phase:"Not Started", progress:0,   weight:8,  status:"active",    budgetCapex:65,  budgetOpex:8   },
  { code:"P11H", name:"Central Island Phase 2 — Commercial zone",         initCode:"I-04", dept:"PROJ",  owner:"TBD",          start:"2028-01-01", end:"2030-12-31", phase:"Not Started", progress:0,   weight:8,  status:"active",    budgetCapex:100, budgetOpex:15  },
  { code:"P12",  name:"KSA remote island master plan",                     initCode:"I-04", dept:"PROJ",  owner:"A. Alsaif",    start:"2025-01-01", end:"2026-07-09", phase:"Tendering",   progress:7,   weight:8,  status:"active",    budgetCapex:80,  budgetOpex:10  },
  { code:"P13",  name:"Pedestrian crossings and walkways upgrade",         initCode:"I-04", dept:"PROJ",  owner:"TBD",          start:"2026-09-01", end:"2027-06-30", phase:"Not Started", progress:0,   weight:8,  status:"active",    budgetCapex:20,  budgetOpex:4   },
  { code:"P14",  name:"Fuel, services, and facilities upgrade",            initCode:"I-02", dept:"OPS",   owner:"TBD",          start:"2026-06-01", end:"2027-03-31", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:30,  budgetOpex:6   },
  { code:"P15",  name:"Landscaping and road corridor beautification",      initCode:"I-02", dept:"PROJ",  owner:"TBD",          start:"2027-01-01", end:"2028-06-30", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:25,  budgetOpex:5   },

  // ── Commercialization — 10 projects ─────────────────────────────────────
  { code:"P25",  name:"Dynamic pricing model",                             initCode:"I-08", dept:"STRAT", owner:"TBD",          start:"2029-01-01", end:"2030-12-31", phase:"Not Started", progress:0,   weight:30, status:"active",    budgetCapex:5,   budgetOpex:8   },
  { code:"P27",  name:"Tolling packages development",                      initCode:"I-08", dept:"CX",    owner:"S. Marzooq",   start:"2024-02-01", end:"2025-12-31", phase:"Not Started", progress:0,   weight:30, status:"active",    budgetCapex:3,   budgetOpex:5   },
  { code:"P28",  name:"Digital payments incentivization",                  initCode:"I-08", dept:"CX",    owner:"T. Mofarrij",  start:"2024-04-02", end:"2025-12-13", phase:"Completed",   progress:100, weight:40, status:"completed", budgetCapex:8,   budgetOpex:6   },
  { code:"P30",  name:"Data monetization strategy",                        initCode:"I-09", dept:"STRAT", owner:"TBD",          start:"2026-04-01", end:"2028-06-30", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:4,   budgetOpex:8   },
  { code:"P31",  name:"Conservative commercial offerings expansion",       initCode:"I-10", dept:"CX",    owner:"A. Alrayes",   start:"2023-04-02", end:"2024-04-11", phase:"Completed",   progress:100, weight:13, status:"completed", budgetCapex:3,   budgetOpex:5   },
  { code:"P32",  name:"Central island commercial development",             initCode:"I-10", dept:"CX",    owner:"TBD",          start:"2026-07-01", end:"2030-06-30", phase:"Not Started", progress:0,   weight:30, status:"active",    budgetCapex:40,  budgetOpex:8   },
  { code:"P33A", name:"Digital advertising (physical boards)",             initCode:"I-09", dept:"CX",    owner:"T. Mofarrij",  start:"2024-12-01", end:"2025-12-16", phase:"Completed",   progress:100, weight:13, status:"completed", budgetCapex:6,   budgetOpex:2   },
  { code:"P34",  name:"Bonded zone / SEZ feasibility study",               initCode:"I-10", dept:"CX",    owner:"TBD",          start:"2027-02-01", end:"2027-12-31", phase:"Not Started", progress:0,   weight:13, status:"active",    budgetCapex:2,   budgetOpex:3   },
  { code:"P35",  name:"Investment optimization programme",                  initCode:"I-10", dept:"FIN",   owner:"A. Almaghlou", start:"2024-07-03", end:"2025-01-30", phase:"Completed",   progress:100, weight:100,status:"completed", budgetCapex:1,   budgetOpex:4   },
  { code:"P80",  name:"Commercial B2B program study",                      initCode:"I-09", dept:"CX",    owner:"T. Mofarrij",  start:"2024-07-01", end:"2025-12-31", phase:"On Hold",     progress:24,  weight:13, status:"on_hold",   budgetCapex:2,   budgetOpex:3   },

  // ── Governance & Steering — 17 projects ──────────────────────────────────
  { code:"P36",  name:"Strategy communication plan",                       initCode:"I-11", dept:"STRAT", owner:"T. Mofarrij",  start:"2023-10-10", end:"2025-02-28", phase:"Completed",   progress:100, weight:100,status:"completed", budgetCapex:1,   budgetOpex:4   },
  { code:"P37A", name:"Internal policies & procedures revision (Ph.1)",    initCode:"I-12", dept:"GRC",   owner:"A. Alhamrani", start:"2023-12-10", end:"2025-09-30", phase:"Completed",   progress:100, weight:20, status:"completed", budgetCapex:1,   budgetOpex:4   },
  { code:"P37B", name:"Internal policies & procedures revision (Ph.2)",    initCode:"I-12", dept:"GRC",   owner:"M. Alotaibi",  start:"2024-12-01", end:"2025-09-30", phase:"Completed",   progress:100, weight:4,  status:"completed", budgetCapex:1,   budgetOpex:3   },
  { code:"P38",  name:"Organization structure revamp",                     initCode:"I-12", dept:"SHARED",owner:"N. Almutairi", start:"2023-06-15", end:"2024-05-22", phase:"Completed",   progress:100, weight:10, status:"completed", budgetCapex:1,   budgetOpex:5   },
  { code:"P39",  name:"Strategy execution governance framework",           initCode:"I-11", dept:"STRAT", owner:"T. Mofarrij",  start:"2023-08-01", end:"2024-12-19", phase:"Completed",   progress:100, weight:10, status:"completed", budgetCapex:1,   budgetOpex:4   },
  { code:"P40",  name:"Organizational business continuity planning",       initCode:"I-12", dept:"GRC",   owner:"A. Alhamrani", start:"2026-10-01", end:"2027-03-31", phase:"Not Started", progress:0,   weight:6,  status:"active",    budgetCapex:1,   budgetOpex:3   },
  { code:"P41",  name:"External governance model revamp",                  initCode:"I-13", dept:"OPS",   owner:"O. Aldahash",  start:"2024-01-28", end:"2025-07-17", phase:"Completed",   progress:100, weight:50, status:"completed", budgetCapex:1,   budgetOpex:5   },
  { code:"P42",  name:"Revision of bilateral agreement",                   initCode:"I-13", dept:"LEGAL", owner:"TBD",          start:"2026-10-01", end:"2027-12-31", phase:"On Hold",     progress:0,   weight:50, status:"on_hold",   budgetCapex:1,   budgetOpex:4   },
  { code:"P82",  name:"Enterprise Risk Management (ERM)",                  initCode:"I-12", dept:"GRC",   owner:"M. Alotaibi",  start:"2024-12-01", end:"2025-12-18", phase:"Completed",   progress:100, weight:5,  status:"completed", budgetCapex:2,   budgetOpex:4   },
  { code:"P83",  name:"Enterprise Compliance Management programme",        initCode:"I-12", dept:"GRC",   owner:"TBD",          start:"2026-10-01", end:"2027-03-31", phase:"Not Started", progress:0,   weight:6,  status:"active",    budgetCapex:1,   budgetOpex:3   },
  { code:"P85",  name:"Achieve cybersecurity excellence (maturity)",       initCode:"I-12", dept:"GRC",   owner:"A. Bazaid",    start:"2025-03-01", end:"2025-12-29", phase:"Execution",   progress:89,  weight:5,  status:"active",    budgetCapex:8,   budgetOpex:5   },
  { code:"P86",  name:"Foster cybersecurity defense posture",              initCode:"I-12", dept:"GRC",   owner:"A. Bazaid",    start:"2025-03-01", end:"2025-12-29", phase:"Closing",     progress:98,  weight:5,  status:"active",    budgetCapex:6,   budgetOpex:4   },
  { code:"P87",  name:"Establish robust cybersecurity resilience",         initCode:"I-12", dept:"GRC",   owner:"A. Bazaid",    start:"2025-01-01", end:"2025-12-29", phase:"Execution",   progress:92,  weight:5,  status:"active",    budgetCapex:7,   budgetOpex:5   },
  { code:"P88",  name:"Establish data management office",                  initCode:"I-13", dept:"STRAT", owner:"L. Basri",     start:"2024-05-02", end:"2025-10-08", phase:"Completed",   progress:100, weight:10, status:"completed", budgetCapex:2,   budgetOpex:5   },
  { code:"P91",  name:"Enhance DMO compliance integration",                initCode:"I-13", dept:"STRAT", owner:"L. Basri",     start:"2026-02-15", end:"2027-12-31", phase:"Tendering",   progress:5,   weight:6,  status:"active",    budgetCapex:3,   budgetOpex:5   },
  { code:"E1",   name:"Environmental sustainability standards",            initCode:"I-12", dept:"PROJ",  owner:"A. Alsaif",    start:"2026-03-01", end:"2026-12-31", phase:"Planning",    progress:1,   weight:6,  status:"active",    budgetCapex:2,   budgetOpex:4   },
  { code:"E2",   name:"Internal control framework revamp",                 initCode:"I-11", dept:"GRC",   owner:"TBD",          start:"2026-05-01", end:"2027-03-31", phase:"Not Started", progress:0,   weight:6,  status:"active",    budgetCapex:1,   budgetOpex:4   },

  // ── Operational Excellence — 9 projects ──────────────────────────────────
  { code:"P43",  name:"Outsourcing contracts revision",                    initCode:"I-15", dept:"SHARED",owner:"TBD",          start:"2026-08-01", end:"2027-03-31", phase:"Not Started", progress:0,   weight:33, status:"active",    budgetCapex:1,   budgetOpex:5   },
  { code:"P44",  name:"Financial controlling framework",                   initCode:"I-16", dept:"FIN",   owner:"A. AlQahtani", start:"2024-09-01", end:"2025-07-17", phase:"Completed",   progress:100, weight:33, status:"completed", budgetCapex:1,   budgetOpex:4   },
  { code:"P45",  name:"Incentive schemes to optimize on-time performance", initCode:"I-15", dept:"STRAT", owner:"T. Mofarrij",  start:"2024-11-03", end:"2026-01-30", phase:"Completed",   progress:100, weight:20, status:"completed", budgetCapex:1,   budgetOpex:5   },
  { code:"P46",  name:"Traveler pre-registration system (Pax)",           initCode:"I-17", dept:"TECH",  owner:"A. Alghamdi",  start:"2023-06-01", end:"2024-06-30", phase:"Completed",   progress:100, weight:30, status:"completed", budgetCapex:3,   budgetOpex:4   },
  { code:"P47",  name:"Pre-clearance support (Cargo)",                    initCode:"I-17", dept:"OPS",   owner:"M. Fattah",    start:"2026-02-01", end:"2027-06-30", phase:"Not Started", progress:0,   weight:10, status:"active",    budgetCapex:2,   budgetOpex:3   },
  { code:"P81A", name:"Toll gate expansion — KSA side",                   initCode:"I-17", dept:"PROJ",  owner:"A. Nimshan",   start:"2025-02-01", end:"2027-01-30", phase:"Execution",   progress:10,  weight:20, status:"active",    budgetCapex:55,  budgetOpex:8   },
  { code:"P81B", name:"Toll gate expansion — Bahrain side",               initCode:"I-17", dept:"PROJ",  owner:"TBD",          start:"2028-01-01", end:"2029-12-31", phase:"Not Started", progress:0,   weight:10, status:"active",    budgetCapex:50,  budgetOpex:8   },
  { code:"P84",  name:"Fixed assets tagging programme",                   initCode:"I-16", dept:"FIN",   owner:"I. Aloujail",  start:"2024-09-02", end:"2025-07-17", phase:"Completed",   progress:100, weight:33, status:"completed", budgetCapex:2,   budgetOpex:3   },
  { code:"E7",   name:"Supply chain excellence in ESG",                   initCode:"I-16", dept:"SHARED",owner:"TBD",          start:"2026-09-01", end:"2027-03-31", phase:"Not Started", progress:0,   weight:10, status:"active",    budgetCapex:1,   budgetOpex:3   },

  // ── Technology & Innovation — 19 projects ─────────────────────────────────
  { code:"P50A", name:"TMS & real-time performance dashboard",             initCode:"I-18", dept:"TECH",  owner:"A. Alghamdi",  start:"2023-12-01", end:"2024-04-30", phase:"Completed",   progress:100, weight:20, status:"completed", budgetCapex:8,   budgetOpex:5   },
  { code:"P50B", name:"TMS & real-time performance monitoring",            initCode:"I-18", dept:"TECH",  owner:"M. Albutery",  start:"2025-03-20", end:"2028-11-16", phase:"Tendering",   progress:9,   weight:20, status:"active",    budgetCapex:30,  budgetOpex:12  },
  { code:"P51",  name:"Staffing deployment linked to TMS",                 initCode:"I-18", dept:"OPS",   owner:"TBD",          start:"2027-04-01", end:"2028-06-30", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:3,   budgetOpex:6   },
  { code:"P52",  name:"Dynamic messaging system",                          initCode:"I-18", dept:"TECH",  owner:"TBD",          start:"2026-10-01", end:"2027-09-30", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:5,   budgetOpex:4   },
  { code:"P53",  name:"Digital innovation hub",                            initCode:"I-19", dept:"TECH",  owner:"M. Albutery",  start:"2027-01-01", end:"2027-09-30", phase:"On Hold",     progress:0,   weight:20, status:"on_hold",   budgetCapex:10,  budgetOpex:8   },
  { code:"P54",  name:"Enhanced data analytics leveraging AI",             initCode:"I-19", dept:"TECH",  owner:"R. Rushood",   start:"2024-04-15", end:"2025-11-08", phase:"On Hold",     progress:45,  weight:50, status:"on_hold",   budgetCapex:8,   budgetOpex:7   },
  { code:"P55",  name:"Digital crossings platform",                        initCode:"I-19", dept:"TECH",  owner:"TBD",          start:"2027-01-01", end:"2027-12-31", phase:"Not Started", progress:0,   weight:33, status:"active",    budgetCapex:12,  budgetOpex:6   },
  { code:"P56A", name:"One-stop shop mobile app",                          initCode:"I-20", dept:"TECH",  owner:"A. Shareeda",  start:"2023-06-01", end:"2024-11-30", phase:"Completed",   progress:100, weight:33, status:"completed", budgetCapex:6,   budgetOpex:4   },
  { code:"P56B", name:"JESR app revamp",                                   initCode:"I-20", dept:"TECH",  owner:"T. Alrammah",  start:"2026-04-01", end:"2030-12-31", phase:"Not Started", progress:0,   weight:33, status:"active",    budgetCapex:15,  budgetOpex:8   },
  { code:"P57",  name:"API integration platform and middleware",           initCode:"I-20", dept:"TECH",  owner:"TBD",          start:"2026-08-01", end:"2027-06-30", phase:"Not Started", progress:0,   weight:27, status:"active",    budgetCapex:8,   budgetOpex:6   },
  { code:"P58",  name:"Digitization of internal processes",                initCode:"I-20", dept:"TECH",  owner:"TBD",          start:"2026-04-01", end:"2027-03-31", phase:"Not Started", progress:0,   weight:27, status:"active",    budgetCapex:5,   budgetOpex:5   },
  { code:"P59",  name:"ERP system enhancement",                            initCode:"I-21", dept:"TECH",  owner:"T. Alrammah",  start:"2023-08-01", end:"2025-07-17", phase:"Completed",   progress:100, weight:20, status:"completed", budgetCapex:15,  budgetOpex:8   },
  { code:"P60",  name:"Optimize ITSM processes",                           initCode:"I-21", dept:"TECH",  owner:"A. Shareeda",  start:"2026-03-01", end:"2026-09-30", phase:"Planning",    progress:1,   weight:27, status:"active",    budgetCapex:4,   budgetOpex:5   },
  { code:"P61",  name:"Cybersecurity and data protection programme",       initCode:"I-22", dept:"GRC",   owner:"A. Bazaid",    start:"2023-11-01", end:"2027-07-12", phase:"Execution",   progress:66,  weight:25, status:"active",    budgetCapex:18,  budgetOpex:10  },
  { code:"P62",  name:"IT network infrastructure upgrade",                 initCode:"I-21", dept:"TECH",  owner:"TBD",          start:"2026-06-01", end:"2030-10-31", phase:"Not Started", progress:0,   weight:25, status:"active",    budgetCapex:40,  budgetOpex:10  },
  { code:"P63",  name:"IT business continuity & disaster recovery",        initCode:"I-21", dept:"TECH",  owner:"B. Alruwaili", start:"2024-03-03", end:"2025-06-14", phase:"Completed",   progress:100, weight:25, status:"completed", budgetCapex:8,   budgetOpex:5   },
  { code:"P64",  name:"Optimize data centers availability",                initCode:"I-21", dept:"TECH",  owner:"B. Alruwaili", start:"2024-02-18", end:"2025-07-17", phase:"Completed",   progress:100, weight:25, status:"completed", budgetCapex:12,  budgetOpex:6   },
  { code:"E3",   name:"Data governance and lake infrastructure",           initCode:"I-19", dept:"STRAT", owner:"L. Basri",     start:"2026-09-01", end:"2027-12-31", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:10,  budgetOpex:7   },
  { code:"E4",   name:"Digital twin proof of concept",                     initCode:"I-18", dept:"TECH",  owner:"TBD",          start:"2027-06-01", end:"2028-06-30", phase:"Not Started", progress:0,   weight:20, status:"active",    budgetCapex:8,   budgetOpex:5   },

  // ── Capabilities Building — 9 projects ───────────────────────────────────
  { code:"P65",  name:"Intranet system engagement platform",               initCode:"I-24", dept:"CX",    owner:"S. Marzooq",   start:"2024-12-01", end:"2025-12-29", phase:"Execution",   progress:62,  weight:50, status:"active",    budgetCapex:3,   budgetOpex:5   },
  { code:"P66",  name:"Employee & organizational health index",            initCode:"I-23", dept:"SHARED",owner:"TBD",          start:"2026-05-01", end:"2026-12-31", phase:"Not Started", progress:0,   weight:50, status:"active",    budgetCapex:1,   budgetOpex:4   },
  { code:"P67",  name:"Yearly training plans linked to competency",        initCode:"I-24", dept:"SHARED",owner:"O. Al-Shubli", start:"2025-04-01", end:"2026-01-30", phase:"Completed",   progress:100, weight:15, status:"completed", budgetCapex:1,   budgetOpex:5   },
  { code:"P68",  name:"Revised employee value proposition",                initCode:"I-23", dept:"SHARED",owner:"TBD",          start:"2027-03-01", end:"2027-12-31", phase:"Not Started", progress:0,   weight:15, status:"active",    budgetCapex:1,   budgetOpex:4   },
  { code:"P69",  name:"Clear career development paths",                    initCode:"I-23", dept:"SHARED",owner:"TBD",          start:"2026-11-01", end:"2027-08-31", phase:"Not Started", progress:0,   weight:15, status:"active",    budgetCapex:1,   budgetOpex:3   },
  { code:"P71",  name:"Inclusion and diversity programme",                 initCode:"I-23", dept:"SHARED",owner:"O. Al-Shubli", start:"2025-07-07", end:"2026-06-30", phase:"Execution",   progress:24,  weight:10, status:"active",    budgetCapex:1,   budgetOpex:3   },
  { code:"P72",  name:"University partnerships to attract talent",         initCode:"I-24", dept:"SHARED",owner:"TBD",          start:"2026-08-01", end:"2027-05-31", phase:"Not Started", progress:0,   weight:15, status:"active",    budgetCapex:1,   budgetOpex:3   },
  { code:"P73",  name:"Global & regional operator exchanges",              initCode:"I-24", dept:"STRAT", owner:"T. Mofarrij",  start:"2024-07-01", end:"2026-06-12", phase:"Execution",   progress:45,  weight:10, status:"active",    budgetCapex:2,   budgetOpex:4   },
  { code:"E5",   name:"Leadership development program",                    initCode:"I-23", dept:"SHARED",owner:"TBD",          start:"2026-05-01", end:"2026-12-31", phase:"Not Started", progress:0,   weight:10, status:"active",    budgetCapex:1,   budgetOpex:4   },

  // ── Branding & Social — 4 projects ───────────────────────────────────────
  { code:"P75",  name:"Brand marketing and social media programme",        initCode:"I-25", dept:"CX",    owner:"S. Marzooq",   start:"2023-11-01", end:"2025-01-07", phase:"Completed",   progress:100, weight:100,status:"completed", budgetCapex:1,   budgetOpex:8   },
  { code:"P76",  name:"ESG strategy development and execution",            initCode:"I-25", dept:"STRAT", owner:"B. Alturki",   start:"2024-02-05", end:"2025-09-08", phase:"Completed",   progress:100, weight:60, status:"completed", budgetCapex:1,   budgetOpex:5   },
  { code:"P77",  name:"Universal Accessibility Guidelines implementation", initCode:"I-26", dept:"PROJ",  owner:"H. Hamed",     start:"2025-06-07", end:"2026-05-07", phase:"Execution",   progress:16,  weight:40, status:"active",    budgetCapex:8,   budgetOpex:3   },
  { code:"E6",   name:"Women empowerment programme",                       initCode:"I-26", dept:"CX",    owner:"TBD",          start:"2026-05-01", end:"2027-01-31", phase:"Not Started", progress:0,   weight:10, status:"active",    budgetCapex:1,   budgetOpex:4   },

  // ── PS Participation & Funding — 2 projects ───────────────────────────────
  { code:"P78",  name:"Private sector involvement opportunities study",    initCode:"I-27", dept:"CX",    owner:"TBD",          start:"2026-11-01", end:"2027-08-31", phase:"Not Started", progress:0,   weight:100,status:"active",    budgetCapex:2,   budgetOpex:5   },
  { code:"P79",  name:"Corporatization readiness assessment",              initCode:"I-28", dept:"STRAT", owner:"T. Mofarrij",  start:"2026-10-01", end:"2027-06-30", phase:"Not Started", progress:0,   weight:100,status:"active",    budgetCapex:3,   budgetOpex:7   },
];

// ── Milestone generation ───────────────────────────────────────────────────────

const TASK_MILESTONE_SETS: Record<string, Array<{ name: string; weight: number; effortDays: number }>> = {
  TECH: [
    { name: "Requirements & Architecture",   weight: 20, effortDays: 15 },
    { name: "Design & Prototyping",           weight: 20, effortDays: 20 },
    { name: "Development Sprint",             weight: 30, effortDays: 45 },
    { name: "Testing & Quality Assurance",    weight: 15, effortDays: 20 },
    { name: "UAT & Deployment",               weight: 15, effortDays: 15 },
  ],
  PROJ: [
    { name: "Site Survey & Feasibility",      weight: 10, effortDays: 20 },
    { name: "Design & Engineering",           weight: 20, effortDays: 30 },
    { name: "Procurement & Contracting",      weight: 15, effortDays: 25 },
    { name: "Construction & Installation",    weight: 40, effortDays: 90 },
    { name: "Commissioning & Handover",       weight: 15, effortDays: 15 },
  ],
  OPS: [
    { name: "Process Analysis & Mapping",     weight: 20, effortDays: 15 },
    { name: "SOP Development",                weight: 20, effortDays: 20 },
    { name: "Pilot Run",                      weight: 25, effortDays: 30 },
    { name: "Operational Rollout",            weight: 25, effortDays: 30 },
    { name: "Performance Review",             weight: 10, effortDays: 10 },
  ],
  GRC: [
    { name: "Current State Assessment",       weight: 20, effortDays: 15 },
    { name: "Gap Analysis & Roadmap",         weight: 20, effortDays: 15 },
    { name: "Policy / Framework Draft",       weight: 25, effortDays: 20 },
    { name: "Stakeholder Review & Approval",  weight: 20, effortDays: 15 },
    { name: "Implementation & Training",      weight: 15, effortDays: 20 },
  ],
  STRAT: [
    { name: "Stakeholder Alignment",          weight: 20, effortDays: 10 },
    { name: "Strategy / Plan Development",    weight: 30, effortDays: 20 },
    { name: "Internal Review Cycle",          weight: 20, effortDays: 15 },
    { name: "Approval & Endorsement",         weight: 15, effortDays: 10 },
    { name: "Communication & Rollout",        weight: 15, effortDays: 15 },
  ],
  SHARED: [
    { name: "Needs Assessment",               weight: 20, effortDays: 10 },
    { name: "Programme Design",               weight: 25, effortDays: 20 },
    { name: "Pilot & Feedback",               weight: 25, effortDays: 20 },
    { name: "Full Rollout",                   weight: 20, effortDays: 25 },
    { name: "Evaluation & Improvement",       weight: 10, effortDays: 10 },
  ],
  FIN: [
    { name: "Data Collection & Analysis",     weight: 25, effortDays: 10 },
    { name: "Model / Framework Development",  weight: 25, effortDays: 15 },
    { name: "Validation & Testing",           weight: 20, effortDays: 15 },
    { name: "Approval & Sign-off",            weight: 15, effortDays: 10 },
    { name: "Implementation & Monitoring",    weight: 15, effortDays: 15 },
  ],
  CX: [
    { name: "Customer Research & Insights",   weight: 20, effortDays: 15 },
    { name: "Experience Design",              weight: 25, effortDays: 20 },
    { name: "Prototype & Validation",         weight: 25, effortDays: 20 },
    { name: "Launch & Rollout",               weight: 20, effortDays: 20 },
    { name: "Measure & Optimize",             weight: 10, effortDays: 10 },
  ],
};

function generateMilestones(proj: ProjectDef) {
  const { phase, progress } = proj;

  const phaseGateMap: Record<string, number[]> = {
    "Completed":   [100, 100, 100, 100],
    "Closing":     [100, 100, 100, 80],
    "Execution":   [100, 100, Math.min(Math.max(0, progress - 10), 95), 0],
    "Tendering":   [100, Math.min(progress * 2, 90), 0, 0],
    "Planning":    [Math.min(progress * 3, 90), 0, 0, 0],
    "Not Started": [0, 0, 0, 0],
    "On Hold":     [progress > 50 ? 100 : 30, progress > 80 ? 80 : 0, 0, 0],
  };
  const pcts = phaseGateMap[phase] ?? [0, 0, 0, 0];

  const phaseGates = [
    { name: "Planning & Requirements",   phaseGate: "planning"  as const, progress: pcts[0], weight: 5,  effortDays: 20 },
    { name: "Tendering & Procurement",   phaseGate: "tendering" as const, progress: pcts[1], weight: 5,  effortDays: 30 },
    { name: "Execution & Delivery",      phaseGate: null,                  progress: pcts[2], weight: 85, effortDays: 120 },
    { name: "Closure & Handover",        phaseGate: "closure"   as const, progress: pcts[3], weight: 5,  effortDays: 15 },
  ];

  const tasks = TASK_MILESTONE_SETS[proj.dept] ?? TASK_MILESTONE_SETS["STRAT"];
  const taskMilestones = tasks.map((t, i) => ({
    ...t,
    phaseGate: null as null,
    progress: progress === 100 ? 100
      : i === 0 ? Math.min(progress * 1.5, 100)
      : i === 1 ? Math.min(Math.max(progress - 10, 0), 100)
      : Math.max(progress - 30 - i * 15, 0),
  }));

  return [...phaseGates, ...taskMilestones];
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed-kfca] Wiping existing SPMO data...");

  await db.execute(sql`SET session_replication_role = replica`);
  const tables = [
    "spmo_raci_entries", "spmo_actions", "spmo_change_requests",
    "spmo_project_weekly_reports", "spmo_procurement", "spmo_budget_entries",
    "spmo_risk_mitigations", "spmo_mitigations", "spmo_risks",
    "spmo_kpi_measurements", "spmo_kpis",
    "spmo_evidence", "spmo_milestones", "spmo_projects",
    "spmo_initiatives", "spmo_pillars", "spmo_departments",
    "spmo_activity_log",
  ];
  for (const t of tables) {
    try { await db.execute(sql.raw(`TRUNCATE TABLE ${t} CASCADE`)); } catch { /* ignore */ }
  }
  await db.execute(sql`SET session_replication_role = DEFAULT`);

  // Programme config
  await db.execute(sql`
    INSERT INTO spmo_programme_config (
      id, programme_name, vision, mission, reporting_currency,
      fiscal_year_start, project_at_risk_threshold, project_delayed_threshold,
      milestone_at_risk_threshold, weekly_reset_day,
      default_planning_weight, default_tendering_weight,
      default_execution_weight, default_closure_weight, created_at, updated_at
    ) VALUES (
      1,
      'KFCA Corporate Strategy 2025-2030',
      'To be a world-class transnational authority delivering exceptional infrastructure, services and experiences across King Fahd Causeway.',
      'Drive transformation across 3 strategic pillars and 6 cross-cutting enablers to enhance connectivity, safety, commercialization and operational excellence on the King Fahd Causeway.',
      'SAR', 1, 5, 10, 5, 3, 5, 5, 85, 5, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      programme_name = EXCLUDED.programme_name,
      vision = EXCLUDED.vision,
      mission = EXCLUDED.mission,
      updated_at = NOW()
  `);
  console.log("[seed-kfca] Programme config OK.");

  // Departments
  const deptIdMap: Record<string, number> = {};
  for (const d of DEPARTMENTS) {
    const res = await db.execute(sql`
      INSERT INTO spmo_departments (name, description, color, sort_order, created_at, updated_at)
      VALUES (${d.name}, ${d.name}, ${d.color}, 0, NOW(), NOW())
      RETURNING id
    `);
    deptIdMap[d.code] = (res.rows[0] as { id: number }).id;
  }
  console.log(`[seed-kfca] ${DEPARTMENTS.length} departments inserted.`);

  // Pillars & Enablers
  const pillarIdMap: Record<string, number> = {};
  for (const p of PILLARS) {
    const res = await db.execute(sql`
      INSERT INTO spmo_pillars (name, description, pillar_type, color, weight, sort_order, created_at, updated_at)
      VALUES (${p.name}, ${p.description}, ${p.pillarType}, ${p.color}, ${p.weight}, ${p.sortOrder}, NOW(), NOW())
      RETURNING id
    `);
    pillarIdMap[p.name] = (res.rows[0] as { id: number }).id;
    console.log(`  [${p.pillarType.toUpperCase()}] ${p.name}`);
  }
  console.log(`[seed-kfca] ${PILLARS.length} pillars/enablers inserted.`);

  // Initiatives
  const initIdMap: Record<string, number> = {};
  for (const ini of INITIATIVES) {
    const pillarId = pillarIdMap[ini.pillarKey];
    if (!pillarId) { console.warn(`  ⚠ Unknown pillar: ${ini.pillarKey}`); continue; }
    const res = await db.execute(sql`
      INSERT INTO spmo_initiatives (
        pillar_id, initiative_code, name, description, owner_id, owner_name,
        start_date, target_date, budget, status, sort_order, created_at, updated_at
      ) VALUES (
        ${pillarId}, ${ini.code}, ${ini.name}, ${ini.description}, 'seed', 'PMO Office',
        '2023-01-01', '2030-12-31', 0, 'active', 0, NOW(), NOW()
      ) RETURNING id
    `);
    initIdMap[ini.code] = (res.rows[0] as { id: number }).id;
  }
  console.log(`[seed-kfca] ${INITIATIVES.length} initiatives inserted.`);

  // Projects + Milestones
  let projectCount = 0;
  let milestoneCount = 0;
  const unknownInits: string[] = [];

  for (const proj of PROJECTS) {
    const initId = initIdMap[proj.initCode];
    if (!initId) {
      unknownInits.push(`${proj.code} → ${proj.initCode}`);
      continue;
    }
    const deptId = deptIdMap[proj.dept] ?? null;
    const budget = proj.budgetCapex + proj.budgetOpex;
    const budgetSpent = proj.phase === "Completed" || proj.progress === 100
      ? budget
      : proj.phase === "Execution"  ? Math.round(budget * proj.progress / 100 * 0.9)
      : proj.phase === "Tendering"  ? Math.round(budget * 0.1)
      : proj.phase === "Planning"   ? Math.round(budget * 0.03)
      : proj.phase === "Closing"    ? Math.round(budget * 0.95)
      : 0;

    const res = await db.execute(sql`
      INSERT INTO spmo_projects (
        project_code, initiative_id, department_id, name, description,
        owner_id, owner_name, start_date, target_date, weight,
        budget, budget_capex, budget_opex, budget_spent, status,
        dep_status, created_at, updated_at
      ) VALUES (
        ${proj.code}, ${initId}, ${deptId}, ${proj.name}, '',
        'seed', ${proj.owner !== "TBD" ? proj.owner : null},
        ${proj.start}, ${proj.end}, ${proj.weight},
        ${budget}, ${proj.budgetCapex}, ${proj.budgetOpex}, ${budgetSpent},
        ${proj.status}, 'ready', NOW(), NOW()
      ) RETURNING id
    `);
    const projectId = (res.rows[0] as { id: number }).id;
    projectCount++;

    for (const ms of generateMilestones(proj)) {
      const msStatus = ms.progress === 100 ? "approved"
        : ms.progress > 0 ? "in_progress" : "pending";
      await db.execute(sql`
        INSERT INTO spmo_milestones (
          project_id, name, description, weight, effort_days,
          progress, status, phase_gate, assignee_name, dep_status,
          created_at, updated_at
        ) VALUES (
          ${projectId}, ${ms.name}, '', ${ms.weight}, ${ms.effortDays},
          ${ms.progress}, ${msStatus}, ${ms.phaseGate ?? null},
          ${proj.owner !== "TBD" ? proj.owner : null},
          'ready', NOW(), NOW()
        )
      `);
      milestoneCount++;
    }
  }

  if (unknownInits.length > 0) console.warn(`  ⚠ Unknown initiatives: ${unknownInits.join(", ")}`);
  console.log(`[seed-kfca] ${projectCount}/100 projects inserted.`);
  console.log(`[seed-kfca] ${milestoneCount} milestones inserted.`);
  console.log("[seed-kfca] ✅ Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-kfca] Fatal error:", err);
  process.exit(1);
});
