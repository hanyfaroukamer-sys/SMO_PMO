-- =============================================================================
-- StrategyPMO — Test Data Seed Script
-- PMO Programme Management Dashboard
-- =============================================================================
-- Run against the PostgreSQL database after the main schema and base data
-- are in place.  This script is IDEMPOTENT: it truncates the target tables
-- before inserting so it is safe to re-run.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. RISKS
-- ─────────────────────────────────────────────────────────────
TRUNCATE spmo_mitigations, spmo_risks RESTART IDENTITY CASCADE;

INSERT INTO spmo_risks
  (pillar_id, project_id, title, description, probability, impact, risk_score, owner, status, category)
VALUES
  (14, 187, 'Customer journey mapping stalls due to stakeholder disagreement',
   'Conflicting priorities between operations and CX teams may delay agreement on the target state journey map.',
   'medium', 'high', 12, 'Head of Customer Experience', 'open', 'operational'),

  (15, 195, 'Road incident detection system integration failure',
   'Legacy SCADA infrastructure may be incompatible with the new real-time detection platform, causing prolonged integration delays.',
   'medium', 'critical', 16, 'Head of Technology', 'open', 'technical'),

  (15, 196, 'Supply delays for border lighting equipment',
   'Global semiconductor shortages could extend delivery timelines for smart lighting controllers by 3–6 months.',
   'high', 'high', 15, 'Head of Projects', 'open', 'procurement'),

  (16, 215, 'Dynamic pricing model regulatory non-compliance',
   'Proposed toll price variance ranges may conflict with bilateral PMO–Saudi agreement pricing caps.',
   'low', 'critical', 12, 'Head of Legal & Compliance', 'open', 'compliance'),

  (17, 228, 'Organisation restructure resistance from middle management',
   'Key department heads may resist changes to reporting lines, causing delays in the new operating model activation.',
   'medium', 'medium', 9, 'Head of HR', 'mitigated', 'organizational'),

  (18, 244, 'On-time performance incentive scheme gaming',
   'Carriers may manipulate reporting to falsely qualify for incentives without genuine improvements to punctuality.',
   'low', 'high', 8, 'Head of Operations', 'open', 'financial'),

  (19, 251, 'TMS vendor lock-in risk',
   'The selected TMS platform uses proprietary APIs making future migration costly and technically complex.',
   'medium', 'high', 12, 'Head of Technology', 'open', 'technical'),

  (19, 235, 'Cybersecurity maturity assessment scope creep',
   'Expanding audit scope mid-engagement with the third-party assessor may exceed budget and timeline.',
   'high', 'medium', 12, 'CISO', 'open', 'operational'),

  (20, 228, 'Talent retention risk during restructuring',
   'High-performing staff may accept competitor offers while the restructuring creates uncertainty about career paths.',
   'medium', 'high', 12, 'Head of HR', 'open', 'organizational'),

  (22, 223, 'Investment optimisation programme deliverable quality',
   'External consultants may deliver generic recommendations without sufficient PMO-specific context.',
   'medium', 'medium', 9, 'Head of Strategy', 'open', 'operational'),

  (14, 190, 'Customer care centralisation — data migration risk',
   'CRM data migration from regional systems to the centralised platform carries a risk of data loss or corruption.',
   'low', 'critical', 12, 'Head of IT', 'open', 'technical'),

  (15, 200, 'Maintenance yard upgrade — budget overrun',
   'Preliminary bills of quantities may be understated by 15–20% based on recent regional construction cost inflation.',
   'high', 'high', 15, 'Head of Finance', 'open', 'financial'),

  (16, 217, 'Digital payments incentivisation — low uptake',
   'If the initial cashback model is not compelling enough, adoption targets for digital toll payments may not be met.',
   'medium', 'medium', 9, 'Head of Commercial', 'open', 'strategic'),

  (18, 245, 'Pre-registration system — traveller privacy concerns',
   'Mandatory biometric data collection for the pre-registration pilot may attract negative media coverage.',
   'low', 'high', 8, 'Head of Communications', 'open', 'reputational'),

  (21, 225, 'Strategy communication plan — message misalignment',
   'Inconsistent messaging across Arabic and English channels could undermine the PMO brand narrative.',
   'medium', 'medium', 9, 'Head of Branding', 'open', 'reputational');


