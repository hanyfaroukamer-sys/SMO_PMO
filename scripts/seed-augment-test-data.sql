-- =============================================================================
-- StrategyPMO — Test Data Augmentation Script
-- Adds milestone progress, evidence records, submitted/rejected states,
-- weight scenarios, and richer KPI measurement history for deep-dive testing.
-- Safe to re-run: uses DELETE WHERE + INSERT pattern (no TRUNCATE).
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: MILESTONE WEIGHT SCENARIOS
-- Goal: give testers a project with milestones they can rebalance
-- Project 196 — Border lighting & emergency infrastructure
-- =============================================================================

-- Remove old test milestones if re-running
DELETE FROM spmo_milestones
WHERE project_id = 196 AND name IN (
  'Permitting & Site Access', 'Electrical Design Sign-off',
  'Installation — Phase A', 'Installation — Phase B', 'Commissioning & UAT'
);

-- Insert milestones with deliberately unbalanced weights (totals 75 out of 85 free)
-- Testers will be able to edit and rebalance these to 85 total
INSERT INTO spmo_milestones
  (project_id, name, weight, progress, status, description)
VALUES
  (196, 'Permitting & Site Access',       15, 100, 'approved',
   'Municipality permits and site access agreements for all border lighting nodes.'),
  (196, 'Electrical Design Sign-off',      10, 80, 'in_progress',
   'Electrical engineering drawings reviewed and signed off by KFCA infrastructure team.'),
  (196, 'Installation — Phase A',          20, 35, 'in_progress',
   'Installation of smart LED units on the KSA approach corridor (24 poles).'),
  (196, 'Installation — Phase B',          20, 0,  'pending',
   'Installation on Bahrain approach corridor and central island perimeter (18 poles).'),
  (196, 'Commissioning & UAT',             10, 0,  'pending',
   'Full system test, lumens calibration, and final client sign-off.');

-- =============================================================================
-- SECTION 2: MILESTONES WITH SUBMITTED STATUS → appear in Pending Approvals
-- Goal: give the admin user items to approve/reject in the Progress Proof Centre
-- =============================================================================

-- ── 2A: Project 187 — Customer journey optimisation
--    Milestone 650 (Process Analysis & Mapping, 96% → promote to 100 + submit)
UPDATE spmo_milestones SET progress = 100, status = 'submitted'
WHERE id = 650;

-- ── 2B: Project 195 — Road incident detection
--    Milestone 720 (Execution & Delivery, 100% in_progress → submit)
UPDATE spmo_milestones SET status = 'submitted'
WHERE id = 720;

-- ── 2C: Project 195
--    Milestone 722 (Process Analysis & Mapping, 52.5% → 100 + submit)
UPDATE spmo_milestones SET progress = 100, status = 'submitted'
WHERE id = 722;

-- ── 2D: Add a new milestone to project 200 at 100% submitted
DELETE FROM spmo_milestones
WHERE project_id = 200 AND name = 'Design Review & BOQ Approval';

INSERT INTO spmo_milestones (project_id, name, weight, progress, status, description)
VALUES (200, 'Design Review & BOQ Approval', 15, 100, 'submitted',
        'Independent engineer review of civil drawings and approved BOQ submitted to Finance.');

-- ── 2E: Project 245 — Pre-registration system — one rejected milestone for testers to re-submit
DELETE FROM spmo_milestones
WHERE project_id = 245 AND name = 'Requirements & Legal Clearance';

INSERT INTO spmo_milestones (project_id, name, weight, progress, status, description)
VALUES (245, 'Requirements & Legal Clearance', 20, 100, 'rejected',
        'Full requirements specification and PDPL legal clearance memo — rejected: privacy impact missing.');

-- =============================================================================
-- SECTION 3: EVIDENCE RECORDS for submitted milestones
-- Fake object paths suffice for UI testing; files won't resolve in storage
-- but evidence cards, counts, and approve/reject buttons will all work.
-- =============================================================================

DELETE FROM spmo_evidence
WHERE object_path LIKE '/objects/test-evidence/%';

