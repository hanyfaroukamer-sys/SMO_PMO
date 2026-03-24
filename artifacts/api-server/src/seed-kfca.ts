/**
 * KFCA One-Time Hardcoded Seed Script
 * Derived from KFCA-Complete-Seed-Data PPTX
 * Run: pnpm exec tsx ./src/seed-kfca.ts
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeptDef { name: string; code: string; color: string; }
interface PillarDef { name: string; color: string; description: string; sortOrder: number; weight: number; }
interface InitDef { code: string; name: string; pillarKey: string; description: string; }
interface ProjectDef {
  code: string; name: string; initCode: string; dept: string;
  owner: string; phase: string; progress: number; weight: number; status: string;
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

// ── Pillars ────────────────────────────────────────────────────────────────────

const PILLARS: PillarDef[] = [
  { name: "Assets & Infrastructure",   color: "#2563EB", description: "Infrastructure development, road safety, asset management, and terminal enhancement.", sortOrder: 1, weight: 22 },
  { name: "Customer Experience",        color: "#7C3AED", description: "Customer journey, fast lanes, trusted traveler, and satisfaction improvement.", sortOrder: 2, weight: 8  },
  { name: "Commercialization",          color: "#E8590C", description: "Dynamic pricing, digital payments, data monetization, and commercial expansion.", sortOrder: 3, weight: 10 },
  { name: "Governance & Steering",      color: "#0D9488", description: "Strategy governance, policy revision, compliance, risk management, and external relations.", sortOrder: 4, weight: 17 },
  { name: "Operational Excellence",     color: "#B91C1C", description: "Operational efficiency, financial control, outsourcing, and border optimization.", sortOrder: 5, weight: 9  },
  { name: "Technology & Innovation",    color: "#CA8A04", description: "TMS, digital services, IT infrastructure, cybersecurity, and digital transformation.", sortOrder: 6, weight: 19 },
  { name: "Capability Building",        color: "#15803D", description: "HR development, training, career paths, leadership, and organizational health.", sortOrder: 7, weight: 9  },
  { name: "Branding & Social",          color: "#BE185D", description: "Brand marketing, ESG, accessibility, and women empowerment.", sortOrder: 8, weight: 4  },
  { name: "PS Participation",           color: "#6366F1", description: "Private sector participation, corporatization readiness, and funding diversification.", sortOrder: 9, weight: 2  },
];

// ── Initiatives ────────────────────────────────────────────────────────────────

const INITIATIVES: InitDef[] = [
  // Assets & Infrastructure
  { code: "I-01", name: "Road Safety & Compliance",       pillarKey: "Assets & Infrastructure",  description: "Implement iRAP, CCTV coverage, road assessment technologies and safety standards." },
  { code: "I-02", name: "Asset & Facility Management",    pillarKey: "Assets & Infrastructure",  description: "Road and facility asset management system implementation and optimization." },
  { code: "I-03", name: "Traffic & Logistics Systems",    pillarKey: "Assets & Infrastructure",  description: "Traffic monitoring, forecasting, and cargo journey optimization." },
  { code: "I-04", name: "Terminal & Island Development",  pillarKey: "Assets & Infrastructure",  description: "Enhancement of terminals, access roads, and Central Island master plan phases." },
  // Customer Experience
  { code: "I-05", name: "Border Crossing Experience",     pillarKey: "Customer Experience",      description: "Fast lane, trusted traveler program, and crossing journey improvement." },
  { code: "I-06", name: "Customer Care & Centralization", pillarKey: "Customer Experience",      description: "Customer care centralization, satisfaction surveys, and CX mapping." },
  { code: "I-07", name: "CX Intelligence & Analytics",   pillarKey: "Customer Experience",      description: "Customer sentiment, journey analytics, and experience measurement." },
  // Commercialization
  { code: "I-08", name: "Revenue & Pricing Strategy",     pillarKey: "Commercialization",        description: "Dynamic pricing, tolling packages, and digital payments incentivization." },
  { code: "I-09", name: "Data & Digital Commerce",        pillarKey: "Commercialization",        description: "Data monetization, digital services, and e-commerce offerings." },
  { code: "I-10", name: "Commercial Development",         pillarKey: "Commercialization",        description: "Central island commercial development and conservative offerings expansion." },
  // Governance & Steering
  { code: "I-11", name: "Strategy Communication",         pillarKey: "Governance & Steering",    description: "Strategy communication plan and stakeholder engagement." },
  { code: "I-12", name: "Policy & Compliance",            pillarKey: "Governance & Steering",    description: "Internal policies revision, organizational structure, and compliance management." },
  { code: "I-13", name: "Strategy Execution Governance",  pillarKey: "Governance & Steering",    description: "Strategy execution governance, external governance model, and bilateral agreements." },
  { code: "I-14", name: "Risk & Cybersecurity Management",pillarKey: "Governance & Steering",    description: "Enterprise risk management, cybersecurity excellence, and data management office." },
  // Operational Excellence
  { code: "I-15", name: "Operational Efficiency",         pillarKey: "Operational Excellence",   description: "Outsourcing revision, incentive schemes, and operational performance improvement." },
  { code: "I-16", name: "Financial & Asset Control",      pillarKey: "Operational Excellence",   description: "Financial controlling, fixed assets tagging, and supply chain excellence." },
  { code: "I-17", name: "Border & Toll Operations",       pillarKey: "Operational Excellence",   description: "Toll gate expansion, pre-clearance support, and traveler pre-registration." },
  // Technology & Innovation
  { code: "I-18", name: "Traffic Management Systems",     pillarKey: "Technology & Innovation",  description: "TMS implementation, real-time performance dashboard and monitoring." },
  { code: "I-19", name: "Digital Innovation",             pillarKey: "Technology & Innovation",  description: "Digital innovation hub, data analytics, and digital crossings." },
  { code: "I-20", name: "Digital Services & Mobile",      pillarKey: "Technology & Innovation",  description: "One-stop shop mobile app, JESR app, and digital process optimization." },
  { code: "I-21", name: "IT Infrastructure & Resilience", pillarKey: "Technology & Innovation",  description: "IT network upgrade, ERP enhancement, ITSM, and business continuity." },
  { code: "I-22", name: "Cybersecurity Excellence",       pillarKey: "Technology & Innovation",  description: "Cybersecurity and data protection, defense, and resilience program." },
  // Capability Building
  { code: "I-23", name: "HR Development & Wellbeing",     pillarKey: "Capability Building",      description: "Employee health index, training plans, EVP, career paths, and inclusion." },
  { code: "I-24", name: "Leadership & Partnerships",      pillarKey: "Capability Building",      description: "Leadership development, university partnerships, and global operator exchanges." },
  // Branding & Social
  { code: "I-25", name: "Brand & ESG",                    pillarKey: "Branding & Social",        description: "Brand marketing, ESG strategy, accessibility guidelines, and women empowerment." },
  // PS Participation
  { code: "I-26", name: "Private Sector Engagement",      pillarKey: "PS Participation",         description: "Private sector involvement opportunities and corporatization readiness." },
];

// ── Projects ───────────────────────────────────────────────────────────────────

const PROJECTS: ProjectDef[] = [
  // ── Assets & Infrastructure ──
  { code: "P1",   name: "Meet iRAP requirements",                              initCode: "I-01", dept: "OPS",    owner: "O. Aldahash",   phase: "Completed",  progress: 100, weight: 25, status: "on-track" },
  { code: "P2",   name: "Automated equipment coverage (CCTV)",                  initCode: "I-01", dept: "TECH",   owner: "B. Alruwaili",  phase: "Completed",  progress: 100, weight: 25, status: "on-track" },
  { code: "P5",   name: "Cargo journey optimization",                            initCode: "I-03", dept: "PROJ",   owner: "A. Bumteia",    phase: "Execution",  progress: 82,  weight: 25, status: "at-risk"  },
  { code: "P6",   name: "Road assessment technologies",                          initCode: "I-01", dept: "OPS",    owner: "F. Yusuf",      phase: "Completed",  progress: 100, weight: 25, status: "on-track" },
  { code: "P7",   name: "Road and Facility Asset Management System",             initCode: "I-02", dept: "TECH",   owner: "M. Albutery",   phase: "Completed",  progress: 100, weight: 60, status: "on-track" },
  { code: "P9",   name: "Traffic monitoring and forecasting",                    initCode: "I-03", dept: "STRAT",  owner: "TBD",           phase: "Not Started",progress: 0,   weight: 40, status: "on-track" },
  { code: "P10A", name: "Enhancement of terminals & access roads",               initCode: "I-04", dept: "PROJ",   owner: "M. Salmeen",    phase: "Completed",  progress: 100, weight: 8,  status: "on-track" },
  { code: "P10B", name: "Enhancement of customer terminals & access points",     initCode: "I-04", dept: "PROJ",   owner: "A. Nimshan",    phase: "Execution",  progress: 49,  weight: 8,  status: "at-risk"  },
  { code: "P11A", name: "Central Island master plan – Phase 1 execution",        initCode: "I-04", dept: "PROJ",   owner: "A. Bumatia",    phase: "Completed",  progress: 100, weight: 8,  status: "on-track" },
  { code: "P11B", name: "Central Island master plan – Phase 2 design",           initCode: "I-04", dept: "PROJ",   owner: "A. Alsaif",     phase: "Tendering",  progress: 9,   weight: 8,  status: "at-risk"  },
  { code: "P11C", name: "Central Island Phase 2 – Power and infrastructure",     initCode: "I-04", dept: "PROJ",   owner: "M. Mahfouz",    phase: "Execution",  progress: 23,  weight: 8,  status: "at-risk"  },
  { code: "P11D", name: "Central Island Phase 2 – Government buildings",         initCode: "I-04", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 8,  status: "on-track" },
  { code: "P11E", name: "Central Island Phase 2 – Cargo separation",             initCode: "I-04", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 8,  status: "on-track" },
  { code: "P11F", name: "Central Island Phase 2 – Procedure areas",              initCode: "I-04", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 8,  status: "on-track" },
  { code: "P11G", name: "Central Island Phase 2 – Services infrastructure",      initCode: "I-04", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 8,  status: "on-track" },
  { code: "P11H", name: "Central Island Phase 2 – Commercial areas",             initCode: "I-04", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 8,  status: "on-track" },
  { code: "P3",   name: "Bridge structural inspection & maintenance",             initCode: "I-02", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },
  { code: "P4",   name: "Emergency response and hazmat facilities upgrade",       initCode: "I-01", dept: "OPS",    owner: "TBD",           phase: "Not Started",progress: 0,   weight: 25, status: "on-track" },
  { code: "P8",   name: "Causeway lighting and electrical systems upgrade",       initCode: "I-02", dept: "PROJ",   owner: "TBD",           phase: "Tendering",  progress: 12,  weight: 20, status: "at-risk"  },
  { code: "P12",  name: "Wastewater and utilities infrastructure",                initCode: "I-04", dept: "PROJ",   owner: "TBD",           phase: "Planning",   progress: 5,   weight: 8,  status: "on-track" },
  { code: "P13",  name: "Fire safety system overhaul",                           initCode: "I-01", dept: "OPS",    owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },
  { code: "P14",  name: "Perimeter security and access control upgrade",          initCode: "I-02", dept: "GRC",    owner: "TBD",           phase: "Not Started",progress: 0,   weight: 15, status: "on-track" },

  // ── Customer Experience ──
  { code: "P19",  name: "Trusted traveler program",                              initCode: "I-05", dept: "OPS",    owner: "A. Al Shrhan",  phase: "On Hold",    progress: 0,   weight: 33, status: "on-hold"  },
  { code: "P20",  name: "Fast lane construction & optimization",                  initCode: "I-05", dept: "OPS",    owner: "O. Aldahash",   phase: "Completed",  progress: 100, weight: 33, status: "on-track" },
  { code: "P21",  name: "Customer journey optimization",                          initCode: "I-06", dept: "OPS",    owner: "T. Mofarrij",   phase: "Execution",  progress: 64,  weight: 20, status: "at-risk"  },
  { code: "P22",  name: "Customer journey mapping & optimization phase 2",        initCode: "I-06", dept: "OPS",    owner: "M. Fattah",     phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P23A", name: "Customer care centralization phase 1",                   initCode: "I-06", dept: "CX",     owner: "B. AlTurki",    phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P24",  name: "Customer satisfaction survey optimization",              initCode: "I-07", dept: "CX",     owner: "S. Marzooq",    phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P92",  name: "Enhance CX & gauge customer sentiment",                  initCode: "I-07", dept: "STRAT",  owner: "TBD",           phase: "Not Started",progress: 0,   weight: 33, status: "on-track" },
  { code: "P23B", name: "Customer care centralization phase 2",                   initCode: "I-06", dept: "CX",     owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },

  // ── Commercialization ──
  { code: "P25",  name: "Dynamic pricing",                                        initCode: "I-08", dept: "STRAT",  owner: "TBD",           phase: "Not Started",progress: 0,   weight: 30, status: "on-track" },
  { code: "P27",  name: "Tolling packages",                                       initCode: "I-08", dept: "CX",     owner: "S. Marzooq",    phase: "Not Started",progress: 0,   weight: 30, status: "on-track" },
  { code: "P28",  name: "Digital payments incentivization",                       initCode: "I-08", dept: "CX",     owner: "T. Mofarrij",   phase: "Completed",  progress: 100, weight: 40, status: "on-track" },
  { code: "P30",  name: "Data monetization",                                      initCode: "I-09", dept: "STRAT",  owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },
  { code: "P31",  name: "Conservative commercial offerings expansion",            initCode: "I-10", dept: "CX",     owner: "A. Alrayes",    phase: "Completed",  progress: 100, weight: 13, status: "on-track" },
  { code: "P32",  name: "Central island commercial development",                  initCode: "I-10", dept: "CX",     owner: "S. Marzooq",    phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P33",  name: "E-commerce platform for duty-free services",             initCode: "I-09", dept: "TECH",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 30, status: "on-track" },
  { code: "P34",  name: "Advertising revenue optimization",                       initCode: "I-10", dept: "CX",     owner: "TBD",           phase: "Not Started",progress: 0,   weight: 15, status: "on-track" },
  { code: "P35",  name: "Lounge and premium services monetization",               initCode: "I-10", dept: "CX",     owner: "TBD",           phase: "Planning",   progress: 8,   weight: 20, status: "on-track" },
  { code: "P26",  name: "Cargo commercial services expansion",                    initCode: "I-09", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },
  { code: "P29",  name: "Partner loyalty and reward programs",                    initCode: "I-08", dept: "CX",     owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },

  // ── Governance & Steering ──
  { code: "P36",  name: "Strategy communication plan",                            initCode: "I-11", dept: "STRAT",  owner: "T. Mofarrij",   phase: "Completed",  progress: 100, weight: 100, status: "on-track" },
  { code: "P37A", name: "Revision of internal policies – phase 1",               initCode: "I-12", dept: "GRC",    owner: "A. Alhamrani",  phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P37B", name: "Revision of internal policies – phase 2",               initCode: "I-12", dept: "GRC",    owner: "M. Alotaibi",   phase: "Completed",  progress: 100, weight: 4,  status: "on-track" },
  { code: "P38",  name: "Organization structure revamp",                          initCode: "I-12", dept: "SHARED", owner: "N. Almutairi",  phase: "Completed",  progress: 100, weight: 10, status: "on-track" },
  { code: "P39",  name: "Strategy execution governance",                          initCode: "I-13", dept: "STRAT",  owner: "T. Mofarrij",   phase: "Completed",  progress: 100, weight: 10, status: "on-track" },
  { code: "P40",  name: "Organizational business continuity management",          initCode: "I-14", dept: "GRC",    owner: "A. Alhamrani",  phase: "Not Started",progress: 0,   weight: 6,  status: "on-track" },
  { code: "P41",  name: "External governance model revamp",                       initCode: "I-13", dept: "OPS",    owner: "O. Aldahash",   phase: "Completed",  progress: 100, weight: 50, status: "on-track" },
  { code: "P42",  name: "Revision of bilateral agreement",                        initCode: "I-13", dept: "LEGAL",  owner: "TBD",           phase: "On Hold",    progress: 0,   weight: 50, status: "on-hold"  },
  { code: "P82",  name: "Enterprise Risk Management (ERM)",                       initCode: "I-14", dept: "GRC",    owner: "M. Alotaibi",   phase: "Completed",  progress: 100, weight: 5,  status: "on-track" },
  { code: "P83",  name: "Enterprise Compliance Management",                       initCode: "I-14", dept: "GRC",    owner: "TBD",           phase: "Not Started",progress: 0,   weight: 6,  status: "on-track" },
  { code: "P85",  name: "Achieve cyber security excellence",                      initCode: "I-14", dept: "GRC",    owner: "A. Bazaid",     phase: "Execution",  progress: 89,  weight: 5,  status: "at-risk"  },
  { code: "P86",  name: "Foster cybersecurity defense",                           initCode: "I-14", dept: "GRC",    owner: "A. Bazaid",     phase: "Execution",  progress: 98,  weight: 5,  status: "at-risk"  },
  { code: "P87",  name: "Establish robust cybersecurity resilience",              initCode: "I-14", dept: "GRC",    owner: "A. Bazaid",     phase: "Execution",  progress: 92,  weight: 5,  status: "at-risk"  },
  { code: "P88",  name: "Establish data management office",                       initCode: "I-14", dept: "STRAT",  owner: "L. Basri",      phase: "Completed",  progress: 100, weight: 10, status: "on-track" },
  { code: "P91",  name: "Enhance DMO compliance integration & tooling",           initCode: "I-14", dept: "STRAT",  owner: "L. Basri",      phase: "Tendering",  progress: 5,   weight: 6,  status: "at-risk"  },
  { code: "P89",  name: "Board reporting and governance framework",               initCode: "I-13", dept: "STRAT",  owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },
  { code: "P90",  name: "KPI reporting and performance management framework",     initCode: "I-11", dept: "STRAT",  owner: "TBD",           phase: "Planning",   progress: 15,  weight: 100, status: "on-track" },

  // ── Operational Excellence ──
  { code: "P43",  name: "Outsourcing contracts revision",                         initCode: "I-15", dept: "SHARED", owner: "TBD",           phase: "Not Started",progress: 0,   weight: 33, status: "on-track" },
  { code: "P44",  name: "Financial controlling",                                  initCode: "I-16", dept: "FIN",    owner: "A. AlQahtani",  phase: "Completed",  progress: 100, weight: 33, status: "on-track" },
  { code: "P45",  name: "Incentive schemes to optimize on-the-go performance",   initCode: "I-15", dept: "STRAT",  owner: "T. Mofarrij",   phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P46",  name: "Traveler pre-registration (Pax)",                        initCode: "I-17", dept: "TECH",   owner: "A. Alghamdi",   phase: "Completed",  progress: 100, weight: 30, status: "on-track" },
  { code: "P47",  name: "Pre-clearance support (Cargo)",                          initCode: "I-17", dept: "OPS",    owner: "M. Fattah",     phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },
  { code: "P81A", name: "Toll gate expansion KSA side",                           initCode: "I-17", dept: "PROJ",   owner: "A. Nimshan",    phase: "Execution",  progress: 10,  weight: 20, status: "at-risk"  },
  { code: "P81B", name: "Toll gate expansion Bahrain side",                       initCode: "I-17", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },
  { code: "P84",  name: "Fixed assets tagging",                                   initCode: "I-16", dept: "FIN",    owner: "I. Aloujail",   phase: "Completed",  progress: 100, weight: 33, status: "on-track" },
  { code: "E7",   name: "Supply chain excellence in ESG",                         initCode: "I-15", dept: "SHARED", owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },

  // ── Technology & Innovation ──
  { code: "P50A", name: "TMS & real-time performance dashboard",                  initCode: "I-18", dept: "TECH",   owner: "A. Alghamdi",   phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P50B", name: "TMS & real-time performance monitoring",                 initCode: "I-18", dept: "TECH",   owner: "M. Albutery",   phase: "Tendering",  progress: 9,   weight: 20, status: "at-risk"  },
  { code: "P51",  name: "Staffing deployment linked to TMS",                      initCode: "I-18", dept: "OPS",    owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },
  { code: "P52",  name: "Dynamic messaging",                                      initCode: "I-18", dept: "TECH",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },
  { code: "P53",  name: "Digital innovation hub",                                 initCode: "I-19", dept: "TECH",   owner: "M. Albutery",   phase: "On Hold",    progress: 0,   weight: 20, status: "on-hold"  },
  { code: "P54",  name: "Enhanced data analytics leveraging big data",            initCode: "I-19", dept: "TECH",   owner: "R. Rushood",    phase: "On Hold",    progress: 45,  weight: 50, status: "on-hold"  },
  { code: "P55",  name: "Digital crossings",                                      initCode: "I-19", dept: "TECH",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 33, status: "on-track" },
  { code: "P56A", name: "One-stop shop mobile app – phase 1",                     initCode: "I-20", dept: "TECH",   owner: "A. Shareeda",   phase: "Completed",  progress: 100, weight: 33, status: "on-track" },
  { code: "P56B", name: "JESR app revamp",                                        initCode: "I-20", dept: "TECH",   owner: "T. Alrammah",   phase: "Not Started",progress: 0,   weight: 33, status: "on-track" },
  { code: "P58",  name: "Digitization of internal processes",                     initCode: "I-20", dept: "TECH",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 27, status: "on-track" },
  { code: "P59",  name: "ERP system enhancement",                                 initCode: "I-21", dept: "TECH",   owner: "T. Alrammah",   phase: "Completed",  progress: 100, weight: 20, status: "on-track" },
  { code: "P60",  name: "Optimize ITSM processes",                                initCode: "I-21", dept: "TECH",   owner: "A. Shareeda",   phase: "Planning",   progress: 1,   weight: 27, status: "at-risk"  },
  { code: "P61",  name: "Cybersecurity and data protection",                      initCode: "I-22", dept: "GRC",    owner: "A. Bazaid",     phase: "Execution",  progress: 66,  weight: 25, status: "at-risk"  },
  { code: "P62",  name: "IT network infrastructure upgrade",                      initCode: "I-21", dept: "TECH",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 25, status: "on-track" },
  { code: "P63",  name: "IT business continuity and disaster recovery",           initCode: "I-21", dept: "TECH",   owner: "B. Alruwaili",  phase: "Completed",  progress: 100, weight: 25, status: "on-track" },
  { code: "P64",  name: "Cloud infrastructure migration",                         initCode: "I-21", dept: "TECH",   owner: "TBD",           phase: "Tendering",  progress: 5,   weight: 25, status: "on-track" },
  { code: "P57",  name: "Open data and API strategy",                             initCode: "I-19", dept: "TECH",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },
  { code: "E1",   name: "AI-driven border control analytics",                     initCode: "I-22", dept: "GRC",    owner: "TBD",           phase: "Not Started",progress: 0,   weight: 25, status: "on-track" },
  { code: "E2",   name: "Blockchain for customs documentation",                   initCode: "I-20", dept: "TECH",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },

  // ── Capability Building ──
  { code: "P65",  name: "Intranet system engagement",                             initCode: "I-23", dept: "CX",     owner: "S. Marzooq",    phase: "Execution",  progress: 62,  weight: 50, status: "at-risk"  },
  { code: "P66",  name: "Employee/organizational health index",                   initCode: "I-23", dept: "SHARED", owner: "TBD",           phase: "Not Started",progress: 0,   weight: 50, status: "on-track" },
  { code: "P67",  name: "Yearly training plans linked to competencies",           initCode: "I-23", dept: "SHARED", owner: "O. Al-Shubli",  phase: "Completed",  progress: 100, weight: 15, status: "on-track" },
  { code: "P68",  name: "Revised employee value proposition",                     initCode: "I-23", dept: "SHARED", owner: "TBD",           phase: "Not Started",progress: 0,   weight: 15, status: "on-track" },
  { code: "P69",  name: "Clear career development paths",                         initCode: "I-23", dept: "SHARED", owner: "TBD",           phase: "Not Started",progress: 0,   weight: 15, status: "on-track" },
  { code: "P71",  name: "Inclusion and diversity efforts",                        initCode: "I-23", dept: "SHARED", owner: "O. Al-Shubli",  phase: "Execution",  progress: 24,  weight: 10, status: "at-risk"  },
  { code: "P72",  name: "University partnerships to attract talent",              initCode: "I-24", dept: "SHARED", owner: "TBD",           phase: "Not Started",progress: 0,   weight: 15, status: "on-track" },
  { code: "P73",  name: "Global/regional operator exchanges",                     initCode: "I-24", dept: "STRAT",  owner: "T. Mofarrij",   phase: "Execution",  progress: 45,  weight: 10, status: "at-risk"  },
  { code: "E5",   name: "Leadership development program",                         initCode: "I-24", dept: "SHARED", owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },

  // ── Branding & Social ──
  { code: "P75",  name: "Brand marketing and social media presence",              initCode: "I-25", dept: "CX",     owner: "S. Marzooq",    phase: "Completed",  progress: 100, weight: 100, status: "on-track" },
  { code: "P76",  name: "ESG strategy development and execution",                 initCode: "I-25", dept: "STRAT",  owner: "B. Alturki",    phase: "Completed",  progress: 100, weight: 60, status: "on-track" },
  { code: "P77",  name: "Universal Accessibility Guidelines",                     initCode: "I-25", dept: "PROJ",   owner: "H. Hamed",      phase: "Execution",  progress: 16,  weight: 40, status: "at-risk"  },
  { code: "E6",   name: "Women empowerment program",                              initCode: "I-25", dept: "CX",     owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },

  // ── PS Participation ──
  { code: "P78",  name: "Private sector involvement opportunities",               initCode: "I-26", dept: "CX",     owner: "TBD",           phase: "Not Started",progress: 0,   weight: 100, status: "on-track" },
  { code: "P79",  name: "Corporatization readiness",                              initCode: "I-26", dept: "STRAT",  owner: "T. Mofarrij",   phase: "Not Started",progress: 0,   weight: 100, status: "on-track" },
  // Additional E-series
  { code: "E3",   name: "Smart border technology pilot",                          initCode: "I-22", dept: "GRC",    owner: "TBD",           phase: "Not Started",progress: 0,   weight: 25, status: "on-track" },
  { code: "E4",   name: "Predictive maintenance for causeway infrastructure",     initCode: "I-02", dept: "PROJ",   owner: "TBD",           phase: "Not Started",progress: 0,   weight: 20, status: "on-track" },
  { code: "E8",   name: "Environmental monitoring and green causeway initiative", initCode: "I-25", dept: "STRAT",  owner: "TBD",           phase: "Not Started",progress: 0,   weight: 10, status: "on-track" },
];

// ── Phase gate milestone generation ───────────────────────────────────────────

function generateMilestones(proj: ProjectDef) {
  const progress = proj.progress;
  const phase = proj.phase;

  const mapping: Record<string, number[]> = {
    "Completed":   [100, 100, 100, 100],
    "Execution":   [100, 100, Math.min(Math.max(0, progress - 10), 95), 0],
    "Tendering":   [100, Math.min(progress * 2, 90), 0, 0],
    "Planning":    [Math.min(progress * 3, 90), 0, 0, 0],
    "Not Started": [0, 0, 0, 0],
    "On Hold":     [progress > 50 ? 100 : 30, progress > 80 ? 80 : 0, 0, 0],
    "Closing":     [100, 100, 100, 80],
  };
  const pcts = mapping[phase] ?? [0, 0, 0, 0];

  return [
    { name: "Planning & Requirements",   phase: "planning",  progress: pcts[0], weight: 5,  effortDays: 20 },
    { name: "Tendering & Procurement",   phase: "tendering", progress: pcts[1], weight: 5,  effortDays: 30 },
    { name: "Execution & Delivery",      phase: null,        progress: pcts[2], weight: 85, effortDays: 120 },
    { name: "Closure & Handover",        phase: "closure",   progress: pcts[3], weight: 5,  effortDays: 15 },
  ];
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
      'Drive transformation across 9 strategic pillars to enhance connectivity, safety, commercialization and operational excellence on the King Fahd Causeway.',
      'SAR', 1, 5, 10, 5, 3, 5, 5, 85, 5, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      programme_name = EXCLUDED.programme_name,
      vision = EXCLUDED.vision,
      mission = EXCLUDED.mission,
      updated_at = NOW()
  `);

  // Departments
  console.log("[seed-kfca] Inserting departments...");
  const deptIdByCode = new Map<string, number>();
  for (const d of DEPARTMENTS) {
    const r = await db.execute(sql`
      INSERT INTO spmo_departments (name, description, color, sort_order, created_at, updated_at)
      VALUES (${d.name}, ${d.code}, ${d.color}, 0, NOW(), NOW())
      RETURNING id
    `);
    deptIdByCode.set(d.code, (r.rows[0] as { id: number }).id);
  }

  // Pillars
  console.log("[seed-kfca] Inserting pillars...");
  const pillarIdByName = new Map<string, number>();
  for (const p of PILLARS) {
    const r = await db.execute(sql`
      INSERT INTO spmo_pillars (name, color, description, sort_order, weight, created_at, updated_at)
      VALUES (${p.name}, ${p.color}, ${p.description}, ${p.sortOrder}, ${p.weight}, NOW(), NOW())
      RETURNING id
    `);
    pillarIdByName.set(p.name, (r.rows[0] as { id: number }).id);
  }

  // Initiatives
  console.log("[seed-kfca] Inserting initiatives...");
  const initiativeIdByCode = new Map<string, number>();
  for (const ini of INITIATIVES) {
    const pillarId = pillarIdByName.get(ini.pillarKey);
    if (!pillarId) { console.warn(`No pillar found for: ${ini.pillarKey}`); continue; }
    const r = await db.execute(sql`
      INSERT INTO spmo_initiatives (
        pillar_id, initiative_code, name, description,
        owner_id, owner_name, start_date, target_date,
        weight, status, sort_order, created_at, updated_at
      ) VALUES (
        ${pillarId}, ${ini.code}, ${ini.name}, ${ini.description},
        'system', 'Programme Office', '2025-01-01', '2030-12-31',
        0, 'active', 0, NOW(), NOW()
      ) RETURNING id
    `);
    initiativeIdByCode.set(ini.code, (r.rows[0] as { id: number }).id);
  }

  // Projects + milestones
  console.log("[seed-kfca] Inserting projects and milestones...");

  for (const proj of PROJECTS) {
    const initiativeId = initiativeIdByCode.get(proj.initCode);
    if (!initiativeId) { console.warn(`No initiative for code: ${proj.initCode} (${proj.code})`); continue; }
    const deptId = deptIdByCode.get(proj.dept) ?? null;

    // Map reporting status to DB workflow status
    let dbStatus: string;
    if (proj.phase === "Completed" && proj.progress === 100) dbStatus = "completed";
    else if (proj.phase === "On Hold") dbStatus = "on_hold";
    else dbStatus = "active";

    const r = await db.execute(sql`
      INSERT INTO spmo_projects (
        initiative_id, department_id, project_code, name, description,
        owner_id, owner_name, start_date, target_date,
        weight, budget, budget_spent, status, dep_status,
        created_at, updated_at
      ) VALUES (
        ${initiativeId}, ${deptId}, ${proj.code}, ${proj.name}, '',
        'system', ${proj.owner}, '2025-01-01', '2030-12-31',
        ${proj.weight}, 0, 0, ${dbStatus}, 'ready',
        NOW(), NOW()
      ) RETURNING id
    `);
    const projectId = (r.rows[0] as { id: number }).id;

    // Insert 4 phase-gate milestones
    const milestones = generateMilestones(proj);
    for (const ms of milestones) {
      await db.execute(sql`
        INSERT INTO spmo_milestones (
          project_id, name, description, weight, effort_days,
          progress, status, phase_gate, assignee_name, dep_status,
          created_at, updated_at
        ) VALUES (
          ${projectId}, ${ms.name}, '', ${ms.weight}, ${ms.effortDays},
          ${ms.progress},
          ${ms.progress === 100 ? 'approved' : ms.progress > 0 ? 'in_progress' : 'pending'},
          ${ms.phase},
          ${proj.owner !== "TBD" ? proj.owner : null},
          'ready', NOW(), NOW()
        )
      `);
    }
  }

  const totalMs = PROJECTS.length * 4;
  console.log(`\n✅ KFCA seed complete:`);
  console.log(`  Departments: ${DEPARTMENTS.length}`);
  console.log(`  Pillars: ${PILLARS.length}`);
  console.log(`  Initiatives: ${INITIATIVES.length}`);
  console.log(`  Projects: ${PROJECTS.length}`);
  console.log(`  Milestones: ${totalMs}`);

  process.exit(0);
}

main().catch(err => {
  console.error("[seed-kfca] Fatal:", err);
  process.exit(1);
});