-- ─────────────────────────────────────────────────────────────
-- 2. MITIGATIONS
-- ─────────────────────────────────────────────────────────────
INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Run joint CX–Operations workshop series (3 sessions) to align on journey map version 1.0. Owner: Head of Customer Experience.',
       '2026-06-30', 'in_progress'
FROM spmo_risks WHERE title = 'Customer journey mapping stalls due to stakeholder disagreement';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Commission a compatibility assessment report from the TMS vendor before integration kick-off. Owner: Head of Technology.',
       '2026-05-15', 'open'
FROM spmo_risks WHERE title = 'Road incident detection system integration failure';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Dual-source lighting equipment; pre-order 20% buffer stock from an alternative EU supplier. Owner: Head of Procurement.',
       '2026-04-30', 'in_progress'
FROM spmo_risks WHERE title = 'Supply delays for border lighting equipment';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Engage legal team to map draft pricing model against bilateral agreement before Board submission. Owner: Head of Legal & Compliance.',
       '2026-05-01', 'open'
FROM spmo_risks WHERE title = 'Dynamic pricing model regulatory non-compliance';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Establish change champion network across all departments with monthly town-hall Q&A sessions. Owner: Head of HR.',
       '2026-04-01', 'completed'
FROM spmo_risks WHERE title = 'Organisation restructure resistance from middle management';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Implement dual-layer reporting validation with automated cross-check against CCTV gate timestamps. Owner: Head of Operations.',
       '2026-07-01', 'open'
FROM spmo_risks WHERE title = 'On-time performance incentive scheme gaming';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Negotiate open-API contractual clause and retain data export rights in all TMS procurement documents. Owner: Head of Technology.',
       '2026-06-01', 'open'
FROM spmo_risks WHERE title = 'TMS vendor lock-in risk';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Define scope freeze document signed by CISO and assessor before engagement start. Owner: CISO.',
       '2026-04-15', 'in_progress'
FROM spmo_risks WHERE title = 'Cybersecurity maturity assessment scope creep';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Introduce retention bonuses for critical roles and publish internal career progression map by Q2 2026. Owner: Head of HR.',
       '2026-05-31', 'open'
FROM spmo_risks WHERE title = 'Talent retention risk during restructuring';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Mandate PMO context-discovery workshops (3 days minimum) as part of the RFP evaluation criteria. Owner: Head of Strategy.',
       '2026-04-30', 'open'
FROM spmo_risks WHERE title = 'Investment optimisation programme deliverable quality';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Run parallel data migration in a staging environment with full reconciliation check before go-live. Owner: Head of IT.',
       '2026-08-15', 'open'
FROM spmo_risks WHERE title = 'Customer care centralisation — data migration risk';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Commission independent quantity surveyor review; request 15% contingency approval from Board. Owner: Head of Finance.',
       '2026-05-01', 'in_progress'
FROM spmo_risks WHERE title = 'Maintenance yard upgrade — budget overrun';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Run 6-month pilot with enhanced cashback rate in one lane; A/B test two incentive structures. Owner: Head of Commercial.',
       '2026-07-01', 'open'
FROM spmo_risks WHERE title = 'Digital payments incentivisation — low uptake';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Publish detailed privacy notice; engage PDPL legal expert to review data collection protocols. Owner: Head of Legal & Compliance.',
       '2026-05-15', 'open'
FROM spmo_risks WHERE title = 'Pre-registration system — traveller privacy concerns';

INSERT INTO spmo_mitigations (risk_id, description, due_date, status)
SELECT id, 'Establish a bilingual communications review board; define single approved message glossary. Owner: Head of Branding.',
       '2026-04-30', 'open'