-- Milestone 650 (submitted) — 2 evidence files
INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
VALUES
  (650, 'CX-Journey-Map-v3.pdf', 'application/pdf',
   '/objects/test-evidence/650-journey-map.pdf', '56298317', 'Hany Al-Rashidi',
   'Finalised customer journey map version 3.0 — 28 touchpoints mapped across 4 channels.'),
  (650, 'Stakeholder-Sign-Off-Matrix.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   '/objects/test-evidence/650-signoff-matrix.xlsx', '56298317', 'Hany Al-Rashidi',
   'Sign-off matrix showing approval from Operations, CX, and Digital teams.');

-- Milestone 720 (submitted) — 3 evidence files
INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
VALUES
  (720, 'Sensor-Installation-Report-Phase1.pdf', 'application/pdf',
   '/objects/test-evidence/720-install-report.pdf', '56298317', 'Hany Al-Rashidi',
   'Phase 1 installation completion report — 180 sensor nodes commissioned and tested.'),
  (720, 'SCADA-Integration-Test-Results.pdf', 'application/pdf',
   '/objects/test-evidence/720-scada-test.pdf', '56298317', 'Hany Al-Rashidi',
   'SCADA integration test results — all 180 feeds live, latency < 200ms.'),
  (720, 'Vendor-Handover-Certificate.pdf', 'application/pdf',
   '/objects/test-evidence/720-handover-cert.pdf', '56298317', 'Hany Al-Rashidi',
   'Vendor handover and acceptance certificate signed by KFCA project manager.');

-- Milestone 722 (submitted) — 2 evidence files
INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
VALUES
  (722, 'Process-Analysis-Report.pdf', 'application/pdf',
   '/objects/test-evidence/722-process-analysis.pdf', '56298317', 'Hany Al-Rashidi',
   'Incident detection process analysis — current state vs future state mapping with gap analysis.'),
  (722, 'Process-Mapping-Visio.pdf', 'application/pdf',
   '/objects/test-evidence/722-process-map.pdf', '56298317', 'Hany Al-Rashidi',
   'BPMN process flow diagrams for incident detection, escalation, and response procedures.');

-- Design Review milestone (project 200, submitted) — 2 evidence files
INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
SELECT m.id,
       'IQ-Review-Report.pdf', 'application/pdf',
       '/objects/test-evidence/200-iq-review.pdf', '56298317', 'Hany Al-Rashidi',
       'Independent quantity surveyor review report — BOQ revised upward by SAR 3.3M.'
FROM spmo_milestones m WHERE m.project_id = 200 AND m.name = 'Design Review & BOQ Approval';

INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
SELECT m.id,
       'Approved-BOQ-Rev2.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       '/objects/test-evidence/200-boq-rev2.xlsx', '56298317', 'Hany Al-Rashidi',
       'Approved bill of quantities revision 2 — Finance Director countersignature included.'
FROM spmo_milestones m WHERE m.project_id = 200 AND m.name = 'Design Review & BOQ Approval';

-- Requirements milestone (project 245, rejected) — 1 evidence file (incomplete — showing why it was rejected)
INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
SELECT m.id,
       'Requirements-Spec-v1.pdf', 'application/pdf',
       '/objects/test-evidence/245-requirements-v1.pdf', '56298317', 'Hany Al-Rashidi',
       'Initial requirements specification v1 — PDPL privacy impact assessment section is incomplete.'
FROM spmo_milestones m WHERE m.project_id = 245 AND m.name = 'Requirements & Legal Clearance';

-- =============================================================================
-- SECTION 4: ADDITIONAL IN-PROGRESS MILESTONES for progress tracking tests
-- Project 201 — Traffic monitoring & forecasting system
-- =============================================================================

DELETE FROM spmo_milestones
WHERE project_id = 201 AND name IN (
  'Vendor Selection & Contracting', 'Data Architecture Design',
  'System Integration', 'Pilot Zone Activation', 'Full Network Rollout', 'Performance Tuning'
);

