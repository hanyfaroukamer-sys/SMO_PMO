/**
 * Analytics & Intelligence API endpoints.
 * Exposes the 8 competitive engines to the frontend.
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "./spmo";

const router: IRouter = Router();

// ─── Predictive Delay ──────────────────────────────────────────
router.get("/spmo/analytics/delay-predictions", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const { computeDelayPredictions } = await import("../lib/engine-predictive-delay.js");
    const predictions = await computeDelayPredictions();
    res.json({ predictions });
  } catch (err: any) {
    req.log?.error?.({ err }, "Delay prediction failed");
    res.status(500).json({ error: err.message ?? "Failed to compute delay predictions" });
  }
});

// ─── Budget Forecast ───────────────────────────────────────────
router.get("/spmo/analytics/budget-forecasts", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const { computeBudgetForecasts } = await import("../lib/engine-budget-forecast.js");
    const forecasts = await computeBudgetForecasts();
    res.json({ forecasts });
  } catch (err: any) {
    req.log?.error?.({ err }, "Budget forecast failed");
    res.status(500).json({ error: err.message ?? "Failed to compute budget forecasts" });
  }
});

// ─── Stakeholder Intelligence ──────────────────────────────────
router.get("/spmo/analytics/stakeholder-alerts", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const { computeStakeholderAlerts } = await import("../lib/engine-stakeholder.js");
    const alerts = await computeStakeholderAlerts();
    res.json({ alerts });
  } catch (err: any) {
    req.log?.error?.({ err }, "Stakeholder alerts failed");
    res.status(500).json({ error: err.message ?? "Failed to compute stakeholder alerts" });
  }
});

// ─── Critical Path ─────────────────────────────────────────────
router.get("/spmo/analytics/critical-path", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
  try {
    const { computeCriticalPath } = await import("../lib/engine-critical-path.js");
    const result = await computeCriticalPath(projectId);
    res.json(result);
  } catch (err: any) {
    req.log?.error?.({ err }, "Critical path failed");
    res.status(500).json({ error: err.message ?? "Failed to compute critical path" });
  }
});

// ─── Earned Value Management ───────────────────────────────────
router.get("/spmo/analytics/evm", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const { computeEvmMetrics } = await import("../lib/engine-evm.js");
    const metrics = await computeEvmMetrics();
    res.json({ metrics });
  } catch (err: any) {
    req.log?.error?.({ err }, "EVM failed");
    res.status(500).json({ error: err.message ?? "Failed to compute EVM metrics" });
  }
});

// ─── Scenario Simulation ──────────────────────────────────────
router.post("/spmo/analytics/scenario", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const user = (req as any).user;
  if (user.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    const { simulateScenario } = await import("../lib/engine-scenario.js");
    const result = await simulateScenario(req.body);
    res.json(result);
  } catch (err: any) {
    req.log?.error?.({ err }, "Scenario simulation failed");
    res.status(500).json({ error: err.message ?? "Failed to simulate scenario" });
  }
});

// ─── AI Programme Advisor ──────────────────────────────────────
router.post("/spmo/analytics/advisor", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { question, context, projectId } = req.body;
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "question (string) is required" });
    return;
  }
  try {
    const { queryAdvisor } = await import("../lib/engine-ai-advisor.js");
    const result = await queryAdvisor({ question, context, projectId });
    res.json(result);
  } catch (err: any) {
    req.log?.error?.({ err }, "AI advisor failed");
    res.status(500).json({ error: err.message ?? "Failed to query advisor" });
  }
});

// ─── Board Report Generator ───────────────────────────────────
router.post("/spmo/analytics/board-report", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const user = (req as any).user;
  if (user.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    const { generateBoardReport } = await import("../lib/engine-board-report.js");
    const report = await generateBoardReport();
    res.json(report);
  } catch (err: any) {
    req.log?.error?.({ err }, "Board report generation failed");
    res.status(500).json({ error: err.message ?? "Failed to generate board report" });
  }
});

// ─── Combined Analytics Dashboard ──────────────────────────────
// Returns summary data from all engines for the analytics dashboard
router.get("/spmo/analytics/summary", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const [
      { computeDelayPredictions },
      { computeBudgetForecasts },
      { computeStakeholderAlerts },
      { computeEvmMetrics },
    ] = await Promise.all([
      import("../lib/engine-predictive-delay.js"),
      import("../lib/engine-budget-forecast.js"),
      import("../lib/engine-stakeholder.js"),
      import("../lib/engine-evm.js"),
    ]);

    const [predictions, forecasts, alerts, evm] = await Promise.all([
      computeDelayPredictions().catch(() => []),
      computeBudgetForecasts().catch(() => []),
      computeStakeholderAlerts().catch(() => []),
      computeEvmMetrics().catch(() => []),
    ]);

    res.json({
      delayPredictions: { count: predictions.length, critical: predictions.filter((p: any) => p.riskLevel === "critical").length, items: predictions.slice(0, 5) },
      budgetForecasts: { count: forecasts.length, overruns: forecasts.filter((f: any) => f.alert === "overrun").length, items: forecasts.slice(0, 5) },
      stakeholderAlerts: { count: alerts.length, critical: alerts.filter((a: any) => a.severity === "critical").length, items: alerts.slice(0, 5) },
      evmSummary: {
        count: evm.length,
        avgCpi: evm.length > 0 ? Math.round((evm.map((e) => e.cpi).reduce((a, b) => a + b, 0) / evm.length) * 100) / 100 : 1,
        avgSpi: evm.length > 0 ? Math.round((evm.map((e) => e.spi).reduce((a, b) => a + b, 0) / evm.length) * 100) / 100 : 1,
        overBudget: evm.filter((e: any) => e.costStatus === "over_budget").length,
        behindSchedule: evm.filter((e: any) => e.scheduleStatus === "behind").length,
      },
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Analytics summary failed");
    res.status(500).json({ error: err.message ?? "Failed to compute analytics summary" });
  }
});

// ─── Programme Weekly Digest ──────────────────────────────────
router.get("/spmo/analytics/weekly-digest", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const { generateProgrammeWeeklyDigest } = await import("../lib/engine-weekly-digest.js");
    const digest = await generateProgrammeWeeklyDigest();
    res.json(digest);
  } catch (err: any) {
    req.log?.error?.({ err }, "Weekly digest failed");
    res.status(500).json({ error: err.message ?? "Failed to generate weekly digest" });
  }
});

// ─── Anomaly Detection ────────────────────────────────────────
router.get("/spmo/analytics/anomalies", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const { detectAnomalies } = await import("../lib/engine-anomaly.js");
    const anomalies = await detectAnomalies();
    res.json({ anomalies, count: anomalies.length, critical: anomalies.filter((a: any) => a.severity === "critical").length });
  } catch (err: any) {
    req.log?.error?.({ err }, "Anomaly detection failed");
    res.status(500).json({ error: err.message ?? "Failed to detect anomalies" });
  }
});

// ─── Dependency Finder ────────────────────────────────────────
router.get("/spmo/analytics/dependency-suggestions", async (req, res) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const { findDependencies } = await import("../lib/engine-dependency-finder.js");
    const result = await findDependencies();
    res.json(result);
  } catch (err: any) {
    req.log?.error?.({ err }, "Dependency finder failed");
    res.status(500).json({ error: err.message ?? "Failed to find dependencies" });
  }
});

export default router;