FROM spmo_risks WHERE title = 'Strategy communication plan — message misalignment';


-- ─────────────────────────────────────────────────────────────
-- 3. KPI MEASUREMENTS (monthly readings for 12 selected KPIs)
-- ─────────────────────────────────────────────────────────────
TRUNCATE spmo_kpi_measurements RESTART IDENTITY;

-- KPI 1 — Frequent traveller share (target 6, actual 6.2)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (1, '2025-03-31', 5.1, 'Q1 2025 — below target, low season effect',       '56298317', 'Hany Al-Rashidi'),
  (1, '2025-06-30', 5.6, 'Q2 2025 — improving, summer traffic surge',        '56298317', 'Hany Al-Rashidi'),
  (1, '2025-09-30', 5.9, 'Q3 2025 — close to target',                        '56298317', 'Hany Al-Rashidi'),
  (1, '2025-12-31', 6.0, 'Q4 2025 — on target, holiday traffic boost',       '56298317', 'Hany Al-Rashidi'),
  (1, '2026-03-31', 6.2, 'Q1 2026 — exceeds target, loyalty programme lift', '56298317', 'Hany Al-Rashidi');

-- KPI 3 — Customer Satisfaction Index (target 90, actual 92.8)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (3, '2025-03-31', 87.5, 'Q1 2025 — below target, slow queue times flagged', '56298317', 'Hany Al-Rashidi'),
  (3, '2025-06-30', 89.2, 'Q2 2025 — near target after CX initiative launch', '56298317', 'Hany Al-Rashidi'),
  (3, '2025-09-30', 91.0, 'Q3 2025 — exceeded target, fast-lane expansion',   '56298317', 'Hany Al-Rashidi'),
  (3, '2025-12-31', 92.1, 'Q4 2025 — strong close, digital check-in effect',  '56298317', 'Hany Al-Rashidi'),
  (3, '2026-03-31', 92.8, 'Q1 2026 — all-time high, new CX team performing',  '56298317', 'Hany Al-Rashidi');

-- KPI 7 — Road network covered by automated monitoring (target 100, actual 14.8)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (7, '2025-03-31', 6.2,  'Q1 2025 — Phase 1 cameras commissioned',           '56298317', 'Hany Al-Rashidi'),
  (7, '2025-06-30', 9.5,  'Q2 2025 — southern corridor added',                '56298317', 'Hany Al-Rashidi'),
  (7, '2025-09-30', 12.1, 'Q3 2025 — northern approach cameras live',         '56298317', 'Hany Al-Rashidi'),
  (7, '2025-12-31', 13.4, 'Q4 2025 — minor delay, permit issues at node 7',   '56298317', 'Hany Al-Rashidi'),
  (7, '2026-03-31', 14.8, 'Q1 2026 — new batch of 40 cameras deployed',       '56298317', 'Hany Al-Rashidi');

-- KPI 10 — Major CapEx projects executed on time (target 92, actual 90)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (10, '2025-03-31', 85.0, 'Q1 2025 — 3 delayed projects from prior year',    '56298317', 'Hany Al-Rashidi'),
  (10, '2025-06-30', 87.5, 'Q2 2025 — recovery plan executed',                '56298317', 'Hany Al-Rashidi'),
  (10, '2025-09-30', 89.0, 'Q3 2025 — close to target',                       '56298317', 'Hany Al-Rashidi'),
  (10, '2025-12-31', 90.0, 'Q4 2025 — slight miss due to vendor delays',      '56298317', 'Hany Al-Rashidi'),
  (10, '2026-03-31', 90.0, 'Q1 2026 — stable, 2 new projects on watch list',  '56298317', 'Hany Al-Rashidi');