INSERT INTO spmo_milestones (project_id, name, weight, progress, status, description)
VALUES
  (201, 'Vendor Selection & Contracting', 10, 100, 'approved',
   'RFP evaluation completed; Rekor Systems selected; contract signed.'),
  (201, 'Data Architecture Design',       15, 100, 'submitted',
   'Data lake architecture and API schema design for TMS integration.'),
  (201, 'System Integration',             25, 60,  'in_progress',
   'TMS feeds being integrated with MOMRA API and the SPMO dashboard.'),
  (201, 'Pilot Zone Activation',          20, 15,  'in_progress',
   'Al-Rakah pilot zone hardware and software activation.'),
  (201, 'Full Network Rollout',           20, 0,   'pending',
   'System-wide rollout across all 9 monitored corridors.'),
  (201, 'Performance Tuning',             10, 0,   'pending',
   'Post-rollout ML model calibration and accuracy validation.');

-- Evidence for Data Architecture submitted milestone
INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
SELECT m.id,
       'TMS-Data-Architecture-v2.pdf', 'application/pdf',
       '/objects/test-evidence/201-data-arch.pdf', '56298317', 'Hany Al-Rashidi',
       'Approved data architecture specification — multi-tier lake with real-time streaming layer.'
FROM spmo_milestones m WHERE m.project_id = 201 AND m.name = 'Data Architecture Design';

INSERT INTO spmo_evidence (milestone_id, file_name, content_type, object_path, uploaded_by_id, uploaded_by_name, description)
SELECT m.id,
       'API-Schema-Documentation.pdf', 'application/pdf',
       '/objects/test-evidence/201-api-schema.pdf', '56298317', 'Hany Al-Rashidi',
       'REST + WebSocket API schema documentation for all 47 data integration endpoints.'
FROM spmo_milestones m WHERE m.project_id = 201 AND m.name = 'Data Architecture Design';

-- =============================================================================
-- SECTION 5: KPI MEASUREMENT HISTORY — rich quarterly data for deep-dive modals
-- 5 quarterly readings per KPI for strategic KPIs + key operational KPIs
-- =============================================================================

-- Remove existing measurements for these KPIs if re-augmenting
DELETE FROM spmo_kpi_measurements WHERE kpi_id IN (2,4,5,11,12,15,19,23,24,26,29,30,16,22);

-- KPI 2 — Cargo prepaid e-Toll adoption rate (target 25%, actual 0)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (2, '2025-03-31',  0.0, 'Q1 2025 — system not live yet; baseline established', '56298317', 'Hany Al-Rashidi'),
  (2, '2025-06-30',  0.8, 'Q2 2025 — soft launch, 120 early adopter carriers registered', '56298317', 'Hany Al-Rashidi'),
  (2, '2025-09-30',  2.1, 'Q3 2025 — incentive campaign launched, growth accelerating', '56298317', 'Hany Al-Rashidi'),
  (2, '2025-12-31',  4.3, 'Q4 2025 — partnership with 3 major logistics firms signed', '56298317', 'Hany Al-Rashidi'),
  (2, '2026-03-31',  6.0, 'Q1 2026 — new mandatory e-Toll lanes opened, adoption rising', '56298317', 'Hany Al-Rashidi');

-- KPI 5 — Digital toll payment uptake for passengers (target 70%, actual 0)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (5, '2025-03-31', 18.2, 'Q1 2025 — baseline; card payments only', '56298317', 'Hany Al-Rashidi'),
  (5, '2025-06-30', 28.5, 'Q2 2025 — Apple/Google Pay integration live', '56298317', 'Hany Al-Rashidi'),
  (5, '2025-09-30', 42.1, 'Q3 2025 — loyalty points campaign', '56298317', 'Hany Al-Rashidi'),
  (5, '2025-12-31', 55.3, 'Q4 2025 — frequent traveler app push notifications', '56298317', 'Hany Al-Rashidi'),
  (5, '2026-03-31', 63.0, 'Q1 2026 — 7 points from target; cashback scheme still active', '56298317', 'Hany Al-Rashidi');

