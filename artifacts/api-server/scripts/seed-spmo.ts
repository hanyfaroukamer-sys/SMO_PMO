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
  spmoActivityLogTable,
} from "@workspace/db";

const SYSTEM_USER_ID = "seed-system";

async function seed() {
  console.log("Seeding SPMO data...");

  // ─────────────────────────────────────────────────────────────
  // Pillars
  // ─────────────────────────────────────────────────────────────
  const [digitalPillar, economicPillar, socialPillar, infraPillar] =
    await db
      .insert(spmoPillarsTable)
      .values([
        { name: "Digital Transformation", description: "Modernise government services through digital technology and data-driven decision making.", weight: 30, color: "#6366f1", iconName: "Monitor", sortOrder: 1 },
        { name: "Economic Development", description: "Foster inclusive economic growth, entrepreneurship, and employment across all regions.", weight: 25, color: "#f59e0b", iconName: "TrendingUp", sortOrder: 2 },
        { name: "Social Welfare & Inclusion", description: "Strengthen social protection systems and promote equitable access to public services.", weight: 25, color: "#10b981", iconName: "Heart", sortOrder: 3 },
        { name: "Infrastructure & Resilience", description: "Build and maintain modern, climate-resilient infrastructure for sustainable development.", weight: 20, color: "#3b82f6", iconName: "Building2", sortOrder: 4 },
      ])
      .returning();

  // ─────────────────────────────────────────────────────────────
  // Initiatives
  // ─────────────────────────────────────────────────────────────
  const [eGovInit, dataInit, openGovInit] = await db
    .insert(spmoInitiativesTable)
    .values([
      { pillarId: digitalPillar.id, name: "e-Government Services Portal", description: "Unified citizen portal for all government digital services with single sign-on.", ownerId: SYSTEM_USER_ID, ownerName: "Sarah Al-Rashid", weight: 40, status: "active", startDate: "2025-01-01", targetDate: "2026-06-30", sortOrder: 1 },
      { pillarId: digitalPillar.id, name: "National Data Platform", description: "Centralised open data platform enabling cross-ministry data sharing and analytics.", ownerId: SYSTEM_USER_ID, ownerName: "Ahmed Khalil", weight: 35, status: "active", startDate: "2025-03-01", targetDate: "2026-12-31", sortOrder: 2 },
      { pillarId: digitalPillar.id, name: "Open Government Partnership", description: "Transparency and accountability initiative under the OGP framework.", ownerId: SYSTEM_USER_ID, ownerName: "Nour Hassan", weight: 25, status: "active", startDate: "2025-06-01", targetDate: "2026-12-31", sortOrder: 3 },
    ])
    .returning();

  const [smeInit, tradeInit] = await db
    .insert(spmoInitiativesTable)
    .values([
      { pillarId: economicPillar.id, name: "SME Development Programme", description: "Accelerate SME growth through financing, mentorship, and market access support.", ownerId: SYSTEM_USER_ID, ownerName: "Khalid Mansour", weight: 55, status: "active", startDate: "2025-01-15", targetDate: "2026-12-31", sortOrder: 1 },
      { pillarId: economicPillar.id, name: "Export Facilitation Initiative", description: "Streamline export procedures and expand access to international markets.", ownerId: SYSTEM_USER_ID, ownerName: "Fatima Al-Zahra", weight: 45, status: "active", startDate: "2025-04-01", targetDate: "2026-09-30", sortOrder: 2 },
    ])
    .returning();

  const [healthInit, edInit] = await db
    .insert(spmoInitiativesTable)
    .values([
      { pillarId: socialPillar.id, name: "Universal Health Coverage", description: "Expand healthcare access to underserved communities through mobile clinics and telemedicine.", ownerId: SYSTEM_USER_ID, ownerName: "Dr. Laila Hussain", weight: 60, status: "active", startDate: "2025-01-01", targetDate: "2026-12-31", sortOrder: 1 },
      { pillarId: socialPillar.id, name: "Education Equity Programme", description: "Bridge the education gap through targeted scholarships and digital learning tools.", ownerId: SYSTEM_USER_ID, ownerName: "Omar Farouk", weight: 40, status: "active", startDate: "2025-02-01", targetDate: "2026-11-30", sortOrder: 2 },
    ])
    .returning();

  const [roadInit] = await db
    .insert(spmoInitiativesTable)
    .values([
      { pillarId: infraPillar.id, name: "Rural Connectivity Programme", description: "Upgrade road networks and broadband connectivity in rural and remote regions.", ownerId: SYSTEM_USER_ID, ownerName: "Eng. Hassan Nour", weight: 100, status: "active", startDate: "2025-01-01", targetDate: "2027-06-30", sortOrder: 1 },
    ])
    .returning();

  // ─────────────────────────────────────────────────────────────
  // Projects
  // ─────────────────────────────────────────────────────────────
  const projects = await db
    .insert(spmoProjectsTable)
    .values([
      // e-Gov
      { initiativeId: eGovInit.id, name: "Citizen Identity Module", description: "Single digital identity system with biometric authentication.", ownerId: SYSTEM_USER_ID, ownerName: "Rania Ibrahim", weight: 50, status: "active", budget: 2500000, startDate: "2025-01-01", targetDate: "2025-12-31" },
      { initiativeId: eGovInit.id, name: "Payment Gateway Integration", description: "Secure, unified payment system for all government service fees.", ownerId: SYSTEM_USER_ID, ownerName: "Youssef Malik", weight: 50, status: "active", budget: 1800000, startDate: "2025-03-01", targetDate: "2025-11-30" },
      // Data Platform
      { initiativeId: dataInit.id, name: "Ministry Data Connectors", description: "API integrations connecting all 15 ministries to the central data platform.", ownerId: SYSTEM_USER_ID, ownerName: "Dina Khoury", weight: 60, status: "active", budget: 3200000, startDate: "2025-03-01", targetDate: "2026-03-31" },
      { initiativeId: dataInit.id, name: "Data Analytics Dashboard", description: "Real-time executive dashboard for programme and KPI monitoring.", ownerId: SYSTEM_USER_ID, ownerName: "Kareem Salah", weight: 40, status: "active", budget: 900000, startDate: "2025-06-01", targetDate: "2026-06-30" },
      // SME
      { initiativeId: smeInit.id, name: "SME Loan Guarantee Scheme", description: "Government-backed loan guarantees enabling SME access to capital.", ownerId: SYSTEM_USER_ID, ownerName: "Maha Salim", weight: 60, status: "active", budget: 15000000, startDate: "2025-02-01", targetDate: "2026-06-30" },
      { initiativeId: smeInit.id, name: "Entrepreneurship Training Hub", description: "National network of business incubators providing training and mentorship.", ownerId: SYSTEM_USER_ID, ownerName: "Bilal Qasim", weight: 40, status: "active", budget: 4200000, startDate: "2025-04-01", targetDate: "2026-12-31" },
      // Health
      { initiativeId: healthInit.id, name: "Mobile Medical Units Deployment", description: "Deploy 50 mobile clinics to underserved rural districts by end of 2025.", ownerId: SYSTEM_USER_ID, ownerName: "Dr. Samira Wahbi", weight: 55, status: "active", budget: 8500000, startDate: "2025-01-01", targetDate: "2025-10-31" },
      { initiativeId: healthInit.id, name: "Telemedicine Platform", description: "Digital health consultation platform connecting patients with specialists nationwide.", ownerId: SYSTEM_USER_ID, ownerName: "Dr. Tarek Abdel", weight: 45, status: "active", budget: 2100000, startDate: "2025-04-01", targetDate: "2026-04-30" },
      // Infrastructure
      { initiativeId: roadInit.id, name: "Northern Highway Phase I", description: "450km of upgraded highway linking northern provinces to the capital.", ownerId: SYSTEM_USER_ID, ownerName: "Eng. Walid Nassar", weight: 65, status: "active", budget: 95000000, startDate: "2025-01-01", targetDate: "2026-12-31" },
      { initiativeId: roadInit.id, name: "Rural Broadband Expansion", description: "Fibre optic and 5G rollout to 800 rural settlements.", ownerId: SYSTEM_USER_ID, ownerName: "Eng. Lina Barakat", weight: 35, status: "active", budget: 28000000, startDate: "2025-03-01", targetDate: "2027-03-31" },
    ])
    .returning();

  const [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9] = projects;

  // ─────────────────────────────────────────────────────────────
  // Milestones
  // ─────────────────────────────────────────────────────────────
  const milestones = await db
    .insert(spmoMilestonesTable)
    .values([
      // Citizen Identity Module - p0
      { projectId: p0.id, name: "Requirements & Architecture Sign-off", weight: 20, progress: 100, status: "approved", approvedAt: new Date("2025-02-15"), dueDate: "2025-02-28", approvedById: SYSTEM_USER_ID, description: "Finalise technical requirements and system architecture." },
      { projectId: p0.id, name: "Biometric Pilot (500 users)", weight: 30, progress: 100, status: "approved", approvedAt: new Date("2025-05-10"), dueDate: "2025-05-31", approvedById: SYSTEM_USER_ID, description: "Conduct biometric enrolment pilot with 500 volunteer citizens." },
      { projectId: p0.id, name: "National Rollout Phase 1 (1M users)", weight: 30, progress: 68, status: "in_progress", dueDate: "2025-09-30", description: "Roll out biometric identity to first 1 million citizens." },
      { projectId: p0.id, name: "System Audit & Security Certification", weight: 20, progress: 0, status: "not_started", dueDate: "2025-12-15", description: "Independent security audit and ISO 27001 certification." },
      // Payment Gateway - p1
      { projectId: p1.id, name: "Bank Integration Agreements", weight: 25, progress: 100, status: "approved", approvedAt: new Date("2025-04-20"), dueDate: "2025-04-30", approvedById: SYSTEM_USER_ID, description: "Signed MoUs with all 12 partner banks." },
      { projectId: p1.id, name: "Payment API Development", weight: 35, progress: 100, status: "submitted", submittedAt: new Date("2025-07-01"), dueDate: "2025-07-15", description: "Complete development of the unified payment REST API." },
      { projectId: p1.id, name: "UAT & Load Testing", weight: 25, progress: 30, status: "in_progress", dueDate: "2025-09-30", description: "User acceptance testing and load testing (10K TPS)." },
      { projectId: p1.id, name: "Production Go-Live", weight: 15, progress: 0, status: "not_started", dueDate: "2025-11-15", description: "Go-live with all government service fee collections." },
      // Ministry Data Connectors - p2
      { projectId: p2.id, name: "API Standards Framework Published", weight: 20, progress: 100, status: "approved", approvedAt: new Date("2025-04-30"), dueDate: "2025-04-30", approvedById: SYSTEM_USER_ID, description: "Publish open API standards for all ministries." },
      { projectId: p2.id, name: "First 5 Ministries Connected", weight: 35, progress: 100, status: "submitted", submittedAt: new Date("2025-07-10"), dueDate: "2025-07-31", description: "Live API integrations for Finance, Health, Education, Interior, Justice." },
      { projectId: p2.id, name: "Remaining 10 Ministries Connected", weight: 45, progress: 40, status: "in_progress", dueDate: "2026-01-31", description: "Complete integration for remaining ministries." },
      // SME Loan Guarantee - p4
      { projectId: p4.id, name: "Programme Framework & Legal Gazette", weight: 15, progress: 100, status: "approved", approvedAt: new Date("2025-03-15"), dueDate: "2025-03-31", approvedById: SYSTEM_USER_ID, description: "Publish programme framework and gazette legal basis." },
      { projectId: p4.id, name: "Partner Bank Onboarding (8 banks)", weight: 25, progress: 100, status: "approved", approvedAt: new Date("2025-05-31"), dueDate: "2025-05-31", approvedById: SYSTEM_USER_ID, description: "8 commercial banks enrolled as lending partners." },
      { projectId: p4.id, name: "First 1,000 Loans Guaranteed", weight: 40, progress: 72, status: "in_progress", dueDate: "2025-12-31", description: "Guarantee 1,000 SME loans totalling $30M." },
      { projectId: p4.id, name: "Impact Assessment Report", weight: 20, progress: 5, status: "in_progress", dueDate: "2026-03-31", description: "Independent impact assessment of SME loan outcomes." },
      // Mobile Medical Units - p6
      { projectId: p6.id, name: "Vehicle Procurement & Equipping (50 units)", weight: 30, progress: 100, status: "approved", approvedAt: new Date("2025-03-31"), dueDate: "2025-03-31", approvedById: SYSTEM_USER_ID, description: "Procure and fully equip 50 mobile medical units." },
      { projectId: p6.id, name: "Medical Staff Recruitment & Training", weight: 30, progress: 100, status: "approved", approvedAt: new Date("2025-05-15"), dueDate: "2025-05-31", approvedById: SYSTEM_USER_ID, description: "Recruit and train 200 medical staff for mobile units." },
      { projectId: p6.id, name: "District Deployment (30 districts)", weight: 40, progress: 85, status: "submitted", submittedAt: new Date("2025-08-01"), dueDate: "2025-08-31", description: "Deploy units across 30 prioritised rural districts." },
      // Northern Highway - p8
      { projectId: p8.id, name: "Environmental & Social Impact Assessment", weight: 10, progress: 100, status: "approved", approvedAt: new Date("2025-02-28"), dueDate: "2025-02-28", approvedById: SYSTEM_USER_ID, description: "Complete ESIA with public consultation." },
      { projectId: p8.id, name: "Land Acquisition (Phase 1)", weight: 20, progress: 100, status: "submitted", submittedAt: new Date("2025-06-30"), dueDate: "2025-06-30", description: "Acquire all land parcels for Phase 1 route." },
      { projectId: p8.id, name: "Base Layer Construction (km 0–150)", weight: 35, progress: 55, status: "in_progress", dueDate: "2025-12-31", description: "Complete road base layer for first 150km stretch." },
      { projectId: p8.id, name: "Surfacing & Signage (km 0–150)", weight: 35, progress: 0, status: "not_started", dueDate: "2026-06-30", description: "Apply final surface layer and install road signage." },
    ])
    .returning();

  // ─────────────────────────────────────────────────────────────
  // Evidence (for submitted/approved milestones)
  // ─────────────────────────────────────────────────────────────
  const withEvidence = milestones.filter(m => m.status === "approved" || m.status === "submitted").slice(0, 12);
  for (const m of withEvidence) {
    await db.insert(spmoEvidenceTable).values([
      { milestoneId: m.id, fileName: `completion-report-${m.id}.pdf`, contentType: "application/pdf", objectPath: `spmo/evidence/milestone-${m.id}/completion-report.pdf`, uploadedById: SYSTEM_USER_ID, uploadedByName: "System Admin", description: "Completion and verification report", aiValidated: true, aiScore: 85 + Math.floor(Math.random() * 12), aiReasoning: "Evidence demonstrates clear completion of milestone deliverables with supporting documentation." },
      { milestoneId: m.id, fileName: `photo-evidence-${m.id}.zip`, contentType: "application/zip", objectPath: `spmo/evidence/milestone-${m.id}/photos.zip`, uploadedById: SYSTEM_USER_ID, uploadedByName: "System Admin", description: "Photo evidence package", aiValidated: true, aiScore: 78 + Math.floor(Math.random() * 15), aiReasoning: "Photo documentation provided with appropriate metadata and timestamps." },
    ]);
  }

  // ─────────────────────────────────────────────────────────────
  // KPIs
  // ─────────────────────────────────────────────────────────────
  await db.insert(spmoKpisTable).values([
    { projectId: p0.id, name: "Citizens Enrolled (Digital ID)", type: "outcome", unit: "citizens", target: 3000000, actual: 1250000, baseline: 0, status: "on_track", description: "Number of citizens with active digital identity." },
    { projectId: p4.id, name: "SME Loans Disbursed", type: "output", unit: "loans", target: 1000, actual: 720, baseline: 0, status: "on_track", description: "Number of guaranteed SME loans disbursed through partner banks." },
    { projectId: p6.id, name: "Patients Reached (Mobile Units)", type: "outcome", unit: "patients", target: 250000, actual: 198000, baseline: 0, status: "on_track", description: "Total patient consultations delivered via mobile medical units." },
    { projectId: p8.id, name: "Road Construction Progress", type: "output", unit: "km", target: 150, actual: 82, baseline: 0, status: "at_risk", description: "Kilometres of highway base layer completed." },
    { projectId: p2.id, name: "Ministry API Integrations Live", type: "output", unit: "ministries", target: 15, actual: 5, baseline: 0, status: "at_risk", description: "Number of ministries with live data platform integrations." },
    { name: "Programme Milestone Approval Rate", type: "process", unit: "%", target: 90, actual: 62, baseline: 0, status: "off_track", description: "Percentage of submitted milestones approved within 14 days." },
    { projectId: p4.id, name: "Jobs Created (SME Programme)", type: "impact", unit: "jobs", target: 5000, actual: 2840, baseline: 0, status: "on_track", description: "Estimated new jobs created by SME loan recipients." },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Risks
  // ─────────────────────────────────────────────────────────────
  const risks = await db
    .insert(spmoRisksTable)
    .values([
      { title: "Biometric Data Privacy Compliance", description: "Risk of non-compliance with new national data protection legislation affecting the citizen identity system rollout.", category: "regulatory", probability: "medium", impact: "critical", riskScore: 8, status: "open", owner: "Sarah Al-Rashid", projectId: p0.id },
      { title: "Highway Construction Cost Overrun", description: "Material and fuel cost inflation is threatening the Phase 1 budget by an estimated 12-15%.", category: "financial", probability: "high", impact: "high", riskScore: 9, status: "open", owner: "Eng. Walid Nassar", projectId: p8.id },
      { title: "Ministry API Adoption Delay", description: "Low technical capacity in several ministries is delaying API integration beyond planned schedule.", category: "operational", probability: "high", impact: "medium", riskScore: 6, status: "open", owner: "Dina Khoury", projectId: p2.id },
      { title: "SME Loan Default Rate Increase", description: "Economic slowdown may push loan default rates above 8% threshold, straining the guarantee fund.", category: "financial", probability: "medium", impact: "high", riskScore: 6, status: "mitigated", owner: "Maha Salim", projectId: p4.id },
      { title: "Mobile Clinic Supply Chain Disruption", description: "Medical supply shortages for remote districts could reduce service levels in Q4 2025.", category: "operational", probability: "low", impact: "medium", riskScore: 2, status: "closed", owner: "Dr. Samira Wahbi", projectId: p6.id },
      { title: "Cybersecurity Breach — Payment Gateway", description: "The payment gateway is a high-value target; a breach could undermine public trust in digital government services.", category: "technical", probability: "low", impact: "critical", riskScore: 4, status: "open", owner: "Youssef Malik", projectId: p1.id },
    ])
    .returning();

  await db.insert(spmoMitigationsTable).values([
    { riskId: risks[0].id, description: "Engage DPA legal counsel and update privacy impact assessment", dueDate: "2025-08-31", status: "in_progress" },
    { riskId: risks[1].id, description: "Activate 10% contingency reserve and renegotiate material contracts", dueDate: "2025-09-30", status: "in_progress" },
    { riskId: risks[1].id, description: "Conduct value engineering review of Phase 1 specifications", dueDate: "2025-08-15", status: "planned" },
    { riskId: risks[2].id, description: "Provide dedicated technical assistance teams to lagging ministries", dueDate: "2025-10-31", status: "in_progress" },
    { riskId: risks[3].id, description: "Implement enhanced credit scoring model and increase collateral requirements", dueDate: "2025-06-30", status: "completed" },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Budget Entries
  // ─────────────────────────────────────────────────────────────
  await db.insert(spmoBudgetTable).values([
    { projectId: p0.id, pillarId: digitalPillar.id, period: "2025-Q1", allocated: 500000, spent: 487000, currency: "USD", category: "technology", label: "Biometric hardware procurement" },
    { projectId: p1.id, pillarId: digitalPillar.id, period: "2025-Q1", allocated: 200000, spent: 185000, currency: "USD", category: "technology", label: "Payment platform licensing" },
    { projectId: p4.id, pillarId: economicPillar.id, period: "2025-Q1", allocated: 2000000, spent: 1850000, currency: "USD", category: "grants", label: "Q1 loan guarantees issued" },
    { projectId: p6.id, pillarId: socialPillar.id, period: "2025-Q1", allocated: 3000000, spent: 3120000, currency: "USD", category: "equipment", label: "Mobile unit procurement" },
    { projectId: p8.id, pillarId: infraPillar.id, period: "2025-Q1", allocated: 8000000, spent: 7650000, currency: "USD", category: "construction", label: "ESIA and land acquisition" },
    { projectId: p0.id, pillarId: digitalPillar.id, period: "2025-Q2", allocated: 600000, spent: 610000, currency: "USD", category: "technology", label: "System development Phase 1" },
    { projectId: p2.id, pillarId: digitalPillar.id, period: "2025-Q2", allocated: 750000, spent: 680000, currency: "USD", category: "technology", label: "API development team" },
    { projectId: p4.id, pillarId: economicPillar.id, period: "2025-Q2", allocated: 3000000, spent: 2950000, currency: "USD", category: "grants", label: "Q2 loan guarantees" },
    { projectId: p6.id, pillarId: socialPillar.id, period: "2025-Q2", allocated: 2500000, spent: 2380000, currency: "USD", category: "personnel", label: "Medical staff salaries" },
    { projectId: p8.id, pillarId: infraPillar.id, period: "2025-Q2", allocated: 12000000, spent: 11200000, currency: "USD", category: "construction", label: "Base layer construction start" },
    { projectId: p0.id, pillarId: digitalPillar.id, period: "2025-Q3", allocated: 700000, spent: 420000, currency: "USD", category: "technology", label: "National rollout Phase 1" },
    { projectId: p1.id, pillarId: digitalPillar.id, period: "2025-Q3", allocated: 500000, spent: 280000, currency: "USD", category: "technology", label: "UAT and testing" },
    { projectId: p4.id, pillarId: economicPillar.id, period: "2025-Q3", allocated: 4000000, spent: 3100000, currency: "USD", category: "grants", label: "Q3 loan guarantees" },
    { projectId: p6.id, pillarId: socialPillar.id, period: "2025-Q3", allocated: 2000000, spent: 1850000, currency: "USD", category: "operations", label: "District deployment operations" },
    { projectId: p8.id, pillarId: infraPillar.id, period: "2025-Q3", allocated: 15000000, spent: 9800000, currency: "USD", category: "construction", label: "Highway construction Q3" },
  ]);

  // ─────────────────────────────────────────────────────────────
  // Activity Log
  // ─────────────────────────────────────────────────────────────
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const mByName = (name: string) => milestones.find(m => m.name.includes(name));

  await db.insert(spmoActivityLogTable).values([
    { actorId: SYSTEM_USER_ID, actorName: "Dr. Samira Wahbi", action: "submitted", entityType: "milestone", entityId: mByName("District Deployment")?.id ?? 0, entityName: "District Deployment (30 districts)", details: {}, createdAt: ago(2) },
    { actorId: SYSTEM_USER_ID, actorName: "Dina Khoury", action: "submitted", entityType: "milestone", entityId: mByName("First 5 Ministries")?.id ?? 0, entityName: "First 5 Ministries Connected", details: {}, createdAt: ago(3) },
    { actorId: SYSTEM_USER_ID, actorName: "System Admin", action: "approved", entityType: "milestone", entityId: mByName("Medical Staff")?.id ?? 0, entityName: "Medical Staff Recruitment & Training", details: {}, createdAt: ago(5) },
    { actorId: SYSTEM_USER_ID, actorName: "Youssef Malik", action: "submitted", entityType: "milestone", entityId: mByName("Payment API")?.id ?? 0, entityName: "Payment API Development", details: {}, createdAt: ago(7) },
    { actorId: SYSTEM_USER_ID, actorName: "Walid Nassar", action: "uploaded_evidence", entityType: "milestone", entityId: mByName("Land Acquisition")?.id ?? 0, entityName: "Land Acquisition (Phase 1)", details: { fileName: "land-acquisition-report.pdf" }, createdAt: ago(8) },
    { actorId: SYSTEM_USER_ID, actorName: "Rania Ibrahim", action: "updated", entityType: "milestone", entityId: mByName("National Rollout")?.id ?? 0, entityName: "National Rollout Phase 1", details: { progress: 68 }, createdAt: ago(1) },
    { actorId: SYSTEM_USER_ID, actorName: "System Admin", action: "created", entityType: "pillar", entityId: digitalPillar.id, entityName: "Digital Transformation", details: {}, createdAt: ago(30) },
    { actorId: SYSTEM_USER_ID, actorName: "System Admin", action: "created", entityType: "pillar", entityId: economicPillar.id, entityName: "Economic Development", details: {}, createdAt: ago(30) },
  ]);

  console.log("✓ SPMO seed data complete");
  console.log(`  Pillars: 4`);
  console.log(`  Initiatives: 8`);
  console.log(`  Projects: ${projects.length}`);
  console.log(`  Milestones: ${milestones.length}`);
  console.log(`  Risks: ${risks.length}`);
  console.log(`  Budget entries: 15`);
}

seed().catch(console.error).finally(() => process.exit());