-- KPI 8 — Serious injuries & fatalities per 1M vehicles (target 0.3, actual 1.6)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (8, '2025-03-31', 2.1, 'Q1 2025 — 4 incidents recorded, wet season',        '56298317', 'Hany Al-Rashidi'),
  (8, '2025-06-30', 1.9, 'Q2 2025 — improved, new speed cameras active',      '56298317', 'Hany Al-Rashidi'),
  (8, '2025-09-30', 1.7, 'Q3 2025 — downward trend continuing',               '56298317', 'Hany Al-Rashidi'),
  (8, '2025-12-31', 1.6, 'Q4 2025 — iRAP works completed on 2 corridors',     '56298317', 'Hany Al-Rashidi'),
  (8, '2026-03-31', 1.6, 'Q1 2026 — plateau; Phase 2 corrective works needed','56298317', 'Hany Al-Rashidi');

-- ─────────────────────────────────────────────────────────────
-- 4. BUDGET ENTRIES
-- ─────────────────────────────────────────────────────────────
TRUNCATE spmo_budget_entries RESTART IDENTITY;

INSERT INTO spmo_budget_entries
  (project_id, pillar_id, category, description, allocated, spent, currency, period, fiscal_year, fiscal_quarter)
VALUES
  -- Project 187 — Customer journey optimisation
  (187, 14, 'capex', 'Journey mapping consulting & research tools', 3500000, 1200000, 'SAR', 'Q1-Q2 2026', 2026, 1),
  (187, 14, 'opex', 'Customer survey platform annual licence',         420000,  210000, 'SAR', 'FY 2026',    2026, 1),

  -- Project 195 — Road incident detection
  (195, 15, 'capex', 'Detection sensor hardware (Phase 1 deployment)', 18000000, 16200000, 'SAR', 'FY 2025', 2025, 1),
  (195, 15, 'capex', 'Network integration & SCADA upgrade',              5500000,  3100000, 'SAR', 'FY 2026', 2026, 1),
  (195, 15, 'opex', 'Annual maintenance & monitoring SLA',               1200000,   600000, 'SAR', 'FY 2026', 2026, 2),

  -- Project 196 — Border lighting
  (196, 15, 'capex', 'Smart LED lighting units — Phase 1',  8000000, 2500000, 'SAR', 'Q2-Q3 2026', 2026, 2),
  (196, 15, 'capex', 'Control system and cabling works',    3200000,       0, 'SAR', 'Q3 2026',    2026, 3),

  -- Project 200 — Maintenance yard upgrade
  (200, 15, 'capex', 'Civil construction — maintenance bay',         22000000, 8000000, 'SAR', 'FY 2026-2027', 2026, 1),
  (200, 15, 'capex', 'Mechanical workshop equipment',                 4500000,       0, 'SAR', 'Q3-Q4 2026',   2026, 3),
  (200, 15, 'opex', 'Project management office & site supervision',   1800000,  900000, 'SAR', 'FY 2026',      2026, 1),

  -- Project 215 — Dynamic pricing model
  (215, 16, 'opex', 'Consultancy — pricing strategy development', 2800000, 2800000, 'SAR', 'FY 2025', 2025, 1),
  (215, 16, 'capex', 'Tolling system configuration for dynamic pricing', 1500000, 0, 'SAR', 'Q2 2026', 2026, 2),

  -- Project 228 — Organisation structure revamp
  (228, 17, 'opex', 'HR transformation consultancy (12-month engagement)', 4200000, 2100000, 'SAR', 'FY 2026', 2026, 1),

  -- Project 251 — TMS Dashboard
  (251, 19, 'capex', 'TMS software licences (3-year prepaid)',    9600000, 9600000, 'SAR', 'FY 2025', 2025, 1),
  (251, 19, 'capex', 'Hardware & network infrastructure',          3800000, 3800000, 'SAR', 'FY 2025', 2025, 1),
  (251, 19, 'opex', 'Annual SaaS subscription and support',        2200000,  550000, 'SAR', 'FY 2026', 2026, 1),

  -- Project 235 — Cybersecurity maturity
  (235, 19, 'opex', 'Third-party maturity assessment fee',            850000,  425000, 'SAR', 'Q1-Q2 2026', 2026, 1),
  (235, 19, 'capex', 'Security tooling — EDR & SIEM upgrade',        3200000,  800000, 'SAR', 'FY 2026',    2026, 1),

  -- Project 245 — Pre-registration system
  (245, 18, 'capex', 'Biometric gateway hardware (24 units)',  12000000, 0, 'SAR', 'Q3-Q4 2026', 2026, 3),
  (245, 18, 'capex', 'Software development & integration',      5500000, 0, 'SAR', 'Q2-Q4 2026', 2026, 2);