-- KPI 11 — Total revenue SAR (target 540M, actual 553M)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (11, '2025-03-31', 118000000, 'Q1 2025 — toll revenue strong despite low season', '56298317', 'Hany Al-Rashidi'),
  (11, '2025-06-30', 142000000, 'Q2 2025 — Eid peak traffic drove higher toll volumes', '56298317', 'Hany Al-Rashidi'),
  (11, '2025-09-30', 149000000, 'Q3 2025 — commercial revenues up, new tenants in island', '56298317', 'Hany Al-Rashidi'),
  (11, '2025-12-31', 144000000, 'Q4 2025 — steady, winter slowdown expected', '56298317', 'Hany Al-Rashidi'),
  (11, '2026-03-31', 153000000, 'Q1 2026 — toll price increase effective Jan 2026', '56298317', 'Hany Al-Rashidi');

-- KPI 12 — Non-toll revenue SAR (target 90M, actual 35M)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (12, '2025-03-31',  5200000, 'Q1 2025 — island commercial leases only', '56298317', 'Hany Al-Rashidi'),
  (12, '2025-06-30',  7800000, 'Q2 2025 — digital advertising boards launched', '56298317', 'Hany Al-Rashidi'),
  (12, '2025-09-30',  9400000, 'Q3 2025 — B2B data monetisation pilot revenue', '56298317', 'Hany Al-Rashidi'),
  (12, '2025-12-31',  6100000, 'Q4 2025 — seasonal dip in advertising spend', '56298317', 'Hany Al-Rashidi'),
  (12, '2026-03-31',  7000000, 'Q1 2026 — new commercial tenant signed (3,200 sqm)', '56298317', 'Hany Al-Rashidi');

-- KPI 15 — Projects executed on time (target 95%, actual 97.3%)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (15, '2025-03-31', 91.0, 'Q1 2025 — 2 legacy projects delayed, pulling score down', '56298317', 'Hany Al-Rashidi'),
  (15, '2025-06-30', 93.5, 'Q2 2025 — recovery plan for delayed projects executed', '56298317', 'Hany Al-Rashidi'),
  (15, '2025-09-30', 95.8, 'Q3 2025 — above target, strong PMO oversight', '56298317', 'Hany Al-Rashidi'),
  (15, '2025-12-31', 96.7, 'Q4 2025 — year-end close; 3 minor deadline slippages', '56298317', 'Hany Al-Rashidi'),
  (15, '2026-03-31', 97.3, 'Q1 2026 — best quarter on record for schedule adherence', '56298317', 'Hany Al-Rashidi');

-- KPI 19 — Compliance with SLAs (strategic, target 81%, actual 91%)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (19, '2025-03-31', 79.2, 'Q1 2025 — 3 SLA breaches, gate processing slowdowns', '56298317', 'Hany Al-Rashidi'),
  (19, '2025-06-30', 83.5, 'Q2 2025 — new monitoring dashboards deployed', '56298317', 'Hany Al-Rashidi'),
  (19, '2025-09-30', 87.1, 'Q3 2025 — vendor SLAs renegotiated upward', '56298317', 'Hany Al-Rashidi'),
  (19, '2025-12-31', 89.4, 'Q4 2025 — strong performance, 2 minor breaches only', '56298317', 'Hany Al-Rashidi'),
  (19, '2026-03-31', 91.0, 'Q1 2026 — exceeded target by 10pp', '56298317', 'Hany Al-Rashidi');

-- KPI 23 — EBITDA margin (strategic, target 35%, actual 45%)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (23, '2025-03-31', 38.2, 'Q1 2025 — above target; low capex spend period', '56298317', 'Hany Al-Rashidi'),
  (23, '2025-06-30', 41.5, 'Q2 2025 — toll volume surge, opex flat', '56298317', 'Hany Al-Rashidi'),
  (23, '2025-09-30', 43.1, 'Q3 2025 — outsourcing savings materialising', '56298317', 'Hany Al-Rashidi'),
  (23, '2025-12-31', 44.8, 'Q4 2025 — full year strong; FX stable', '56298317', 'Hany Al-Rashidi'),
  (23, '2026-03-31', 45.0, 'Q1 2026 — sustained; capital projects ramping', '56298317', 'Hany Al-Rashidi');

