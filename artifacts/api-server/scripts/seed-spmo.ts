import { db } from "@workspace/db";
import {
  spmoPillarsTable,
  spmoInitiativesTable,
  spmoProjectsTable,
  spmoMilestonesTable,
  spmoEvidenceTable,
  spmoKpisTable,
  spmoRisksTable,
  spmoMitigationsTable,
  spmoBudgetTable,
  spmoProcurementTable,
  spmoProgrammeConfigTable,
  spmoActivityLogTable,
} from "@workspace/db";

const SYS = "seed-system";

async function seed() {
  console.log("Seeding StrategyPMO data (prototype-exact)...");

  // ─────────────────────────────────────────────────────────────
  // Programme Config
  // ─────────────────────────────────────────────────────────────
  await db
    .insert(spmoProgrammeConfigTable)
    .values({
      id: 1,
      programmeName: "National Transformation Programme",
      vision: "To become a leading digital government that delivers world-class services to all citizens and residents.",
      mission: "Drive transformation across all strategic pillars through evidence-based programme management, innovation, and accountability.",
      reportingCurrency: "SAR",
      fiscalYearStart: 1,
    })
    .onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────
  // Pillars (prototype-exact)
  // ─────────────────────────────────────────────────────────────
  const [p1, p2, p3, p4] = await db
    .insert(spmoPillarsTable)
    .values([
      {
        name: "Digital Excellence",
        description: "Transform government operations through advanced digital technologies, AI-driven services, and smart infrastructure.",
        weight: 25,
        color: "#2563EB",
        iconName: "Cpu",
        sortOrder: 1,
      },
      {
        name: "Operational Efficiency",
        description: "Streamline government processes, modernise enterprise systems, and maximise productivity across all departments.",
        weight: 25,
        color: "#7C3AED",
        iconName: "Settings",
        sortOrder: 2,
      },
      {
        name: "Customer Experience",
        description: "Deliver seamless, citizen-centric services that exceed expectations across all digital and physical touchpoints.",
        weight: 25,
        color: "#E8590C",
        iconName: "Users",
        sortOrder: 3,
      },
      {
        name: "Sustainability",
        description: "Advance environmental and social sustainability goals through green technology adoption and responsible operations.",
        weight: 25,
        color: "#0D9488",
        iconName: "Leaf",
        sortOrder: 4,
      },
    ])
    .returning();

  // ─────────────────────────────────────────────────────────────
  // Initiatives (6, prototype-exact)
  // ─────────────────────────────────────────────────────────────
  const [iTraffic, iAnalytics] = await db
    .insert(spmoInitiativesTable)
    .values([
      {
        pillarId: p1.id,
        name: "Smart Traffic Management",
        description: "Deploy AI-powered traffic management systems across the capital and major cities to reduce congestion by 40%.",
        ownerId: SYS,
        ownerName: "Ahmed Al-Rashid",
        budget: 450000000,
        weight: 75,
        status: "active",
        startDate: "2024-01-01",
        targetDate: "2026-12-31",
        sortOrder: 1,
      },
      {
        pillarId: p1.id,
        name: "Analytics Centre of Excellence",
        description: "Establish a world-class analytics centre providing data intelligence and AI capabilities across all government entities.",
        ownerId: SYS,
        ownerName: "Omar Al-Sheikh",
        budget: 150000000,
        weight: 25,
        status: "active",
        startDate: "2024-06-01",
        targetDate: "2026-06-30",
        sortOrder: 2,
      },
    ])
    .returning();

  const [iErp] = await db
    .insert(spmoInitiativesTable)
    .values([
      {
        pillarId: p2.id,
        name: "ERP Modernisation",
        description: "Replace legacy enterprise systems with an integrated cloud ERP platform covering Finance, HR, and Procurement.",
        ownerId: SYS,
        ownerName: "Fatima Al-Harbi",
        budget: 380000000,
        weight: 100,
        status: "active",
        startDate: "2024-03-01",
        targetDate: "2026-09-30",
        sortOrder: 1,
      },
    ])
    .returning();

  const [iPortal] = await db
    .insert(spmoInitiativesTable)
    .values([
      {
        pillarId: p3.id,
        name: "Customer Portal Redesign",
        description: "Redesign the national citizen portal with UX-first approach, mobile app, and AI-powered self-service capabilities.",
        ownerId: SYS,
        ownerName: "Sara Al-Mutairi",
        budget: 280000000,
        weight: 100,
        status: "active",
        startDate: "2024-02-01",
        targetDate: "2026-03-31",
        sortOrder: 1,
      },
    ])
    .returning();

  const [iFleet, iRoadSafety] = await db
    .insert(spmoInitiativesTable)
    .values([
      {
        pillarId: p4.id,
        name: "Fleet Electrification",
        description: "Transition 100% of the government vehicle fleet to electric vehicles with supporting charging infrastructure.",
        ownerId: SYS,
        ownerName: "Khalid Al-Zahrani",
        budget: 620000000,
        weight: 75,
        status: "active",
        startDate: "2024-01-01",
        targetDate: "2027-12-31",
        sortOrder: 1,
      },
      {
        pillarId: p4.id,
        name: "Road Safety Programme",
        description: "Reduce road fatalities by 50% through AI speed enforcement, road engineering improvements, and public awareness.",
        ownerId: SYS,
        ownerName: "Nora Al-Dosari",
        budget: 200000000,
        weight: 25,
        status: "active",
        startDate: "2024-04-01",
        targetDate: "2026-12-31",
        sortOrder: 2,
      },
    ])
    .returning();

  // ─────────────────────────────────────────────────────────────
  // Projects (14 total)
  // ─────────────────────────────────────────────────────────────

  // Smart Traffic Management (3 projects)
  const [pSignals, pIot, pTmc] = await db
    .insert(spmoProjectsTable)
    .values([
      {
        initiativeId: iTraffic.id,
        name: "Traffic Signal Upgrade",
        description: "Replace 2,400 traffic signals with AI-adaptive systems capable of real-time flow optimisation.",
        ownerId: SYS,
        ownerName: "Hassan Al-Qahtani",
        weight: 40,
        budget: 180000000,
        budgetSpent: 127500000,
        status: "active",
        startDate: "2024-01-15",
        targetDate: "2026-01-31",
      },
      {
        initiativeId: iTraffic.id,
        name: "IoT Sensors Deployment",
        description: "Install 12,000 traffic sensors across arterial roads and intersections for real-time data collection.",
        ownerId: SYS,
        ownerName: "Reem Al-Dosari",
        weight: 33,
        budget: 150000000,
        budgetSpent: 88200000,
        status: "active",
        startDate: "2024-03-01",
        targetDate: "2025-12-31",
      },
      {
        initiativeId: iTraffic.id,
        name: "Traffic Management Centre",
        description: "Build and operate a centralised traffic management centre with AI command and control capabilities.",
        ownerId: SYS,
        ownerName: "Tariq Al-Ghamdi",
        weight: 27,
        budget: 120000000,
        budgetSpent: 54000000,
        status: "active",
        startDate: "2024-06-01",
        targetDate: "2026-12-31",
      },
    ])
    .returning();

  // Analytics CoE (2 projects)
  const [pDataLake, pBiPlatform] = await db
    .insert(spmoProjectsTable)
    .values([
      {
        initiativeId: iAnalytics.id,
        name: "Government Data Lake",
        description: "Build a unified data lake aggregating structured and unstructured data from all 32 government entities.",
        ownerId: SYS,
        ownerName: "Layla Al-Shammari",
        weight: 60,
        budget: 90000000,
        budgetSpent: 41400000,
        status: "active",
        startDate: "2024-06-01",
        targetDate: "2026-06-30",
      },
      {
        initiativeId: iAnalytics.id,
        name: "BI Dashboard Platform",
        description: "Deploy enterprise BI platform with executive dashboards, predictive analytics, and self-service reporting.",
        ownerId: SYS,
        ownerName: "Faisal Al-Otaibi",
        weight: 40,
        budget: 60000000,
        budgetSpent: 21600000,
        status: "active",
        startDate: "2024-09-01",
        targetDate: "2026-06-30",
      },
    ])
    .returning();

  // ERP Modernisation (3 projects)
  const [pFinance, pHr, pProcMod] = await db
    .insert(spmoProjectsTable)
    .values([
      {
        initiativeId: iErp.id,
        name: "Finance Module Implementation",
        description: "Implement cloud-based financial management covering budgeting, accounts, treasury, and reporting.",
        ownerId: SYS,
        ownerName: "Mona Al-Zahrani",
        weight: 42,
        budget: 160000000,
        budgetSpent: 112000000,
        status: "active",
        startDate: "2024-03-01",
        targetDate: "2025-12-31",
      },
      {
        initiativeId: iErp.id,
        name: "HR & Payroll Module",
        description: "Deploy integrated HR, talent management, and payroll system for 45,000 government employees.",
        ownerId: SYS,
        ownerName: "Saleh Al-Mutairi",
        weight: 32,
        budget: 120000000,
        budgetSpent: 66000000,
        status: "active",
        startDate: "2024-06-01",
        targetDate: "2026-03-31",
      },
      {
        initiativeId: iErp.id,
        name: "Procurement & Contracts Module",
        description: "End-to-end electronic procurement platform covering sourcing, contracts, and supplier management.",
        ownerId: SYS,
        ownerName: "Dana Al-Harbi",
        weight: 26,
        budget: 100000000,
        budgetSpent: 28000000,
        status: "active",
        startDate: "2024-09-01",
        targetDate: "2026-09-30",
      },
    ])
    .returning();

  // Customer Portal (2 projects)
  const [pPortalUx, pMobileApp] = await db
    .insert(spmoProjectsTable)
    .values([
      {
        initiativeId: iPortal.id,
        name: "Portal UX & Backend Redesign",
        description: "Redesign the citizen portal with accessible UI, personalised dashboards, and 200+ integrated services.",
        ownerId: SYS,
        ownerName: "Amal Al-Rashidi",
        weight: 50,
        budget: 140000000,
        budgetSpent: 91000000,
        status: "active",
        startDate: "2024-02-01",
        targetDate: "2025-12-31",
      },
      {
        initiativeId: iPortal.id,
        name: "National Mobile App",
        description: "Launch iOS and Android super-app for government services with biometric authentication and push notifications.",
        ownerId: SYS,
        ownerName: "Yazeed Al-Qahtani",
        weight: 50,
        budget: 140000000,
        budgetSpent: 49000000,
        status: "active",
        startDate: "2024-05-01",
        targetDate: "2026-03-31",
      },
    ])
    .returning();

  // Fleet Electrification (2 projects)
  const [pEvFleet, pCharging] = await db
    .insert(spmoProjectsTable)
    .values([
      {
        initiativeId: iFleet.id,
        name: "EV Fleet Procurement",
        description: "Procure and deploy 8,500 electric vehicles across all government ministries and agencies.",
        ownerId: SYS,
        ownerName: "Sultan Al-Anzi",
        weight: 60,
        budget: 420000000,
        budgetSpent: 231000000,
        status: "active",
        startDate: "2024-01-01",
        targetDate: "2027-06-30",
      },
      {
        initiativeId: iFleet.id,
        name: "Charging Infrastructure Network",
        description: "Install 1,200 EV charging stations at government facilities, parking areas, and public locations.",
        ownerId: SYS,
        ownerName: "Noura Al-Subaie",
        weight: 40,
        budget: 200000000,
        budgetSpent: 72000000,
        status: "active",
        startDate: "2024-04-01",
        targetDate: "2027-06-30",
      },
    ])
    .returning();

  // Road Safety (2 projects)
  const [pCameras, pRoadEng] = await db
    .insert(spmoProjectsTable)
    .values([
      {
        initiativeId: iRoadSafety.id,
        name: "AI Speed Camera Network",
        description: "Deploy 800 AI-powered speed and behaviour cameras on high-risk roads with automated penalty issuance.",
        ownerId: SYS,
        ownerName: "Abdulrahman Al-Dosari",
        weight: 55,
        budget: 110000000,
        budgetSpent: 55000000,
        status: "active",
        startDate: "2024-04-01",
        targetDate: "2026-06-30",
      },
      {
        initiativeId: iRoadSafety.id,
        name: "Road Engineering Improvements",
        description: "Upgrade 450 high-accident black spots with improved geometry, signage, barriers, and pedestrian crossings.",
        ownerId: SYS,
        ownerName: "Hessa Al-Maliki",
        weight: 45,
        budget: 90000000,
        budgetSpent: 31500000,
        status: "active",
        startDate: "2024-07-01",
        targetDate: "2026-12-31",
      },
    ])
    .returning();

  // ─────────────────────────────────────────────────────────────
  // Milestones (45 total, ~3 per project)
  // ─────────────────────────────────────────────────────────────
  const milestones = await db
    .insert(spmoMilestonesTable)
    .values([
      // Traffic Signal Upgrade (pSignals) — 3
      { projectId: pSignals.id, name: "Signal Audit & Design Freeze", effortDays: 30, progress: 100, status: "approved", approvedAt: new Date("2024-04-30"), approvedById: SYS, dueDate: "2024-04-30", description: "Complete audit of 2,400 signal locations and freeze the design specification." },
      { projectId: pSignals.id, name: "Batch 1 Installation (800 signals)", effortDays: 90, progress: 100, status: "approved", approvedAt: new Date("2024-11-30"), approvedById: SYS, dueDate: "2024-11-30", description: "Install and commission first 800 AI-adaptive signals." },
      { projectId: pSignals.id, name: "Batch 2 Installation (800 signals)", effortDays: 90, progress: 72, status: "in_progress", dueDate: "2025-06-30", description: "Install and commission second batch of 800 signals." },
      { projectId: pSignals.id, name: "Batch 3 Installation (800 signals)", effortDays: 90, progress: 0, status: "pending", dueDate: "2025-12-31", description: "Install and commission final 800 signals." },
      { projectId: pSignals.id, name: "System Integration & Go-Live", effortDays: 45, progress: 0, status: "pending", dueDate: "2026-01-31", description: "Full system integration with TMC and performance validation." },

      // IoT Sensors (pIot) — 3
      { projectId: pIot.id, name: "Sensor Technology Procurement", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2024-05-31"), approvedById: SYS, dueDate: "2024-05-31", description: "Award contract and procure 12,000 IoT traffic sensors." },
      { projectId: pIot.id, name: "Phase 1 Installation (4,000 sensors)", effortDays: 75, progress: 100, status: "submitted", submittedAt: new Date("2024-12-15"), dueDate: "2024-12-31", description: "Install first 4,000 sensors on primary arterial roads." },
      { projectId: pIot.id, name: "Phase 2 Installation (8,000 sensors)", effortDays: 75, progress: 38, status: "in_progress", dueDate: "2025-09-30", description: "Install remaining 8,000 sensors on secondary roads." },
      { projectId: pIot.id, name: "Data Platform Integration", effortDays: 30, progress: 0, status: "pending", dueDate: "2025-12-31", description: "Connect all sensor data feeds to the central analytics platform." },

      // Traffic Management Centre (pTmc) — 3
      { projectId: pTmc.id, name: "Facility & Infrastructure Design", effortDays: 60, progress: 100, status: "approved", approvedAt: new Date("2024-09-30"), approvedById: SYS, dueDate: "2024-09-30", description: "Complete architectural and technical design for the TMC facility." },
      { projectId: pTmc.id, name: "Construction & Fit-Out", effortDays: 120, progress: 65, status: "in_progress", dueDate: "2025-09-30", description: "Complete construction and equipment fit-out of the TMC." },
      { projectId: pTmc.id, name: "Systems Integration & Staff Training", effortDays: 45, progress: 0, status: "pending", dueDate: "2026-06-30", description: "Integrate all traffic systems and train 120 operators." },
      { projectId: pTmc.id, name: "Operational Acceptance", effortDays: 30, progress: 0, status: "pending", dueDate: "2026-12-31", description: "Formal acceptance testing and 24/7 operations handover." },

      // Government Data Lake (pDataLake) — 3
      { projectId: pDataLake.id, name: "Architecture Design & Cloud Provisioning", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2024-09-30"), approvedById: SYS, dueDate: "2024-09-30", description: "Design data lake architecture and provision cloud infrastructure." },
      { projectId: pDataLake.id, name: "Phase 1 Ingestion (12 entities)", effortDays: 75, progress: 100, status: "submitted", submittedAt: new Date("2025-01-15"), dueDate: "2025-01-31", description: "Connect and ingest data from first 12 government entities." },
      { projectId: pDataLake.id, name: "Phase 2 Ingestion (20 entities)", effortDays: 75, progress: 45, status: "in_progress", dueDate: "2025-09-30", description: "Connect remaining 20 entities and validate data quality." },
      { projectId: pDataLake.id, name: "Data Catalogue & Governance Framework", effortDays: 30, progress: 0, status: "pending", dueDate: "2026-06-30", description: "Publish data catalogue and implement data governance policies." },

      // BI Dashboard Platform (pBiPlatform) — 3
      { projectId: pBiPlatform.id, name: "Platform Selection & Licensing", effortDays: 30, progress: 100, status: "approved", approvedAt: new Date("2024-11-30"), approvedById: SYS, dueDate: "2024-11-30", description: "Select BI platform vendor and negotiate enterprise licensing." },
      { projectId: pBiPlatform.id, name: "Core Dashboards Development", effortDays: 75, progress: 55, status: "in_progress", dueDate: "2025-09-30", description: "Build executive and operational dashboards for 15 ministries." },
      { projectId: pBiPlatform.id, name: "Self-Service Analytics Rollout", effortDays: 45, progress: 0, status: "pending", dueDate: "2026-06-30", description: "Enable self-service analytics for 2,000 analysts across government." },

      // Finance Module (pFinance) — 3
      { projectId: pFinance.id, name: "System Design & Configuration", effortDays: 60, progress: 100, status: "approved", approvedAt: new Date("2024-06-30"), approvedById: SYS, dueDate: "2024-06-30", description: "Complete system configuration and parallel run planning." },
      { projectId: pFinance.id, name: "Data Migration & UAT", effortDays: 90, progress: 100, status: "submitted", submittedAt: new Date("2024-12-20"), dueDate: "2024-12-31", description: "Migrate 8 years of financial data and complete user acceptance testing." },
      { projectId: pFinance.id, name: "Go-Live & Stabilisation", effortDays: 60, progress: 82, status: "in_progress", dueDate: "2025-09-30", description: "Go-live with all financial modules and complete hypercare period." },
      { projectId: pFinance.id, name: "Advanced Reporting & Analytics", effortDays: 45, progress: 15, status: "in_progress", dueDate: "2025-12-31", description: "Implement advanced financial reporting and predictive analytics." },

      // HR & Payroll (pHr) — 3
      { projectId: pHr.id, name: "HR Requirements & Configuration", effortDays: 60, progress: 100, status: "approved", approvedAt: new Date("2024-10-31"), approvedById: SYS, dueDate: "2024-10-31", description: "Document HR processes and complete system configuration for 45,000 employees." },
      { projectId: pHr.id, name: "Employee Data Migration", effortDays: 45, progress: 68, status: "in_progress", dueDate: "2025-06-30", description: "Migrate all employee records, leave history, and payroll data." },
      { projectId: pHr.id, name: "Payroll Parallel Run & Go-Live", effortDays: 60, progress: 0, status: "pending", dueDate: "2026-03-31", description: "Run payroll in parallel for 3 months then go-live." },

      // Procurement Module (pProcMod) — 3
      { projectId: pProcMod.id, name: "Process Design & Vendor Registration", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2025-01-31"), approvedById: SYS, dueDate: "2025-01-31", description: "Design e-procurement processes and migrate 3,200 supplier records." },
      { projectId: pProcMod.id, name: "E-Tendering Module Go-Live", effortDays: 75, progress: 30, status: "in_progress", dueDate: "2025-12-31", description: "Launch electronic tendering for all procurement above SAR 100,000." },
      { projectId: pProcMod.id, name: "Contract Management Integration", effortDays: 45, progress: 0, status: "pending", dueDate: "2026-09-30", description: "Integrate contract lifecycle management with finance and HR systems." },

      // Portal UX (pPortalUx) — 3
      { projectId: pPortalUx.id, name: "UX Research & Design System", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2024-05-31"), approvedById: SYS, dueDate: "2024-05-31", description: "Complete user research with 5,000 citizens and publish the national design system." },
      { projectId: pPortalUx.id, name: "Core Services Migration (100 services)", effortDays: 90, progress: 100, status: "submitted", submittedAt: new Date("2024-12-10"), dueDate: "2024-12-31", description: "Migrate 100 priority government services to the new portal." },
      { projectId: pPortalUx.id, name: "Remaining Services & AI Self-Service", effortDays: 90, progress: 48, status: "in_progress", dueDate: "2025-12-31", description: "Migrate remaining 100+ services and launch AI chatbot." },

      // Mobile App (pMobileApp) — 3
      { projectId: pMobileApp.id, name: "App Architecture & Design", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2024-08-31"), approvedById: SYS, dueDate: "2024-08-31", description: "Complete app architecture, UI/UX design, and security framework." },
      { projectId: pMobileApp.id, name: "Beta Launch & User Testing", effortDays: 60, progress: 75, status: "in_progress", dueDate: "2025-06-30", description: "Release beta app with 50 services to 100,000 pilot users." },
      { projectId: pMobileApp.id, name: "Full Production Launch", effortDays: 45, progress: 0, status: "pending", dueDate: "2026-03-31", description: "Full production launch with all services and marketing campaign." },

      // EV Fleet (pEvFleet) — 3
      { projectId: pEvFleet.id, name: "Fleet Assessment & Procurement Framework", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2024-04-30"), approvedById: SYS, dueDate: "2024-04-30", description: "Assess current fleet and establish EV procurement framework and standards." },
      { projectId: pEvFleet.id, name: "Phase 1 Delivery (2,500 EVs)", effortDays: 90, progress: 100, status: "submitted", submittedAt: new Date("2024-12-31"), dueDate: "2024-12-31", description: "Deliver and register first 2,500 electric vehicles to priority ministries." },
      { projectId: pEvFleet.id, name: "Phase 2 Delivery (3,000 EVs)", effortDays: 90, progress: 55, status: "in_progress", dueDate: "2025-12-31", description: "Deliver second batch of 3,000 EVs to remaining agencies." },
      { projectId: pEvFleet.id, name: "Phase 3 Delivery (3,000 EVs)", effortDays: 90, progress: 0, status: "pending", dueDate: "2027-06-30", description: "Final delivery completing 100% fleet electrification." },

      // Charging Infrastructure (pCharging) — 3
      { projectId: pCharging.id, name: "Site Survey & Design", effortDays: 30, progress: 100, status: "approved", approvedAt: new Date("2024-06-30"), approvedById: SYS, dueDate: "2024-06-30", description: "Survey all 300 government facility sites and complete charging station design." },
      { projectId: pCharging.id, name: "Phase 1 Installation (400 stations)", effortDays: 75, progress: 78, status: "in_progress", dueDate: "2025-06-30", description: "Install first 400 charging stations at priority government locations." },
      { projectId: pCharging.id, name: "Phase 2 Installation (800 stations)", effortDays: 75, progress: 0, status: "pending", dueDate: "2026-12-31", description: "Complete installation of remaining 800 stations." },
      { projectId: pCharging.id, name: "Smart Grid Integration", effortDays: 30, progress: 0, status: "pending", dueDate: "2027-06-30", description: "Integrate all stations with smart grid for demand management." },

      // AI Speed Cameras (pCameras) — 2
      { projectId: pCameras.id, name: "Camera Procurement & Site Preparation", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2024-09-30"), approvedById: SYS, dueDate: "2024-09-30", description: "Procure 800 AI cameras and prepare installation sites." },
      { projectId: pCameras.id, name: "Installation & Live Enforcement", effortDays: 90, progress: 50, status: "in_progress", dueDate: "2025-09-30", description: "Install all cameras and activate automated penalty issuance." },
      { projectId: pCameras.id, name: "AI Behaviour Analytics Integration", effortDays: 45, progress: 0, status: "pending", dueDate: "2026-06-30", description: "Enable AI-based distracted driving and seatbelt detection." },

      // Road Engineering (pRoadEng) — 2
      { projectId: pRoadEng.id, name: "Black Spot Assessment & Design", effortDays: 45, progress: 100, status: "approved", approvedAt: new Date("2024-12-31"), approvedById: SYS, dueDate: "2024-12-31", description: "Assess 450 black spots and produce engineering improvement designs." },
      { projectId: pRoadEng.id, name: "Phase 1 Improvements (200 sites)", effortDays: 90, progress: 20, status: "in_progress", dueDate: "2025-12-31", description: "Complete road engineering improvements at first 200 black spot sites." },
      { projectId: pRoadEng.id, name: "Phase 2 Improvements (250 sites)", effortDays: 90, progress: 0, status: "pending", dueDate: "2026-12-31", description: "Complete remaining 250 black spot improvements." },
    ])
    .returning();

  // ─────────────────────────────────────────────────────────────
  // Evidence (for submitted/approved milestones)
  // ─────────────────────────────────────────────────────────────
  const evidenceMilestones = milestones.filter(
    (m) => m.status === "approved" || m.status === "submitted"
  );

  for (const m of evidenceMilestones) {
    await db.insert(spmoEvidenceTable).values([
      {
        milestoneId: m.id,
        fileName: `completion-report-${m.id}.pdf`,
        contentType: "application/pdf",
        objectPath: `spmo/evidence/milestone-${m.id}/completion-report.pdf`,
        uploadedById: SYS,
        uploadedByName: "Programme Management Office",
        description: "Milestone completion report with supporting documentation",
        aiValidated: true,
        aiScore: 82 + Math.floor(Math.random() * 15),
        aiReasoning: "Evidence demonstrates clear milestone completion with comprehensive supporting documentation and sign-offs.",
      },
      {
        milestoneId: m.id,
        fileName: `photo-evidence-${m.id}.zip`,
        contentType: "application/zip",
        objectPath: `spmo/evidence/milestone-${m.id}/photos.zip`,
        uploadedById: SYS,
        uploadedByName: "Programme Management Office",
        description: "Photo evidence and field verification package",
        aiValidated: true,
        aiScore: 76 + Math.floor(Math.random() * 16),
        aiReasoning: "Photo documentation provided with appropriate metadata and timestamps verifying field completion.",
      },
    ]);
  }

  // ─────────────────────────────────────────────────────────────
  // Strategic KPIs (4, linked to pillars)
  // ─────────────────────────────────────────────────────────────
  await db.insert(spmoKpisTable).values([
    {
      type: "strategic",
      pillarId: p1.id,
      name: "Digital Service Adoption Rate",
      description: "Percentage of eligible government transactions conducted digitally.",
      unit: "%",
      baseline: 38,
      target: 90,
      actual: 64,
      status: "on_track",
    },
    {
      type: "strategic",
      pillarId: p2.id,
      name: "Process Automation Coverage",
      description: "Percentage of government administrative processes that are fully automated.",
      unit: "%",
      baseline: 12,
      target: 60,
      actual: 31,
      status: "at_risk",
    },
    {
      type: "strategic",
      pillarId: p3.id,
      name: "Citizen Satisfaction Index",
      description: "Composite citizen satisfaction score across all government digital services (0–100).",
      unit: "score",
      baseline: 61,
      target: 88,
      actual: 74,
      status: "on_track",
    },
    {
      type: "strategic",
      pillarId: p4.id,
      name: "Government Carbon Footprint Reduction",
      description: "Percentage reduction in government operations carbon emissions vs 2023 baseline.",
      unit: "%",
      baseline: 0,
      target: 40,
      actual: 18,
      status: "on_track",
    },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Operational KPIs (8, linked to projects)
  // ─────────────────────────────────────────────────────────────
  await db.insert(spmoKpisTable).values([
    {
      type: "operational",
      projectId: pSignals.id,
      name: "AI Signals Commissioned",
      description: "Number of AI-adaptive traffic signals installed and operational.",
      unit: "signals",
      baseline: 0,
      target: 2400,
      actual: 1600,
      status: "on_track",
    },
    {
      type: "operational",
      projectId: pIot.id,
      name: "IoT Sensors Live",
      description: "Number of active traffic IoT sensors transmitting real-time data.",
      unit: "sensors",
      baseline: 0,
      target: 12000,
      actual: 4800,
      status: "at_risk",
    },
    {
      type: "operational",
      projectId: pFinance.id,
      name: "Finance Module Entities Live",
      description: "Number of government entities fully live on the new finance system.",
      unit: "entities",
      baseline: 0,
      target: 28,
      actual: 19,
      status: "on_track",
    },
    {
      type: "operational",
      projectId: pPortalUx.id,
      name: "Services Migrated to New Portal",
      description: "Number of government services live on the redesigned citizen portal.",
      unit: "services",
      baseline: 0,
      target: 200,
      actual: 112,
      status: "on_track",
    },
    {
      type: "operational",
      projectId: pMobileApp.id,
      name: "Mobile App Active Users",
      description: "Monthly active users on the National Government Mobile App.",
      unit: "users",
      baseline: 0,
      target: 2000000,
      actual: 385000,
      status: "off_track",
    },
    {
      type: "operational",
      projectId: pEvFleet.id,
      name: "EVs Delivered & Registered",
      description: "Electric vehicles delivered, registered, and in operational service.",
      unit: "vehicles",
      baseline: 0,
      target: 8500,
      actual: 3950,
      status: "on_track",
    },
    {
      type: "operational",
      projectId: pCameras.id,
      name: "Speed Cameras Operational",
      description: "AI speed cameras installed and issuing automated penalties.",
      unit: "cameras",
      baseline: 0,
      target: 800,
      actual: 390,
      status: "at_risk",
    },
    {
      type: "operational",
      projectId: pDataLake.id,
      name: "Government Entities Connected",
      description: "Entities with live data feeds flowing into the Government Data Lake.",
      unit: "entities",
      baseline: 0,
      target: 32,
      actual: 14,
      status: "on_track",
    },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Risks (4) + Mitigations (4)
  // ─────────────────────────────────────────────────────────────
  const risks = await db
    .insert(spmoRisksTable)
    .values([
      {
        projectId: pEvFleet.id,
        title: "EV Supply Chain Delays",
        description: "Global EV battery supply chain constraints may delay Phase 2 and 3 vehicle deliveries by 6–9 months.",
        category: "operational",
        probability: "high",
        impact: "high",
        riskScore: 9,
        owner: "Sultan Al-Anzi",
        status: "open",
      },
      {
        projectId: pHr.id,
        title: "ERP Payroll Parallel Run Failure",
        description: "Payroll data migration errors could result in incorrect salary payments for 45,000 employees.",
        category: "technical",
        probability: "medium",
        impact: "critical",
        riskScore: 8,
        owner: "Saleh Al-Mutairi",
        status: "open",
      },
      {
        projectId: pPortalUx.id,
        title: "Cybersecurity Breach on Citizen Portal",
        description: "The high-profile citizen portal is a target for nation-state and criminal hackers; a breach would damage public trust.",
        category: "technical",
        probability: "low",
        impact: "critical",
        riskScore: 4,
        owner: "Amal Al-Rashidi",
        status: "open",
      },
      {
        projectId: pCharging.id,
        title: "Grid Capacity Constraint for EV Charging",
        description: "Utility grid upgrades may not be completed in time to support the full charging station network load.",
        category: "regulatory",
        probability: "medium",
        impact: "medium",
        riskScore: 4,
        owner: "Noura Al-Subaie",
        status: "mitigated",
      },
    ])
    .returning();

  await db.insert(spmoMitigationsTable).values([
    {
      riskId: risks[0].id,
      description: "Diversify EV suppliers — add two additional OEM partners to the approved vendor list.",
      dueDate: "2025-06-30",
      status: "in_progress",
    },
    {
      riskId: risks[0].id,
      description: "Pre-order Phase 3 vehicles 12 months earlier to buffer against lead time increases.",
      dueDate: "2025-09-30",
      status: "planned",
    },
    {
      riskId: risks[1].id,
      description: "Engage specialist payroll testing firm for 3-month dedicated parallel run validation.",
      dueDate: "2025-10-31",
      status: "in_progress",
    },
    {
      riskId: risks[3].id,
      description: "Coordinate with national utility to fast-track grid upgrades at 50 priority locations.",
      dueDate: "2025-05-31",
      status: "completed",
    },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Budget Entries
  // ─────────────────────────────────────────────────────────────
  await db.insert(spmoBudgetTable).values([
    // Digital Excellence
    { projectId: pSignals.id, pillarId: p1.id, period: "2025-Q1", allocated: 45000000, spent: 41000000, currency: "SAR", category: "technology", description: "Batch 2 signal hardware procurement" },
    { projectId: pIot.id, pillarId: p1.id, period: "2025-Q1", allocated: 38000000, spent: 31500000, currency: "SAR", category: "technology", description: "IoT sensor installation Phase 2" },
    { projectId: pDataLake.id, pillarId: p1.id, period: "2025-Q1", allocated: 18000000, spent: 14200000, currency: "SAR", category: "technology", description: "Data lake cloud infrastructure" },
    { projectId: pBiPlatform.id, pillarId: p1.id, period: "2025-Q1", allocated: 12000000, spent: 9800000, currency: "SAR", category: "technology", description: "BI platform development" },

    // Operational Efficiency
    { projectId: pFinance.id, pillarId: p2.id, period: "2025-Q1", allocated: 42000000, spent: 38900000, currency: "SAR", category: "technology", description: "Finance module go-live support" },
    { projectId: pHr.id, pillarId: p2.id, period: "2025-Q1", allocated: 28000000, spent: 19600000, currency: "SAR", category: "technology", description: "HR data migration and configuration" },
    { projectId: pProcMod.id, pillarId: p2.id, period: "2025-Q1", allocated: 18000000, spent: 9900000, currency: "SAR", category: "technology", description: "E-tendering module development" },

    // Customer Experience
    { projectId: pPortalUx.id, pillarId: p3.id, period: "2025-Q1", allocated: 35000000, spent: 32200000, currency: "SAR", category: "technology", description: "Portal services migration batch 2" },
    { projectId: pMobileApp.id, pillarId: p3.id, period: "2025-Q1", allocated: 22000000, spent: 14300000, currency: "SAR", category: "technology", description: "Mobile app beta development" },

    // Sustainability
    { projectId: pEvFleet.id, pillarId: p4.id, period: "2025-Q1", allocated: 120000000, spent: 109200000, currency: "SAR", category: "equipment", description: "Phase 2 EV fleet delivery" },
    { projectId: pCharging.id, pillarId: p4.id, period: "2025-Q1", allocated: 32000000, spent: 27200000, currency: "SAR", category: "construction", description: "Charging station Phase 1 installation" },
    { projectId: pCameras.id, pillarId: p4.id, period: "2025-Q1", allocated: 25000000, spent: 20500000, currency: "SAR", category: "equipment", description: "AI speed camera installation" },
    { projectId: pRoadEng.id, pillarId: p4.id, period: "2025-Q1", allocated: 18000000, spent: 11700000, currency: "SAR", category: "construction", description: "Black spot Phase 1 engineering works" },

    // Q2 entries
    { projectId: pSignals.id, pillarId: p1.id, period: "2025-Q2", allocated: 50000000, spent: 0, currency: "SAR", category: "technology", description: "Batch 2 signal installation completion" },
    { projectId: pEvFleet.id, pillarId: p4.id, period: "2025-Q2", allocated: 85000000, spent: 0, currency: "SAR", category: "equipment", description: "Phase 2 EV fleet continuation" },
    { projectId: pFinance.id, pillarId: p2.id, period: "2025-Q2", allocated: 18000000, spent: 0, currency: "SAR", category: "technology", description: "Advanced reporting implementation" },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Procurement Records
  // ─────────────────────────────────────────────────────────────
  await db.insert(spmoProcurementTable).values([
    {
      projectId: pSignals.id,
      title: "AI Traffic Signal Hardware & Software — Phase 2",
      stage: "awarded",
      vendor: "Siemens Mobility Arabia",
      contractValue: 155000000,
      currency: "SAR",
      notes: "Contract awarded after competitive tender. Includes 5-year maintenance SLA.",
      awardDate: "2024-11-15",
      completionDate: "2025-06-30",
    },
    {
      projectId: pEvFleet.id,
      title: "Phase 2 Electric Vehicle Fleet Supply",
      stage: "evaluation",
      vendor: null,
      contractValue: null,
      currency: "SAR",
      notes: "RFP issued to 4 shortlisted OEMs. Technical evaluation in progress.",
      awardDate: null,
      completionDate: null,
    },
    {
      projectId: pFinance.id,
      title: "ERP Finance System Integration Consultancy",
      stage: "completed",
      vendor: "Deloitte Middle East",
      contractValue: 42000000,
      currency: "SAR",
      notes: "All integration deliverables accepted. Project formally closed.",
      awardDate: "2024-03-01",
      completionDate: "2024-12-31",
    },
    {
      projectId: pCharging.id,
      title: "EV Charging Station Installation — Phase 1",
      stage: "awarded",
      vendor: "ABB Electrification KSA",
      contractValue: 68000000,
      currency: "SAR",
      notes: "Turnkey contract covering supply, installation, and 3-year operations.",
      awardDate: "2024-07-01",
      completionDate: "2025-06-30",
    },
    {
      projectId: pIot.id,
      title: "IoT Traffic Sensor Supply & Installation",
      stage: "rfp_issued",
      vendor: null,
      contractValue: null,
      currency: "SAR",
      notes: "RFP issued for Phase 2 sensors (8,000 units). Proposals due 2025-04-30.",
      awardDate: null,
      completionDate: null,
    },
    {
      projectId: pPortalUx.id,
      title: "Citizen Portal Development & Delivery Partner",
      stage: "completed",
      vendor: "Accenture Arabia",
      contractValue: 88000000,
      currency: "SAR",
      notes: "Phase 1 portal migration complete. Phase 2 extension under negotiation.",
      awardDate: "2024-01-15",
      completionDate: "2024-12-31",
    },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Activity Log
  // ─────────────────────────────────────────────────────────────
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  const submittedMilestones = milestones.filter((m) => m.status === "submitted");
  const recentApprovedMilestones = milestones.filter((m) => m.status === "approved").slice(-3);

  await db.insert(spmoActivityLogTable).values([
    ...(submittedMilestones[0] ? [{
      actorId: SYS,
      actorName: "Programme Management Office",
      action: "submitted" as const,
      entityType: "milestone",
      entityId: submittedMilestones[0].id,
      entityName: submittedMilestones[0].name,
      details: {},
      createdAt: ago(1),
    }] : []),
    ...(submittedMilestones[1] ? [{
      actorId: SYS,
      actorName: "Programme Management Office",
      action: "submitted" as const,
      entityType: "milestone",
      entityId: submittedMilestones[1].id,
      entityName: submittedMilestones[1].name,
      details: {},
      createdAt: ago(2),
    }] : []),
    ...(recentApprovedMilestones[0] ? [{
      actorId: SYS,
      actorName: "Ahmed Al-Rashid",
      action: "approved" as const,
      entityType: "milestone",
      entityId: recentApprovedMilestones[0].id,
      entityName: recentApprovedMilestones[0].name,
      details: {},
      createdAt: ago(3),
    }] : []),
    {
      actorId: SYS,
      actorName: "Fatima Al-Harbi",
      action: "updated" as const,
      entityType: "initiative",
      entityId: iErp.id,
      entityName: iErp.name,
      details: { field: "status", newValue: "active" },
      createdAt: ago(4),
    },
    {
      actorId: SYS,
      actorName: "System Administrator",
      action: "created" as const,
      entityType: "risk",
      entityId: risks[0].id,
      entityName: risks[0].title,
      details: {},
      createdAt: ago(5),
    },
    {
      actorId: SYS,
      actorName: "Khalid Al-Zahrani",
      action: "uploaded_evidence" as const,
      entityType: "milestone",
      entityId: milestones[0].id,
      entityName: milestones[0].name,
      details: { fileCount: 2 },
      createdAt: ago(6),
    },
    {
      actorId: SYS,
      actorName: "Omar Al-Sheikh",
      action: "ran_ai_assessment" as const,
      entityType: "programme",
      entityId: 0,
      entityName: "National Transformation Programme",
      details: { overallHealth: "good" },
      createdAt: ago(7),
    },
    {
      actorId: SYS,
      actorName: "Sara Al-Mutairi",
      action: "created" as const,
      entityType: "project",
      entityId: pMobileApp.id,
      entityName: pMobileApp.name,
      details: {},
      createdAt: ago(8),
    },
  ]);

  console.log("Seed complete.");
  console.log(`  4 pillars, 6 initiatives, 14 projects, ${milestones.length} milestones`);
  console.log(`  ${evidenceMilestones.length} milestones with evidence attached`);
  console.log("  4 strategic KPIs, 8 operational KPIs");
  console.log("  4 risks, 4 mitigations");
  console.log("  6 procurement records");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