-- ─────────────────────────────────────────────────────────────
-- 5. PROCUREMENT
-- ─────────────────────────────────────────────────────────────
TRUNCATE spmo_procurement RESTART IDENTITY;

INSERT INTO spmo_procurement
  (project_id, title, stage, vendor, contract_value, currency, notes, award_date, completion_date)
VALUES
  (195, 'Road Incident Detection Sensors — Supply & Install',
   'contract_awarded', 'Hikvision Arabia Ltd',
   18000000, 'SAR', 'Phase 1 — 180 sensor nodes across 4 corridors',
   '2024-09-15', '2025-11-30'),

  (195, 'SCADA Integration & Network Upgrade',
   'rfp_issued', NULL,
   5500000, 'SAR', 'RFP closed 2026-04-01; evaluation in progress',
   NULL, NULL),

  (196, 'Smart LED Border Lighting — Phase 1 Supply',
   'under_evaluation', NULL,
   8000000, 'SAR', 'Three bids received; lowest bid 20% under estimate',
   NULL, NULL),

  (200, 'Maintenance Yard — Civil Construction',
   'contract_awarded', 'Al-Futtaim Construction KSA',
   22000000, 'SAR', 'Fixed-price EPC contract, liquidated damages clause included',
   '2025-12-01', '2027-03-31'),

  (200, 'Workshop Equipment Package',
   'rfp_preparation', NULL,
   4500000, 'SAR', 'Spec development underway, RFP target Q3 2026',
   NULL, NULL),

  (215, 'Tolling Configuration — Dynamic Pricing Module',
   'sole_source', 'Kapsch TrafficCom AG',
   1500000, 'SAR', 'Sole-source justified: existing TCS vendor compatibility',
   NULL, '2026-09-30'),

  (251, 'TMS Platform — 3-Year Enterprise Licence',
   'contract_awarded', 'Rekor Systems Inc.',
   9600000, 'SAR', 'Cloud-hosted TMS with AI-powered congestion prediction',
   '2025-03-01', '2028-02-28'),

  (235, 'Cybersecurity Maturity Assessment',
   'contract_awarded', 'Deloitte Cyber Arabia',
   850000, 'SAR', 'NIST CSF & SAMA compliance framework alignment',
   '2026-01-15', '2026-06-30'),

  (245, 'Biometric Gateway Hardware — 24 Units',
   'rfp_issued', NULL,
   12000000, 'SAR', 'Facial recognition + fingerprint; NCA-approved vendors only',
   NULL, NULL),

  (187, 'Customer Journey Research & Consulting',
   'contract_awarded', 'McKinsey & Company (Riyadh)',
   3500000, 'SAR', '4-month engagement; journey map + VOC research',
   '2025-11-01', '2026-03-31');


-- ─────────────────────────────────────────────────────────────
-- 6. ACTIONS / TASKS
-- ─────────────────────────────────────────────────────────────
TRUNCATE spmo_actions RESTART IDENTITY;

INSERT INTO spmo_actions
  (project_id, milestone_id, title, description, assignee_id, assignee_name, due_date, priority, status, created_by_id, created_by_name)