-- KPI 24 — Peak crossing time for pax in minutes (strategic, target 25 min, actual 20.9 min — LOWER is better)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (24, '2025-03-31', 28.4, 'Q1 2025 — Eid congestion event drove average above target', '56298317', 'Hany Al-Rashidi'),
  (24, '2025-06-30', 25.1, 'Q2 2025 — fast-lane expansion operational; summer dip', '56298317', 'Hany Al-Rashidi'),
  (24, '2025-09-30', 23.2, 'Q3 2025 — pre-clearance pilot launched at 3 gates', '56298317', 'Hany Al-Rashidi'),
  (24, '2025-12-31', 21.8, 'Q4 2025 — biometric checks at 6 gates reducing wait times', '56298317', 'Hany Al-Rashidi'),
  (24, '2026-03-31', 20.9, 'Q1 2026 — best on record; pre-registration system contributing', '56298317', 'Hany Al-Rashidi');

-- KPI 26 — Average crossing time for cargo in hours (strategic, target 3 hrs, actual 1.48 — LOWER is better)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (26, '2025-03-31', 3.9, 'Q1 2025 — legacy paper declarations causing backlogs', '56298317', 'Hany Al-Rashidi'),
  (26, '2025-06-30', 2.8, 'Q2 2025 — e-manifest mandate effective for top 50 carriers', '56298317', 'Hany Al-Rashidi'),
  (26, '2025-09-30', 2.1, 'Q3 2025 — pre-clearance expanded to all cargo categories', '56298317', 'Hany Al-Rashidi'),
  (26, '2025-12-31', 1.8, 'Q4 2025 — new dedicated cargo scanning lane commissioned', '56298317', 'Hany Al-Rashidi'),
  (26, '2026-03-31', 1.48,'Q1 2026 — exceeds target; automated x-ray cuts inspection time', '56298317', 'Hany Al-Rashidi');

-- KPI 29 — Digitisation across journey touchpoints (strategic, target 35%, actual 13%)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (29, '2025-03-31',  4.2, 'Q1 2025 — digital kiosks only; mobile app not yet launched', '56298317', 'Hany Al-Rashidi'),
  (29, '2025-06-30',  7.5, 'Q2 2025 — mobile app beta (pax) released', '56298317', 'Hany Al-Rashidi'),
  (29, '2025-09-30', 10.1, 'Q3 2025 — e-gate integration live at 4 passenger gates', '56298317', 'Hany Al-Rashidi'),
  (29, '2025-12-31', 11.8, 'Q4 2025 — cargo e-manifest live for top carriers', '56298317', 'Hany Al-Rashidi'),
  (29, '2026-03-31', 13.0, 'Q1 2026 — on trajectory; 22pp gap to target remains', '56298317', 'Hany Al-Rashidi');

-- KPI 30 — Internal processes digitised (operational, target 47%, actual 60.2%)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (30, '2025-03-31', 48.3, 'Q1 2025 — ERP go-live in Finance and Procurement', '56298317', 'Hany Al-Rashidi'),
  (30, '2025-06-30', 52.1, 'Q2 2025 — HR module live; manual leave forms retired', '56298317', 'Hany Al-Rashidi'),
  (30, '2025-09-30', 56.8, 'Q3 2025 — Asset Management System deployed', '56298317', 'Hany Al-Rashidi'),
  (30, '2025-12-31', 58.4, 'Q4 2025 — Legal & Compliance module launched', '56298317', 'Hany Al-Rashidi'),
  (30, '2026-03-31', 60.2, 'Q1 2026 — exceeds target; GRC platform next milestone', '56298317', 'Hany Al-Rashidi');