VALUES
  (187, 650, 'Finalise customer survey instrument (Wave 3)',
   'Update the NPS questionnaire to include new digital touchpoint questions before Q2 fieldwork launch.',
   '56298317', 'Hany Al-Rashidi', '2026-05-15', 'high', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (187, 651, 'SOP sign-off with Operations Director',
   'Schedule review session and obtain sign-off on the new CX SOP document v2.1.',
   '56298317', 'Hany Al-Rashidi', '2026-05-30', 'medium', 'in_progress',
   '56298317', 'Hany Al-Rashidi'),

  (195, 639, 'Issue variation order for node 7 permitting delay',
   'Draft VO and obtain PM approval for 6-week extension on node 7 camera installation due to municipality permit.',
   '56298317', 'Hany Al-Rashidi', '2026-04-20', 'high', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (196, NULL, 'Confirm alternative lighting supplier shortlist',
   'Contact 3 EU-based suppliers and obtain indicative pricing for buffer stock pre-order.',
   '56298317', 'Hany Al-Rashidi', '2026-04-30', 'high', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (200, NULL, 'Obtain IQ sign-off on updated BOQ',
   'Independent quantity surveyor to review revised bill of quantities and sign off before Board presentation.',
   '56298317', 'Hany Al-Rashidi', '2026-05-01', 'critical', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (215, NULL, 'Prepare bilateral agreement pricing analysis memo',
   'Legal team to produce a 5-page memo mapping proposed price variance bands against PMO–KSA treaty clauses.',
   '56298317', 'Hany Al-Rashidi', '2026-05-01', 'high', 'in_progress',
   '56298317', 'Hany Al-Rashidi'),

  (228, NULL, 'Launch change champion nominations process',
   'Send all-staff communication requesting nominations for the change champion network (one per department).',
   '56298317', 'Hany Al-Rashidi', '2026-04-15', 'medium', 'completed',
   '56298317', 'Hany Al-Rashidi'),

  (251, NULL, 'Finalise TMS API integration test plan',
   'QA team to develop integration test plan covering 15 key data flows between TMS and the SPMO dashboard.',
   '56298317', 'Hany Al-Rashidi', '2026-05-31', 'high', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (235, NULL, 'Schedule CISO briefing on maturity assessment findings',
   'Book 2-hour session with CISO and board IT committee for preliminary findings presentation.',
   '56298317', 'Hany Al-Rashidi', '2026-06-15', 'medium', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (245, NULL, 'Define biometric data retention policy',
   'Draft data retention and deletion policy for traveller biometric data in compliance with PDPL Article 14.',
   '56298317', 'Hany Al-Rashidi', '2026-05-15', 'critical', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (190, 675, 'Migrate region 3 CRM contacts to central platform',
   'Extract, validate and bulk-upload 48,000 customer records from the Jubail regional CRM database.',
   '56298317', 'Hany Al-Rashidi', '2026-06-30', 'high', 'open',
   '56298317', 'Hany Al-Rashidi'),

  (225, NULL, 'Translate strategy narrative to Arabic (official version)',
   'Engage certified translation agency and route through Communications Director for final approval.',
   '56298317', 'Hany Al-Rashidi', '2026-04-30', 'medium', 'in_progress',
   '56298317', 'Hany Al-Rashidi');


-- ─────────────────────────────────────────────────────────────
-- 7. CHANGE REQUESTS
-- ─────────────────────────────────────────────────────────────
TRUNCATE spmo_change_requests RESTART IDENTITY;

INSERT INTO spmo_change_requests
  (project_id, title, description, change_type, impact, requested_by_id, requested_by_name,
   status, budget_impact, timeline_impact)
VALUES
  (195, 'Scope extension — 40 additional detection nodes',
   'Traffic data analysis revealed 40 additional camera positions required on secondary roads not in original scope. '
   || 'Failure to include these will result in 22% coverage gap against the 100% target KPI.',
   'scope', 'Significant budget and timeline increase. Phase 2 nodes add SAR 4.5M and extend delivery by 4 months.',
   '56298317', 'Hany Al-Rashidi', 'pending', 4500000, 16),

  (200, 'Revised BOQ — civil works cost escalation',
   'Global steel and concrete price increases since original estimate (Jan 2024) have raised the BOQ by SAR 3.3M. '
   || 'Requesting budget amendment to avoid scope reduction.',
   'budget', 'Budget increase of SAR 3.3M required; no timeline impact if approved within 30 days.',
   '56298317', 'Hany Al-Rashidi', 'approved',  3300000, 0),

  (215, 'Defer dynamic pricing implementation by one quarter',
   'Legal review has identified the need for a bilateral agreement amendment before price variance bands can be '
   || 'activated. Requesting a Q3 → Q4 2026 go-live shift.',
   'timeline', 'No budget impact; timeline deferred by 3 months.',
   '56298317', 'Hany Al-Rashidi', 'approved', 0, 90),

  (228, 'Add change management workstream to restructuring project',
   'Following mid-point risk assessment, a dedicated change management workstream (external consultant) is '
   || 'recommended to reduce staff resistance risk.',
   'scope', 'Additional SAR 1.5M for 6-month change management engagement.',
   '56298317', 'Hany Al-Rashidi', 'pending', 1500000, 0),

  (251, 'Integrate TMS data with external MOMRA road authority API',
   'Ministry of Roads (MOMRA) has offered a real-time traffic feed that would significantly enhance TMS '
   || 'predictive accuracy. Additional integration work estimated at 6 weeks.',
   'scope', 'Minimal cost (SAR 180,000 integration effort); 6-week schedule extension requested.',
   '56298317', 'Hany Al-Rashidi', 'pending', 180000, 42),

  (235, 'Expand cybersecurity assessment to include OT/SCADA systems',
   'CISO has determined that the original scope (IT only) is insufficient. OT/SCADA systems control toll '
   || 'gates and must be included to satisfy NCA regulatory requirements.',
   'scope', 'Assessment scope increase adds SAR 280,000 and 3 weeks to the engagement.',
   '56298317', 'Hany Al-Rashidi', 'approved', 280000, 21);


-- ─────────────────────────────────────────────────────────────
-- 8. RACI ENTRIES (project-level accountability matrix)
-- ─────────────────────────────────────────────────────────────
TRUNCATE spmo_raci RESTART IDENTITY;

INSERT INTO spmo_raci (project_id, user_id, user_name, role) VALUES
  (187, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (187, '56298317', 'PMO Director',     'responsible'),
  (195, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (195, '56298317', 'Head of Technology','responsible'),
  (196, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (196, '56298317', 'Head of Projects',  'responsible'),
  (200, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (200, '56298317', 'Head of Projects',  'responsible'),
  (200, '56298317', 'Head of Finance',   'consulted'),
  (215, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (215, '56298317', 'Head of Commercial','responsible'),
  (215, '56298317', 'Head of Legal',     'consulted'),
  (228, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (228, '56298317', 'Head of HR',        'responsible'),
  (251, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (251, '56298317', 'Head of Technology','responsible'),
  (235, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (235, '56298317', 'CISO',              'responsible'),
  (245, '56298317', 'Hany Al-Rashidi', 'accountable'),
  (245, '56298317', 'Head of Operations','responsible'),
  (245, '56298317', 'Head of Legal',     'consulted');


COMMIT;

-- =============================================================================
-- Verification — run these SELECT statements after the seed to confirm
-- =============================================================================
-- SELECT 'risks' AS tbl, COUNT(*) AS n FROM spmo_risks
-- UNION ALL SELECT 'mitigations', COUNT(*) FROM spmo_mitigations
-- UNION ALL SELECT 'kpi_measurements', COUNT(*) FROM spmo_kpi_measurements
-- UNION ALL SELECT 'budget_entries', COUNT(*) FROM spmo_budget_entries
-- UNION ALL SELECT 'procurement', COUNT(*) FROM spmo_procurement
-- UNION ALL SELECT 'actions', COUNT(*) FROM spmo_actions
-- UNION ALL SELECT 'change_requests', COUNT(*) FROM spmo_change_requests
-- UNION ALL SELECT 'raci', COUNT(*) FROM spmo_raci;