-- KPI 16 — Annual internal audit plan completion (operational, target 85%, actual 63%)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (16, '2025-03-31', 18.0, 'Q1 2025 — 5 of 28 planned audits completed', '56298317', 'Hany Al-Rashidi'),
  (16, '2025-06-30', 39.2, 'Q2 2025 — 11 audits complete; resource constraints', '56298317', 'Hany Al-Rashidi'),
  (16, '2025-09-30', 53.5, 'Q3 2025 — 15 of 28 complete; new IA staff onboarded', '56298317', 'Hany Al-Rashidi'),
  (16, '2025-12-31', 60.7, 'Q4 2025 — 17 complete; 3 deferred to 2026', '56298317', 'Hany Al-Rashidi'),
  (16, '2026-03-31', 63.0, 'Q1 2026 — Q1 2026 audit cycle started; 3 new FY26 audits', '56298317', 'Hany Al-Rashidi');

-- KPI 22 — CapEx budget execution rate (operational, target 90%, actual 79%)
INSERT INTO spmo_kpi_measurements (kpi_id, measured_at, value, notes, recorded_by_id, recorded_by_name) VALUES
  (22, '2025-03-31', 58.4, 'Q1 2025 — slow start; procurement approvals delayed', '56298317', 'Hany Al-Rashidi'),
  (22, '2025-06-30', 67.2, 'Q2 2025 — 3 major contracts awarded in May', '56298317', 'Hany Al-Rashidi'),
  (22, '2025-09-30', 73.8, 'Q3 2025 — construction milestones hitting schedule', '56298317', 'Hany Al-Rashidi'),
  (22, '2025-12-31', 78.5, 'Q4 2025 — year-end spend push; 2 projects deferred', '56298317', 'Hany Al-Rashidi'),
  (22, '2026-03-31', 79.0, 'Q1 2026 — FY26 new capex projects being activated', '56298317', 'Hany Al-Rashidi');

-- =============================================================================
-- SECTION 6: LOG ACTIVITY for the submitted milestones
-- Ensures the activity feed shows submission events in the dashboard
-- =============================================================================

INSERT INTO spmo_activity_log
  (actor_id, actor_name, action, entity_type, entity_id, entity_name, details)
VALUES
  ('56298317', 'Hany Al-Rashidi', 'submitted', 'milestone', 650,
   'Process Analysis & Mapping',
   '{"projectName": "Customer journey optimization", "evidenceCount": 2}'::jsonb),

  ('56298317', 'Hany Al-Rashidi', 'submitted', 'milestone', 720,
   'Execution & Delivery',
   '{"projectName": "Road incident detection and response system", "evidenceCount": 3}'::jsonb),

  ('56298317', 'Hany Al-Rashidi', 'submitted', 'milestone', 722,
   'Process Analysis & Mapping',
   '{"projectName": "Road incident detection and response system", "evidenceCount": 2}'::jsonb),

  ('56298317', 'Hany Al-Rashidi', 'uploaded_evidence', 'milestone', 720,
   'Execution & Delivery',
   '{"fileName": "Sensor-Installation-Report-Phase1.pdf"}'::jsonb),

  ('56298317', 'Hany Al-Rashidi', 'rejected', 'milestone', 245,
   'Requirements & Legal Clearance',
   '{"projectName": "Traveler pre-registration system", "reason": "PDPL privacy impact assessment section incomplete — resubmit with Section 4 completed."}'::jsonb);

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (uncomment and run manually to confirm)
-- =============================================================================
-- SELECT 'submitted milestones' AS check, COUNT(*) FROM spmo_milestones WHERE status = 'submitted'
-- UNION ALL
-- SELECT 'rejected milestones', COUNT(*) FROM spmo_milestones WHERE status = 'rejected'
-- UNION ALL
-- SELECT 'evidence records', COUNT(*) FROM spmo_evidence
-- UNION ALL
-- SELECT 'kpi_measurements', COUNT(*) FROM spmo_kpi_measurements
-- UNION ALL
-- SELECT 'activity_log', COUNT(*) FROM spmo_activity_log;
