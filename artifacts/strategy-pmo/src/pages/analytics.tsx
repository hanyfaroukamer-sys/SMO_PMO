import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetSpmoConfig } from "@workspace/api-client-react";
import { Card, PageHeader } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, TrendingDown, TrendingUp, AlertTriangle, Clock, DollarSign, HelpCircle,
  Users, GitBranch, BarChart3, Brain, FileText, Play, ChevronDown, ChevronRight,
  ArrowRight, Shield, Target, Zap, AlertCircle, CheckCircle2, XCircle,
  Send, MessageCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface DelayPrediction {
  projectId: number; projectName: string; currentProgress: number;
  velocityPerDay: number; projectedCompletionDate: string; targetDate: string;
  predictedDelayDays: number; confidence: string; trend: string; riskLevel: string; reason: string;
}

interface BudgetForecast {
  projectId: number; projectName: string; totalBudget: number; spent: number;
  spentPct: number; progress: number; burnRate: number; projectedTotalSpend: number;
  projectedOverrun: number; projectedUnderspend: number; costPerformanceIndex: number;
  alert: string; reason: string;
}

interface StakeholderAlert {
  type: string; severity: string; personName: string | null; details: string;
  entityType: string; entityId: number; entityName: string; daysPending: number; actionRequired: string;
}

interface EvmMetric {
  projectId: number; projectName: string;
  plannedValue: number; earnedValue: number; actualCost: number;
  cpi: number; spi: number; costVariance: number; scheduleVariance: number;
  estimateAtCompletion: number; estimateToComplete: number;
  costStatus: string; scheduleStatus: string;
}

interface AnalyticsSummary {
  delayPredictions: { count: number; critical: number; items: DelayPrediction[] };
  budgetForecasts: { count: number; overruns: number; items: BudgetForecast[] };
  stakeholderAlerts: { count: number; critical: number; items: StakeholderAlert[] };
  evmSummary: { count: number; avgCpi: number; avgSpi: number; overBudget: number; behindSchedule: number };
}

// ─── Helpers ────────────────────────────────────────────────────

const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toFixed(0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const RISK_COLORS: Record<string, string> = { critical: "#DC2626", high: "#F97316", medium: "#EAB308", low: "#22C55E" };
const ALERT_COLORS: Record<string, string> = { overrun: "#DC2626", underspend: "#D97706", "on-track": "#16A34A" };
const SEV_COLORS: Record<string, string> = { critical: "#DC2626", high: "#F97316", medium: "#EAB308" };

function StatusDot({ color }: { color: string }) {
  return <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />;
}

function MetricBox({ label, value, sub, icon: Icon, color = "#2563EB" }: { label: string; value: string; sub?: string; icon: React.ElementType; color?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "15" }}>
          <Icon className="w-4.5 h-4.5" style={{ color }} />
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function SectionHeader({ title, icon: Icon, count, children }: { title: string; icon: React.ElementType; count?: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold">{title}</h2>
        {count !== undefined && <span className="text-xs bg-secondary border border-border px-2 py-0.5 rounded-full font-semibold">{count}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

type Tab = "overview" | "weekly" | "anomalies" | "dependencies" | "delays" | "budget" | "stakeholders" | "evm" | "scenario" | "advisor" | "board-report";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: spmoConfigData } = useGetSpmoConfig();
  const currency = spmoConfigData?.reportingCurrency ?? "SAR";

  const { data: summary, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/spmo/analytics/summary"],
    queryFn: () => customFetch("/api/spmo/analytics/summary"),
    staleTime: 60_000,
  });

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "weekly", label: "Weekly Digest", icon: FileText },
    { key: "anomalies", label: "Anomalies", icon: AlertTriangle },
    { key: "delays", label: "Delay Predictions", icon: Clock },
    { key: "budget", label: "Budget Forecast", icon: DollarSign },
    { key: "stakeholders", label: "Stakeholder Intel", icon: Users },
    { key: "evm", label: "Earned Value", icon: TrendingUp },
    { key: "scenario", label: "Scenarios", icon: Play },
    { key: "advisor", label: "AI Advisor", icon: Brain },
    { key: "board-report", label: "Board Report", icon: FileText },
  ];

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Programme Analytics" description="Intelligence engines powering data-driven decisions." />

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl overflow-x-auto">
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      )}

      {/* ─── Overview Tab ──────────────────────────────────────── */}
      {!isLoading && activeTab === "overview" && summary && (
        <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricBox label="Delay Predictions" value={String(summary.delayPredictions.count)} sub={`${summary.delayPredictions.critical} critical`} icon={Clock} color="#DC2626" />
            <MetricBox label="Budget Alerts" value={String(summary.budgetForecasts.count)} sub={`${summary.budgetForecasts.overruns} overruns`} icon={DollarSign} color="#D97706" />
            <MetricBox label="Stakeholder Alerts" value={String(summary.stakeholderAlerts.count)} sub={`${summary.stakeholderAlerts.critical} critical`} icon={Users} color="#7C3AED" />
            <MetricBox label="Avg CPI / SPI" value={`${summary.evmSummary.avgCpi} / ${summary.evmSummary.avgSpi}`} sub={`${summary.evmSummary.overBudget} over budget`} icon={TrendingUp} color="#2563EB" />
          </div>

          {/* Top delay predictions */}
          {summary.delayPredictions.items.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Top Delay Risks" icon={Clock} count={summary.delayPredictions.count}>
                <button onClick={() => setActiveTab("delays")} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">View all <ArrowRight className="w-3 h-3" /></button>
              </SectionHeader>
              <div className="space-y-3">
                {summary.delayPredictions.items.map((p) => (
                  <div key={p.projectId} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                    <StatusDot color={RISK_COLORS[p.riskLevel] ?? "#94A3B8"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.projectName}</div>
                      <div className="text-xs text-muted-foreground">{p.reason}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-destructive">+{p.predictedDelayDays}d</div>
                      <div className="text-[10px] text-muted-foreground">{p.confidence} confidence</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Top budget alerts */}
          {summary.budgetForecasts.items.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Budget Alerts" icon={DollarSign} count={summary.budgetForecasts.count}>
                <button onClick={() => setActiveTab("budget")} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">View all <ArrowRight className="w-3 h-3" /></button>
              </SectionHeader>
              <div className="space-y-3">
                {summary.budgetForecasts.items.map((f) => (
                  <div key={f.projectId} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                    <StatusDot color={ALERT_COLORS[f.alert] ?? "#94A3B8"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{f.projectName}</div>
                      <div className="text-xs text-muted-foreground">{f.reason}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold ${f.alert === "overrun" ? "text-destructive" : "text-warning"}`}>
                        {f.alert === "overrun" ? `+${currency} ${fmtM(f.projectedOverrun)}` : `-${currency} ${fmtM(f.projectedUnderspend)}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground">CPI: {f.costPerformanceIndex.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Top stakeholder alerts */}
          {summary.stakeholderAlerts.items.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Stakeholder Attention" icon={Users} count={summary.stakeholderAlerts.count}>
                <button onClick={() => setActiveTab("stakeholders")} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">View all <ArrowRight className="w-3 h-3" /></button>
              </SectionHeader>
              <div className="space-y-3">
                {summary.stakeholderAlerts.items.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                    <StatusDot color={SEV_COLORS[a.severity] ?? "#94A3B8"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{a.personName ?? a.entityName}</div>
                      <div className="text-xs text-muted-foreground">{a.details}</div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{a.daysPending}d pending</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {summary.delayPredictions.items.length === 0 && summary.budgetForecasts.items.length === 0 && summary.stakeholderAlerts.items.length === 0 && (
            <Card className="p-8 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-3" />
              <h3 className="text-lg font-bold">Programme Healthy</h3>
              <p className="text-sm text-muted-foreground mt-1">No delay predictions, budget alerts, or stakeholder issues detected.</p>
            </Card>
          )}
        </div>
      )}

      {/* ─── Delays Tab ────────────────────────────────────────── */}
      {activeTab === "weekly" && <WeeklyDigestPanel />}
      {activeTab === "anomalies" && <AnomalyPanel />}

      {activeTab === "delays" && <DelaysPanel />}

      {/* ─── Budget Tab ────────────────────────────────────────── */}
      {activeTab === "budget" && <BudgetPanel />}

      {/* ─── Stakeholders Tab ──────────────────────────────────── */}
      {activeTab === "stakeholders" && <StakeholdersPanel />}

      {/* ─── EVM Tab ───────────────────────────────────────────── */}
      {activeTab === "evm" && <EvmPanel />}

      {/* ─── Scenario Tab ─────────────────────────────────────── */}
      {activeTab === "scenario" && <ScenarioPanel />}

      {/* ─── AI Advisor Tab ────────────────────────────────────── */}
      {activeTab === "advisor" && <AdvisorPanel />}

      {/* ─── Board Report Tab ──────────────────────────────────── */}
      {activeTab === "board-report" && <BoardReportPanel />}
    </div>
  );
}

// ─── Delay Predictions Panel ──────────────────────────────────

function DelaysPanel() {
  const { data, isLoading } = useQuery<{ predictions: DelayPrediction[] }>({
    queryKey: ["/api/spmo/analytics/delay-predictions"],
    queryFn: () => customFetch("/api/spmo/analytics/delay-predictions"),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const items = data?.predictions ?? [];

  return (
    <Card className="p-5">
      <SectionHeader title="Predictive Delay Analysis" icon={Clock} count={items.length} />
      {items.length === 0 ? (
        <div className="p-8 text-center bg-secondary/20 rounded-lg"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" /><p className="text-sm text-muted-foreground">No projects predicted to be delayed.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2 text-left">Project</th>
              <th className="px-4 py-2 text-right">Progress</th>
              <th className="px-4 py-2 text-right">Velocity</th>
              <th className="px-4 py-2 text-right">Projected</th>
              <th className="px-4 py-2 text-right">Target</th>
              <th className="px-4 py-2 text-right">Delay</th>
              <th className="px-4 py-2 text-center">Trend</th>
              <th className="px-4 py-2 text-center">Risk</th>
            </tr></thead>
            <tbody className="divide-y divide-border/50">
              {items.map((p) => (
                <tr key={p.projectId} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 font-semibold">{p.projectName}</td>
                  <td className="px-4 py-3 text-right">{Math.round(p.currentProgress)}%</td>
                  <td className="px-4 py-3 text-right">{p.velocityPerDay.toFixed(2)}%/d</td>
                  <td className="px-4 py-3 text-right">{fmtDate(p.projectedCompletionDate)}</td>
                  <td className="px-4 py-3 text-right">{fmtDate(p.targetDate)}</td>
                  <td className="px-4 py-3 text-right font-bold text-destructive">+{p.predictedDelayDays}d</td>
                  <td className="px-4 py-3 text-center">
                    {p.trend === "decelerating" && <TrendingDown className="w-4 h-4 text-destructive inline" />}
                    {p.trend === "accelerating" && <TrendingUp className="w-4 h-4 text-green-500 inline" />}
                    {p.trend === "steady" && <ArrowRight className="w-4 h-4 text-muted-foreground inline" />}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusDot color={RISK_COLORS[p.riskLevel] ?? "#94A3B8"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Budget Forecast Panel ──────────────────────────────────────

function BudgetPanel() {
  const { data: cfgB } = useGetSpmoConfig();
  const currency = cfgB?.reportingCurrency ?? "SAR";
  const { data, isLoading } = useQuery<{ forecasts: BudgetForecast[] }>({
    queryKey: ["/api/spmo/analytics/budget-forecasts"],
    queryFn: () => customFetch("/api/spmo/analytics/budget-forecasts"),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const items = data?.forecasts ?? [];

  return (
    <Card className="p-5">
      <SectionHeader title="Budget Forecast" icon={DollarSign} count={items.length} />
      {items.length === 0 ? (
        <div className="p-8 text-center bg-secondary/20 rounded-lg"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" /><p className="text-sm text-muted-foreground">All projects on track with budget.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2 text-left">Project</th>
              <th className="px-4 py-2 text-right">Budget</th>
              <th className="px-4 py-2 text-right">Spent</th>
              <th className="px-4 py-2 text-right">Progress</th>
              <th className="px-4 py-2 text-right">CPI</th>
              <th className="px-4 py-2 text-right">Projected</th>
              <th className="px-4 py-2 text-right">Variance</th>
              <th className="px-4 py-2 text-center">Alert</th>
            </tr></thead>
            <tbody className="divide-y divide-border/50">
              {items.map((f) => (
                <tr key={f.projectId} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 font-semibold">{f.projectName}</td>
                  <td className="px-4 py-3 text-right">{currency} {fmtM(f.totalBudget)}</td>
                  <td className="px-4 py-3 text-right">{Math.round(f.spentPct)}%</td>
                  <td className="px-4 py-3 text-right">{Math.round(f.progress)}%</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={f.costPerformanceIndex < 0.9 ? "text-destructive" : f.costPerformanceIndex > 1.1 ? "text-green-600" : ""}>
                      {f.costPerformanceIndex.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{currency} {fmtM(f.projectedTotalSpend)}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    {f.alert === "overrun" ? <span className="text-destructive">+{currency} {fmtM(f.projectedOverrun)}</span> : <span className="text-warning">−{currency} {fmtM(f.projectedUnderspend)}</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.alert === "overrun" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {f.alert === "overrun" ? "OVERRUN" : "UNDERSPEND"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Stakeholders Panel ──────────────────────────────────────────

function StakeholdersPanel() {
  const { data, isLoading } = useQuery<{ alerts: StakeholderAlert[] }>({
    queryKey: ["/api/spmo/analytics/stakeholder-alerts"],
    queryFn: () => customFetch("/api/spmo/analytics/stakeholder-alerts"),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const items = data?.alerts ?? [];
  const grouped = {
    approval: items.filter((a) => a.type === "approval_bottleneck"),
    report: items.filter((a) => a.type === "missing_report"),
    department: items.filter((a) => a.type === "department_overdue"),
    inactive: items.filter((a) => a.type === "inactive_pm"),
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([type, alerts]) => {
        if (alerts.length === 0) return null;
        const titles: Record<string, string> = { approval: "Approval Bottlenecks", report: "Missing Weekly Reports", department: "Department Overdue", inactive: "Inactive Project Managers" };
        const icons: Record<string, React.ElementType> = { approval: Clock, report: FileText, department: AlertTriangle, inactive: Users };
        const Icon = icons[type] ?? AlertCircle;
        return (
          <Card key={type} className="p-5">
            <SectionHeader title={titles[type] ?? type} icon={Icon} count={alerts.length} />
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                  <StatusDot color={SEV_COLORS[a.severity] ?? "#94A3B8"} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{a.personName ?? a.entityName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.details}</div>
                    <div className="text-xs text-primary mt-1 font-medium">{a.actionRequired}</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{a.daysPending}d</div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {items.length === 0 && (
        <Card className="p-8 text-center"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" /><p className="text-sm text-muted-foreground">No stakeholder issues detected.</p></Card>
      )}
    </div>
  );
}

// ─── EVM Panel ──────────────────────────────────────────────────

function EvmPanel() {
  const { data, isLoading } = useQuery<{ metrics: EvmMetric[] }>({
    queryKey: ["/api/spmo/analytics/evm"],
    queryFn: () => customFetch("/api/spmo/analytics/evm"),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const items = data?.metrics ?? [];

  const evmHelp: Record<string, string> = {
    PV: "Planned Value — the budgeted cost of work that should have been completed by now based on the project schedule.",
    EV: "Earned Value — the budgeted cost of work that has actually been completed. Measures real progress in budget terms.",
    AC: "Actual Cost — the real cost incurred for the work completed so far.",
    CPI: "Cost Performance Index (EV / AC). >1.0 = under budget, <1.0 = over budget. E.g. 0.85 means you're getting 85 cents of value per dollar spent.",
    SPI: "Schedule Performance Index (EV / PV). >1.0 = ahead of schedule, <1.0 = behind schedule. E.g. 0.90 means only 90% of planned work is done.",
    CV: "Cost Variance (EV - AC). Positive = savings, negative = overspend.",
    SV: "Schedule Variance (EV - PV). Positive = ahead, negative = behind schedule.",
    EAC: "Estimate At Completion — projected total cost when the project finishes, based on current CPI trend.",
    Cost: "Cost status based on CPI threshold — over budget, on budget, or under budget.",
    Schedule: "Schedule status based on SPI threshold — behind, on track, or ahead of schedule.",
  };

  const EvmTh = ({ label, className }: { label: string; className?: string }) => (
    <th className={`px-3 py-2 ${className ?? ""}`}>
      <div className="flex items-center gap-1 group relative">
        <span>{label}</span>
        <span className="text-muted-foreground/50 cursor-help" title={evmHelp[label]}>
          <HelpCircle className="w-3 h-3" />
        </span>
      </div>
    </th>
  );

  return (
    <Card className="p-5">
      <SectionHeader title="Earned Value Management" icon={TrendingUp} count={items.length} />
      <p className="text-xs text-muted-foreground mb-3">
        EVM compares planned progress (PV) against actual work done (EV) and actual spend (AC) to measure cost and schedule efficiency. Hover column headers for explanations.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <th className="px-3 py-2 text-left">Project</th>
            <EvmTh label="PV" className="text-right" />
            <EvmTh label="EV" className="text-right" />
            <EvmTh label="AC" className="text-right" />
            <EvmTh label="CPI" className="text-right" />
            <EvmTh label="SPI" className="text-right" />
            <EvmTh label="CV" className="text-right" />
            <EvmTh label="SV" className="text-right" />
            <EvmTh label="EAC" className="text-right" />
            <EvmTh label="Cost" className="text-center" />
            <EvmTh label="Schedule" className="text-center" />
          </tr></thead>
          <tbody className="divide-y divide-border/50">
            {items.map((m) => (
              <tr key={m.projectId} className="hover:bg-secondary/20">
                <td className="px-3 py-3 font-semibold max-w-[200px] truncate">{m.projectName}</td>
                <td className="px-3 py-3 text-right font-mono text-xs">{fmtM(m.plannedValue)}</td>
                <td className="px-3 py-3 text-right font-mono text-xs">{fmtM(m.earnedValue)}</td>
                <td className="px-3 py-3 text-right font-mono text-xs">{fmtM(m.actualCost)}</td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  <span className={m.cpi < 0.9 ? "text-destructive font-bold" : m.cpi > 1.1 ? "text-green-600 font-bold" : ""}>{m.cpi.toFixed(2)}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  <span className={m.spi < 0.9 ? "text-destructive font-bold" : m.spi > 1.1 ? "text-green-600 font-bold" : ""}>{m.spi.toFixed(2)}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  <span className={m.costVariance < 0 ? "text-destructive" : "text-green-600"}>{m.costVariance >= 0 ? "+" : ""}{fmtM(m.costVariance)}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  <span className={m.scheduleVariance < 0 ? "text-destructive" : "text-green-600"}>{m.scheduleVariance >= 0 ? "+" : ""}{fmtM(m.scheduleVariance)}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs">{fmtM(m.estimateAtCompletion)}</td>
                <td className="px-3 py-3 text-center">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.costStatus === "over_budget" ? "bg-red-100 text-red-700" : m.costStatus === "under_budget" ? "bg-green-100 text-green-700" : "bg-secondary text-muted-foreground"}`}>
                    {m.costStatus.replace(/_/g, " ").toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.scheduleStatus === "behind" ? "bg-red-100 text-red-700" : m.scheduleStatus === "ahead" ? "bg-green-100 text-green-700" : "bg-secondary text-muted-foreground"}`}>
                    {m.scheduleStatus.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── AI Advisor Panel ────────────────────────────────────────────

function AdvisorPanel() {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<{ role: "user" | "ai"; text: string; actions?: string[]; links?: { label: string; path: string }[] }[]>([]);

  const [reportLoading, setReportLoading] = useState(false);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setConversation((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await customFetch("/api/spmo/analytics/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      }) as { answer: string; suggestedActions: string[]; relatedLinks: { label: string; path: string }[] };
      setConversation((prev) => [...prev, { role: "ai", text: res.answer, actions: res.suggestedActions, links: res.relatedLinks }]);
    } catch {
      toast({ variant: "destructive", title: "Advisor error", description: "Failed to get response. Check AI configuration." });
    } finally {
      setLoading(false);
    }
  };

  const handleBoardReport = async () => {
    setReportLoading(true);
    try {
      const res = await customFetch("/api/spmo/analytics/board-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }) as { executiveSummary: string; sections: { title: string; narrative: string; keyMetrics: { label: string; value: string }[]; attentionItems: string[] }[]; recommendations: string[] };
      setConversation((prev) => [
        ...prev,
        { role: "user", text: "Generate quarterly board report" },
        { role: "ai", text: `**Executive Summary**\n\n${res.executiveSummary}\n\n${res.sections.map((s) => `**${s.title}**\n${s.narrative}`).join("\n\n")}\n\n**Recommendations**\n${res.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}`, actions: res.recommendations },
      ]);
      toast({ title: "Board report generated" });
    } catch {
      toast({ variant: "destructive", title: "Report error", description: "Failed to generate. Check AI configuration." });
    } finally {
      setReportLoading(false);
    }
  };

  const QUICK_QUESTIONS = [
    "Which projects are most at risk of missing their 2026 targets?",
    "What are the top 3 budget concerns across the programme?",
    "Show me milestones stuck at the same progress for 30+ days",
    "Which departments are performing best and worst?",
    "What should the steering committee focus on this quarter?",
  ];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionHeader title="AI Programme Advisor" icon={Brain}>
          <button onClick={handleBoardReport} disabled={reportLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {reportLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            Generate Board Report
          </button>
        </SectionHeader>

        {/* Quick questions */}
        {conversation.length === 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Quick questions:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => { setQuestion(q); }} className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        {conversation.length > 0 && (
          <div className="space-y-4 mb-4 max-h-[500px] overflow-y-auto pr-2">
            {conversation.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
                <div className={`max-w-[85%] rounded-xl px-4 py-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/70 border border-border"}`}>
                  <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/30">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Suggested Actions</p>
                      <ul className="space-y-1">
                        {msg.actions.map((a, j) => <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5"><Zap className="w-3 h-3 mt-0.5 shrink-0 text-primary" />{a}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
            placeholder="Ask anything about the programme…"
            className="flex-1 text-sm border border-border rounded-lg px-4 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={handleAsk} disabled={loading || !question.trim()} className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-40 hover:bg-primary/90 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── Scenario Simulation Panel ──────────────────────────────────

interface ScenarioResultData {
  input: { type: string; projectId: number; delayDays?: number; budgetReduction?: number };
  before: { programmeProgress: number; affectedPillarProgress: { pillarId: number; pillarName: string; progress: number }[]; affectedInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number }[] };
  after: { programmeProgress: number; affectedPillarProgress: { pillarId: number; pillarName: string; progress: number }[]; affectedInitiativeProgress: { initiativeId: number; initiativeName: string; progress: number }[] };
  progressImpact?: {
    projectName: string;
    currentProgress: number;
    plannedProgressAtOriginalTarget: number;
    simulatedProgressAtOriginalTarget: number;
    progressGapAtTarget: number;
    originalTargetDate: string;
    newTargetDate: string;
    daysDelayed: number;
    milestoneBreakdown: {
      name: string;
      weight: number;
      dueDate: string | null;
      newDueDate: string | null;
      currentProgress: number;
      willBeCompleteByOriginalTarget: boolean;
      simulatedProgress: number;
    }[];
  };
  cancelImpact?: {
    projectName: string;
    projectBudget: number;
    projectBudgetSpent: number;
    projectProgress: number;
    projectMilestoneCount: number;
    projectRiskCount: number;
    initiativeName: string;
    initiativeProgressBefore: number;
    initiativeProgressAfter: number;
    initiativeProjectCount: number;
    pillarName: string;
    pillarProgressBefore: number;
    pillarProgressAfter: number;
    programmeProgressBefore: number;
    programmeProgressAfter: number;
    budgetFreed: number;
    sunkenCost: number;
  };
  cascadeImpact: { milestoneId: number; milestoneName: string; projectName: string; shiftDays: number; newDueDate: string; currentProgress?: number; plannedProgress?: number }[];
  financialImpact?: { originalBudget: number; newBudget: number; actualSpent: number; overSpent: boolean; originalCpi: number; newCpi: number; originalEac: number; newEac: number };
  summary: string;
}

function ScenarioPanel() {
  const { toast } = useToast();
  const { data: cfgS } = useGetSpmoConfig();
  const currency = cfgS?.reportingCurrency ?? "SAR";
  const [scenarioType, setScenarioType] = useState<"delay" | "cancel" | "budget_cut">("delay");
  const [projectId, setProjectId] = useState("");
  const [delayDays, setDelayDays] = useState("90");
  const [budgetReduction, setBudgetReduction] = useState("20");
  const [adjustWeight, setAdjustWeight] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScenarioResultData | null>(null);

  // Fetch projects for the dropdown
  const { data: projectsData } = useQuery<{ projects: { id: number; name: string }[] }>({
    queryKey: ["/api/spmo/projects"],
    queryFn: () => customFetch("/api/spmo/projects"),
    staleTime: 60_000,
  });
  const projects = projectsData?.projects ?? [];

  const handleSimulate = async () => {
    const pid = parseInt(projectId);
    if (!pid) { toast({ variant: "destructive", title: "Select a project" }); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { type: scenarioType, projectId: pid };
      if (scenarioType === "delay") body.delayDays = parseInt(delayDays) || 90;
      if (scenarioType === "budget_cut") {
        body.budgetReduction = parseInt(budgetReduction) || 20;
        body.adjustWeight = adjustWeight;
      }
      const res = await customFetch("/api/spmo/analytics/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as ScenarioResultData;
      setResult(res);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Simulation failed", description: err.message ?? "Check console" });
    } finally {
      setLoading(false);
    }
  };

  const SCENARIO_LABELS: Record<string, { label: string; desc: string; color: string }> = {
    delay: { label: "Delay Project", desc: "What if this project slips by N days?", color: "#DC2626" },
    cancel: { label: "Cancel Project", desc: "What if we remove this project entirely?", color: "#6B7280" },
    budget_cut: { label: "Cut Budget", desc: "What if we reduce budget by N%?", color: "#D97706" },
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionHeader title="Scenario Simulation" icon={Play} />
        <p className="text-sm text-muted-foreground mb-4">Test the impact of changes before they happen. Select a scenario, pick a project, and see the cascade effect across the programme.</p>

        {/* Scenario type selector */}
        <div className="flex gap-2 mb-4">
          {(["delay", "cancel", "budget_cut"] as const).map((t) => (
            <button key={t} onClick={() => { setScenarioType(t); setResult(null); }}
              className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${scenarioType === t ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border text-muted-foreground hover:bg-secondary"}`}>
              {SCENARIO_LABELS[t].label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mb-3">{SCENARIO_LABELS[scenarioType].desc}</p>

        {/* Input form */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background">
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {scenarioType === "delay" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Delay (days)</label>
              <input type="number" value={delayDays} onChange={(e) => setDelayDays(e.target.value)} min={1} max={365} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" />
            </div>
          )}
          {scenarioType === "budget_cut" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Reduction (%)</label>
              <input type="number" value={budgetReduction} onChange={(e) => setBudgetReduction(e.target.value)} min={1} max={100} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" />
            </div>
          )}
          <div className="flex items-end">
            <button onClick={handleSimulate} disabled={loading || !projectId} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Simulate
            </button>
          </div>
        </div>

        {/* Weight adjustment advisory for budget cuts */}
        {scenarioType === "budget_cut" && (
          <div className="bg-warning/5 border border-warning/20 rounded-lg px-4 py-3 mt-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={adjustWeight} onChange={(e) => setAdjustWeight(e.target.checked)} className="mt-1 accent-primary w-4 h-4" />
              <div>
                <span className="text-sm font-semibold text-foreground">Also reduce strategic weight?</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  If yes, the project's contribution to initiative and pillar progress will decrease proportionally to the budget cut. This reflects a strategic deprioritisation — not just a financial adjustment.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {adjustWeight
                    ? "⚠ Progress will shift because the project carries less strategic weight in the portfolio."
                    : "Progress stays unchanged — only financial metrics (CPI, EAC) are affected."
                  }
                </p>
              </div>
            </label>
          </div>
        )}
      </Card>

      {/* Results */}
      {result && (() => {
        const progDelta = result.after.programmeProgress - result.before.programmeProgress;
        const selectedProject = projects.find((p) => p.id === result.input.projectId);
        const delayD = result.input.delayDays ?? 0;
        const hasCascade = result.cascadeImpact.length > 0;
        const hasProgImpact = Math.abs(progDelta) >= 0.05;

        return (
        <div className="space-y-4">
          {/* Summary banner */}
          <Card className={`p-5 border-l-4 ${hasProgImpact || hasCascade ? "border-l-destructive bg-destructive/5" : "border-l-warning bg-warning/5"}`}>
            <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Delay Impact Analysis
            </h3>
            <p className="text-sm text-foreground">{result.summary}</p>
          </Card>

          {/* ═══ CANCEL IMPACT ═══ */}
          {result.cancelImpact && (() => {
            const ci = result.cancelImpact;
            const progDrop = ci.programmeProgressBefore - ci.programmeProgressAfter;
            const initDrop = ci.initiativeProgressBefore - ci.initiativeProgressAfter;
            const pillarDrop = ci.pillarProgressBefore - ci.pillarProgressAfter;
            const fmtBudget = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
            return (
              <div className="space-y-4">
                {/* Strategy impact */}
                <Card className="p-5 border-l-4 border-l-destructive">
                  <h4 className="text-sm font-bold mb-3">Strategy Impact</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Programme</div>
                      <div className="text-lg font-bold">{ci.programmeProgressBefore}%</div>
                      <ArrowRight className="w-3 h-3 mx-auto text-destructive my-0.5 rotate-90" />
                      <div className="text-lg font-bold text-destructive">{ci.programmeProgressAfter}%</div>
                      {progDrop > 0 && <div className="text-xs text-destructive font-bold">-{progDrop.toFixed(1)}pp</div>}
                    </div>
                    <div className="text-center border-x border-border px-3">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Pillar: {ci.pillarName.slice(0, 20)}</div>
                      <div className="text-lg font-bold">{ci.pillarProgressBefore}%</div>
                      <ArrowRight className="w-3 h-3 mx-auto text-destructive my-0.5 rotate-90" />
                      <div className="text-lg font-bold text-destructive">{ci.pillarProgressAfter}%</div>
                      {pillarDrop > 0 && <div className="text-xs text-destructive font-bold">-{pillarDrop.toFixed(1)}pp</div>}
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Initiative: {ci.initiativeName.slice(0, 20)}</div>
                      <div className="text-lg font-bold">{ci.initiativeProgressBefore}%</div>
                      <ArrowRight className="w-3 h-3 mx-auto text-destructive my-0.5 rotate-90" />
                      <div className="text-lg font-bold text-destructive">{ci.initiativeProgressAfter}%</div>
                      {initDrop > 0 && <div className="text-xs text-destructive font-bold">-{initDrop.toFixed(1)}pp</div>}
                      <div className="text-[10px] text-muted-foreground mt-1">{ci.initiativeProjectCount - 1} remaining project{ci.initiativeProjectCount - 1 !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                </Card>

                {/* Financial impact */}
                <Card className="p-5">
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-warning" />
                    Financial Impact
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-secondary/50 rounded-lg px-3 py-2.5 text-center">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Project Budget</div>
                      <div className="text-sm font-bold">{fmtBudget(ci.projectBudget)}</div>
                    </div>
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2.5 text-center">
                      <div className="text-[10px] font-bold uppercase text-destructive">Sunken Cost</div>
                      <div className="text-sm font-bold text-destructive">{fmtBudget(ci.sunkenCost)}</div>
                      <div className="text-[10px] text-muted-foreground">Already spent, non-recoverable</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-center">
                      <div className="text-[10px] font-bold uppercase text-green-700">Budget Freed</div>
                      <div className="text-sm font-bold text-green-700">{fmtBudget(ci.budgetFreed)}</div>
                      <div className="text-[10px] text-muted-foreground">Available to reallocate</div>
                    </div>
                    <div className="bg-secondary/50 rounded-lg px-3 py-2.5 text-center">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Spend Ratio</div>
                      <div className="text-sm font-bold">{ci.projectBudget > 0 ? Math.round((ci.sunkenCost / ci.projectBudget) * 100) : 0}%</div>
                      <div className="text-[10px] text-muted-foreground">of budget already consumed</div>
                    </div>
                  </div>
                </Card>

                {/* What gets cancelled */}
                <Card className="p-5 bg-muted/30">
                  <h4 className="text-sm font-bold mb-2">What Gets Cancelled</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
                    <div>
                      <div className="text-xl font-bold">{ci.projectMilestoneCount}</div>
                      <div className="text-xs text-muted-foreground">Milestones</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{ci.projectRiskCount}</div>
                      <div className="text-xs text-muted-foreground">Open Risks</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{ci.projectProgress}%</div>
                      <div className="text-xs text-muted-foreground">Progress Lost</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-destructive">{fmtBudget(ci.sunkenCost)}</div>
                      <div className="text-xs text-muted-foreground">Wasted Investment</div>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* ═══ DELAY-SPECIFIC SECTIONS ═══ */}
          {/* Progress Impact — the key insight */}
          {result.progressImpact && (
            <Card className="p-5 border-l-4 border-l-warning">
              <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                Progress Shortfall at Original Deadline — {result.progressImpact.projectName}
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                By the original target date ({result.progressImpact.originalTargetDate}), planned progress should be <span className="font-bold text-primary">{result.progressImpact.plannedProgressAtOriginalTarget}%</span>.
                With a {result.progressImpact.daysDelayed}-day delay, only <span className="font-bold text-destructive">{result.progressImpact.simulatedProgressAtOriginalTarget}%</span> will be achieved — a <span className="font-bold text-destructive">{result.progressImpact.progressGapAtTarget}% gap</span> that cascades across the strategy.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="bg-secondary/50 rounded-lg px-3 py-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Current Progress</div>
                  <div className="text-xl font-bold">{result.progressImpact.currentProgress}%</div>
                  <div className="text-[10px] text-muted-foreground">Work completed today</div>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Planned at Deadline</div>
                  <div className="text-xl font-bold text-primary">{result.progressImpact.plannedProgressAtOriginalTarget}%</div>
                  <div className="text-[10px] text-muted-foreground">Should be at by {result.progressImpact.originalTargetDate}</div>
                </div>
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-destructive">Simulated at Deadline</div>
                  <div className="text-xl font-bold text-destructive">{result.progressImpact.simulatedProgressAtOriginalTarget}%</div>
                  <div className="text-[10px] text-muted-foreground">What will actually be done</div>
                </div>
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-destructive">Progress Gap</div>
                  <div className="text-xl font-bold text-destructive">-{result.progressImpact.progressGapAtTarget}%</div>
                  <div className="text-[10px] text-destructive font-semibold">Shortfall vs plan</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mb-4">
                <span>Original: <span className="font-mono">{result.progressImpact.originalTargetDate}</span></span>
                <ArrowRight className="w-3 h-3 text-destructive" />
                <span>New: <span className="font-mono font-bold text-destructive">{result.progressImpact.newTargetDate}</span></span>
                <span className="text-destructive font-bold">(+{result.progressImpact.daysDelayed} days)</span>
              </div>

              {/* Milestone-by-milestone breakdown */}
              {result.progressImpact.milestoneBreakdown && result.progressImpact.milestoneBreakdown.length > 0 && (
                <div className="mt-1">
                  <h5 className="text-xs font-bold uppercase text-muted-foreground mb-2">Milestone-by-Milestone at Original Deadline</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-secondary/50 text-[10px] uppercase text-muted-foreground">
                        <th className="px-2 py-1.5 text-left">Milestone</th>
                        <th className="px-2 py-1.5 text-right">Wt%</th>
                        <th className="px-2 py-1.5 text-right">Due</th>
                        <th className="px-2 py-1.5 text-right">New Due</th>
                        <th className="px-2 py-1.5 text-right">Now</th>
                        <th className="px-2 py-1.5 text-right">At Deadline</th>
                        <th className="px-2 py-1.5 text-center">Status</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border/30">
                        {result.progressImpact.milestoneBreakdown.map((ms, i) => (
                          <tr key={i} className={`${ms.willBeCompleteByOriginalTarget ? "" : "bg-destructive/5"}`}>
                            <td className="px-2 py-1.5 font-semibold truncate max-w-[200px]">{ms.name}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{ms.weight.toFixed(0)}%</td>
                            <td className="px-2 py-1.5 text-right font-mono">{ms.dueDate ? fmtDate(ms.dueDate) : "—"}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-destructive">{ms.newDueDate ? fmtDate(ms.newDueDate) : "—"}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{ms.currentProgress}%</td>
                            <td className="px-2 py-1.5 text-right font-mono font-bold">
                              <span className={ms.simulatedProgress >= 100 ? "text-green-600" : "text-destructive"}>{ms.simulatedProgress}%</span>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {ms.willBeCompleteByOriginalTarget
                                ? <span className="text-[9px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">DONE</span>
                                : <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">INCOMPLETE</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Key metrics row — delay/budget only */}
          {scenarioType !== "cancel" && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4 text-center border-destructive/30">
                <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Target Date Shift</div>
                <div className="text-xl font-bold text-destructive">+{delayD} days</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Milestones Pushed</div>
                <div className="text-xl font-bold text-warning">{result.cascadeImpact.length}</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Projects Impacted</div>
                <div className="text-xl font-bold">{new Set(result.cascadeImpact.map((c) => c.projectName)).size + 1}</div>
              </Card>
            </div>
          )}

          {/* Strategy Cascade Impact — always show for delay */}
          {scenarioType === "delay" && result.progressImpact && (() => {
            const progBefore = result.before.programmeProgress;
            const progAfter = result.after.programmeProgress;
            const progDelta2 = round1(progAfter - progBefore);
            const gap = result.progressImpact!.progressGapAtTarget;

            // Find the initiative and pillar by matching before/after arrays
            // Use index 0 as fallback — the affected initiative is always included
            const initPairs = result.after.affectedInitiativeProgress?.map((ai) => {
              const bi = result.before.affectedInitiativeProgress?.find((b) => b.initiativeId === ai.initiativeId);
              return { after: ai, before: bi, delta: round1(ai.progress - (bi?.progress ?? ai.progress)) };
            }) ?? [];
            const affectedInitPair = initPairs.find((p) => p.delta !== 0) ?? initPairs[0];

            const pillarPairs = result.after.affectedPillarProgress.map((ap) => {
              const bp = result.before.affectedPillarProgress.find((b) => b.pillarId === ap.pillarId);
              return { after: ap, before: bp, delta: round1(ap.progress - (bp?.progress ?? ap.progress)) };
            });
            const affectedPillarPair = pillarPairs.find((p) => p.delta !== 0) ?? pillarPairs.find((p) => p.before != null);

            return (
              <Card className="p-5 border-l-4 border-l-destructive">
                <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  Strategy Cascade Impact
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  The {result.progressImpact!.daysDelayed}-day delay creates a <span className="font-bold text-destructive">{gap}%</span> progress gap in the project, which cascades through the strategy hierarchy:
                </p>
                <div className="space-y-3">
                  {/* Project */}
                  <div className="flex items-center gap-3">
                    <span className="w-24 text-[10px] font-bold uppercase text-muted-foreground shrink-0">Project</span>
                    <div className="flex-1 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-sm font-semibold truncate">{result.progressImpact!.projectName}</span>
                      <span className="text-sm font-bold text-destructive shrink-0 ml-2">
                        {result.progressImpact!.currentProgress}% now → {result.progressImpact!.simulatedProgressAtOriginalTarget}% at deadline <span className="bg-destructive/10 px-1 rounded">(-{gap}%)</span>
                      </span>
                    </div>
                  </div>
                  {/* Initiative */}
                  {affectedInitPair && (
                    <div className="flex items-center gap-3">
                      <span className="w-24 text-[10px] font-bold uppercase text-muted-foreground shrink-0">Initiative</span>
                      <div className="flex-1 bg-warning/5 border border-warning/20 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-sm font-semibold truncate">{affectedInitPair.after.initiativeName}</span>
                        <span className="text-sm shrink-0 ml-2">
                          <span className="font-mono">{(affectedInitPair.before?.progress ?? 0).toFixed(1)}%</span>
                          <ArrowRight className="w-3 h-3 inline mx-1 text-destructive" />
                          <span className="font-mono font-bold">{affectedInitPair.after.progress.toFixed(1)}%</span>
                          <span className="text-xs text-destructive font-bold ml-1">({affectedInitPair.delta >= 0 ? "+" : ""}{affectedInitPair.delta})</span>
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Pillar */}
                  {affectedPillarPair && (
                    <div className="flex items-center gap-3">
                      <span className="w-24 text-[10px] font-bold uppercase text-muted-foreground shrink-0">Pillar</span>
                      <div className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-sm font-semibold truncate">{affectedPillarPair.after.pillarName}</span>
                        <span className="text-sm shrink-0 ml-2">
                          <span className="font-mono">{(affectedPillarPair.before?.progress ?? 0).toFixed(1)}%</span>
                          <ArrowRight className="w-3 h-3 inline mx-1 text-destructive" />
                          <span className="font-mono font-bold">{affectedPillarPair.after.progress.toFixed(1)}%</span>
                          <span className="text-xs text-destructive font-bold ml-1">({affectedPillarPair.delta >= 0 ? "+" : ""}{affectedPillarPair.delta})</span>
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Programme */}
                  <div className="flex items-center gap-3">
                    <span className="w-24 text-[10px] font-bold uppercase text-muted-foreground shrink-0">Programme</span>
                    <div className="flex-1 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">Overall Strategy Progress</span>
                      <span className="text-sm shrink-0 ml-2">
                        <span className="font-mono">{progBefore.toFixed(1)}%</span>
                        <ArrowRight className="w-3 h-3 inline mx-1 text-destructive" />
                        <span className="font-mono font-bold">{progAfter.toFixed(1)}%</span>
                        <span className="text-xs text-destructive font-bold ml-1">({progDelta2 >= 0 ? "+" : ""}{progDelta2})</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* Timeline cascade — the most important part */}
          {hasCascade && (
            <Card className="p-5 border-l-4 border-l-warning">
              <h4 className="text-sm font-bold mb-1 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-warning" />
                Dependency Cascade — {result.cascadeImpact.length} milestone{result.cascadeImpact.length > 1 ? "s" : ""} pushed
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                These milestones in dependent projects will have their due dates shifted because they depend on the delayed project.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 text-left">Milestone</th>
                    <th className="px-4 py-2 text-left">Project</th>
                    <th className="px-4 py-2 text-right">Progress</th>
                    <th className="px-4 py-2 text-right">Days Pushed</th>
                    <th className="px-4 py-2 text-right">New Due Date</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/50">
                    {result.cascadeImpact.map((c) => (
                      <tr key={c.milestoneId} className="hover:bg-secondary/20">
                        <td className="px-4 py-2 font-semibold">{c.milestoneName}</td>
                        <td className="px-4 py-2 text-muted-foreground">{c.projectName}</td>
                        <td className="px-4 py-2 text-right text-xs">
                          <span className="font-mono">{c.currentProgress ?? 0}%</span>
                          {c.plannedProgress != null && c.plannedProgress > (c.currentProgress ?? 0) && (
                            <span className="text-destructive ml-1">(plan {c.plannedProgress}%)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right"><span className="font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded">+{c.shiftDays}d</span></td>
                        <td className="px-4 py-2 text-right font-mono">{fmtDate(c.newDueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* No cascade — but still has milestone impact */}
          {!hasCascade && scenarioType === "delay" && (
            <Card className="p-5 bg-muted/30">
              <p className="text-sm text-muted-foreground">
                No downstream dependencies to other projects found. The delay impact is contained within this project
                but still affects initiative, pillar, and programme progress as shown in the shortfall analysis above.
              </p>
            </Card>
          )}

          {/* Financial impact for budget cut scenarios */}
          {result.financialImpact && (
            <Card className="p-5">
              <SectionHeader title="Financial Impact" icon={DollarSign} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-secondary/50 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Original Budget</div>
                  <div className="text-sm font-bold">{currency} {fmtM(result.financialImpact.originalBudget)}</div>
                </div>
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">New Budget</div>
                  <div className="text-sm font-bold text-destructive">{currency} {fmtM(result.financialImpact.newBudget)}</div>
                </div>
                <div className={`rounded-lg px-3 py-2.5 ${result.financialImpact.overSpent ? "bg-destructive/10 border border-destructive/30" : "bg-secondary/50"}`}>
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Actual Spent</div>
                  <div className={`text-sm font-bold ${result.financialImpact.overSpent ? "text-destructive" : ""}`}>{currency} {fmtM(result.financialImpact.actualSpent)}</div>
                  {result.financialImpact.overSpent && <div className="text-[10px] text-destructive font-bold mt-0.5">⚠ EXCEEDS NEW BUDGET</div>}
                </div>
                <div className="bg-secondary/50 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">EAC Change</div>
                  <div className="text-sm font-bold">{currency} {fmtM(result.financialImpact.originalEac)} → {fmtM(result.financialImpact.newEac)}</div>
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <span className="text-xs text-muted-foreground">CPI: </span>
                  <span className={`text-sm font-bold ${result.financialImpact.newCpi < 0.9 ? "text-destructive" : ""}`}>
                    {result.financialImpact.originalCpi} → {result.financialImpact.newCpi}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 italic">Note: Progress percentages are not affected by budget changes — work completed remains the same.</p>
            </Card>
          )}
        </div>
        );
      })()}
    </div>
  );
}

// ─── Board Report Panel ──────────────────────────────────────────

interface BoardReportData {
  generatedAt: string;
  periodLabel: string;
  executiveSummary: string;
  sections: { title: string; narrative: string; keyMetrics: { label: string; value: string; trend?: string }[]; attentionItems: string[] }[];
  recommendations: string[];
}

function BoardReportPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BoardReportData | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await customFetch("/api/spmo/analytics/board-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }) as BoardReportData;
      setReport(res);
      toast({ title: "Board report generated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Generation failed", description: err.message ?? "Check AI configuration (ANTHROPIC_API_KEY)" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!report && (
        <Card className="p-10 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-bold mb-2">Quarterly Board Report</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Generate an AI-written executive board report in McKinsey/BCG format. Includes programme progress, budget analysis, risk landscape, KPI performance, and strategic recommendations.
          </p>
          <button onClick={handleGenerate} disabled={loading} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            {loading ? "Generating Report…" : "Generate Board Report"}
          </button>
          {loading && <p className="text-xs text-muted-foreground mt-3">This may take 15-30 seconds as the AI analyzes your full programme data.</p>}
        </Card>
      )}

      {report && (
        <div className="space-y-4">
          {/* Header */}
          <Card className="p-5 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-bold">Board Report — {report.periodLabel}</h3>
                <p className="text-xs text-muted-foreground">Generated {new Date(report.generatedAt).toLocaleString()}</p>
              </div>
              <button onClick={handleGenerate} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Regenerate
              </button>
            </div>
          </Card>

          {/* Executive Summary */}
          <Card className="p-5 border-l-4 border-l-primary">
            <h4 className="text-sm font-bold mb-3">Executive Summary</h4>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{report.executiveSummary}</p>
          </Card>

          {/* Sections */}
          {report.sections.map((section, i) => (
            <Card key={i} className="p-5">
              <h4 className="text-sm font-bold mb-3">{section.title}</h4>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap mb-4">{section.narrative}</p>

              {section.keyMetrics.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {section.keyMetrics.map((m, j) => (
                    <div key={j} className="bg-secondary/50 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">{m.label}</div>
                      <div className="text-sm font-bold mt-0.5">{m.value}</div>
                      {m.trend && <div className={`text-[10px] ${m.trend === "up" ? "text-green-600" : m.trend === "down" ? "text-destructive" : "text-muted-foreground"}`}>{m.trend === "up" ? "↑" : m.trend === "down" ? "↓" : "→"} {m.trend}</div>}
                    </div>
                  ))}
                </div>
              )}

              {section.attentionItems.length > 0 && (
                <div className="bg-warning/5 border border-warning/20 rounded-lg px-4 py-3">
                  <div className="text-xs font-bold text-warning mb-1.5">⚠ Attention Items</div>
                  <ul className="space-y-1">
                    {section.attentionItems.map((item, k) => (
                      <li key={k} className="text-xs text-foreground/80 flex items-start gap-2"><span className="text-warning mt-0.5">•</span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <Card className="p-5 bg-primary/5 border-primary/20">
              <h4 className="text-sm font-bold mb-3">Strategic Recommendations</h4>
              <ol className="space-y-2">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                    <span className="text-foreground/90 pt-0.5">{r}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Weekly Digest Panel ─────────────────────────────────────────

interface ProjectDigest {
  projectId: number; projectName: string; projectCode: string | null;
  departmentName: string | null; ownerName: string | null;
  currentProgress: number; progressLastWeek: number; progressDelta: number; velocityPerDay: number;
  healthStatus: string; computedStatus: { status: string; reason: string } | null;
  milestonesCompleted: { id: number; name: string }[];
  milestonesSubmitted: { id: number; name: string }[];
  milestonesOverdue: { id: number; name: string; daysOverdue: number }[];
  milestonesDueSoon: { id: number; name: string; daysLeft: number }[];
  budget: number; spent: number; spentPct: number;
  activeRiskCount: number; highRiskCount: number; newRisksThisWeek: number;
  weeklyReportSubmitted: boolean;
  weeklyReportAchievements: string | null; weeklyReportNextSteps: string | null;
  flags: string[];
}

interface WeeklyDigestData {
  generatedAt: string; weekLabel: string;
  programmeProgress: number; programmeProgressDelta: number;
  totalProjects: number; activeProjects: number;
  milestonesCompletedThisWeek: number; milestonesSubmittedThisWeek: number;
  totalOverdueMilestones: number; projectsWithNoProgress: number;
  projectsAtRisk: number; projectsDelayed: number;
  totalBudget: number; totalSpent: number;
  projects: ProjectDigest[];
  highlights: string[]; concerns: string[];
}

function WeeklyDigestPanel() {
  const { data, isLoading } = useQuery<WeeklyDigestData>({
    queryKey: ["/api/spmo/analytics/weekly-digest"],
    queryFn: () => customFetch("/api/spmo/analytics/weekly-digest"),
    staleTime: 120_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const SC: Record<string, string> = { on_track: "#16A34A", at_risk: "#D97706", delayed: "#DC2626", completed: "#2563EB", not_started: "#94A3B8" };

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div><h3 className="text-lg font-bold">{data.weekLabel}</h3><p className="text-xs text-muted-foreground">Generated {new Date(data.generatedAt).toLocaleString()}</p></div>
          <div className="text-right">
            <div className="text-2xl font-bold">{data.programmeProgress.toFixed(1)}%</div>
            <div className={`text-sm font-semibold ${data.programmeProgressDelta >= 0 ? "text-green-600" : "text-destructive"}`}>{data.programmeProgressDelta >= 0 ? "+" : ""}{data.programmeProgressDelta.toFixed(1)}pp this week</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Milestones Completed", value: data.milestonesCompletedThisWeek, color: "text-green-600" },
            { label: "Overdue", value: data.totalOverdueMilestones, color: "text-destructive" },
            { label: "No Progress", value: data.projectsWithNoProgress, color: "text-warning" },
            { label: "At Risk / Delayed", value: `${data.projectsAtRisk} / ${data.projectsDelayed}`, color: "" },
          ].map((m) => (
            <div key={m.label} className="bg-background rounded-lg px-3 py-2 border border-border">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">{m.label}</div>
              <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.highlights.length > 0 && (<Card className="p-4 border-l-4 border-l-green-500"><h4 className="text-xs font-bold uppercase text-green-700 mb-2">Highlights</h4><ul className="space-y-1">{data.highlights.map((h, i) => <li key={i} className="text-sm flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />{h}</li>)}</ul></Card>)}
        {data.concerns.length > 0 && (<Card className="p-4 border-l-4 border-l-destructive"><h4 className="text-xs font-bold uppercase text-destructive mb-2">Concerns</h4><ul className="space-y-1">{data.concerns.map((c, i) => <li key={i} className="text-sm flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />{c}</li>)}</ul></Card>)}
      </div>
      <div className="space-y-3">
        {data.projects.map((p) => (
          <Card key={p.projectId} className="p-4" style={{ borderLeftWidth: 4, borderLeftColor: SC[p.healthStatus] ?? "#94A3B8" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {p.projectCode && <span className="text-[10px] font-mono text-muted-foreground">{p.projectCode}</span>}
                  <span className="text-sm font-bold truncate">{p.projectName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: (SC[p.healthStatus] ?? "#94A3B8") + "18", color: SC[p.healthStatus] ?? "#94A3B8" }}>{p.healthStatus?.replace(/_/g, " ").toUpperCase()}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.ownerName ?? "—"} · {p.departmentName ?? "—"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold">{Math.round(p.currentProgress)}%</div>
                <div className={`text-xs font-semibold ${p.progressDelta > 0 ? "text-green-600" : p.progressDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>{p.progressDelta > 0 ? "+" : ""}{p.progressDelta.toFixed(1)}pp</div>
                {p.velocityPerDay > 0 && <div className="text-[10px] text-muted-foreground">{p.velocityPerDay.toFixed(2)}%/day</div>}
              </div>
            </div>
            <div className="flex gap-4 mt-2 text-xs flex-wrap">
              {p.milestonesCompleted.length > 0 && <span className="text-green-600">✓ {p.milestonesCompleted.length} completed</span>}
              {p.milestonesSubmitted.length > 0 && <span className="text-blue-600">⏳ {p.milestonesSubmitted.length} awaiting approval</span>}
              {p.milestonesOverdue.length > 0 && <span className="text-destructive">⚠ {p.milestonesOverdue.length} overdue</span>}
              {p.milestonesDueSoon.length > 0 && <span className="text-warning">📅 {p.milestonesDueSoon.length} due this week</span>}
            </div>
            {p.weeklyReportSubmitted && p.weeklyReportAchievements && (
              <div className="mt-2 bg-secondary/30 rounded-lg px-3 py-2">
                <div className="text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Achievements</div>
                <div className="text-xs text-foreground/80">{p.weeklyReportAchievements}</div>
                {p.weeklyReportNextSteps && (<><div className="text-[10px] font-bold text-muted-foreground uppercase mt-1.5 mb-0.5">Next Steps</div><div className="text-xs text-foreground/80">{p.weeklyReportNextSteps}</div></>)}
              </div>
            )}
            {p.flags.length > 0 && (<div className="flex gap-1.5 mt-2 flex-wrap">{p.flags.map((f, i) => (<span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 font-medium">{f}</span>))}</div>)}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Anomaly Detection Panel ─────────────────────────────────────

interface AnomalyItem {
  type: string; severity: string;
  projectId: number; projectName: string;
  entityType: string; entityId: number; entityName: string;
  detectedAt: string; description: string; evidence: string; suggestedAction: string;
}

const ANOMALY_LABELS: Record<string, { label: string; icon: string }> = {
  progress_spike: { label: "Progress Spike", icon: "⚡" },
  progress_stagnant: { label: "Stagnant Progress", icon: "🔴" },
  budget_burn_mismatch: { label: "Budget Mismatch", icon: "💰" },
  duplicate_report: { label: "Duplicate Report", icon: "📋" },
  ghost_project: { label: "Ghost Project", icon: "👻" },
  velocity_collapse: { label: "Velocity Collapse", icon: "📉" },
  risk_ignored: { label: "Ignored Risk", icon: "🛑" },
  approval_stale: { label: "Stale Approval", icon: "⏰" },
  weight_gaming: { label: "Weight Gaming", icon: "🎮" },
  weekend_warrior: { label: "Weekend Updates", icon: "📅" },
};

function AnomalyPanel() {
  const { data, isLoading } = useQuery<{ anomalies: AnomalyItem[]; count: number; critical: number }>({
    queryKey: ["/api/spmo/analytics/anomalies"],
    queryFn: () => customFetch("/api/spmo/analytics/anomalies"),
    staleTime: 120_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const anomalies = data?.anomalies ?? [];
  const grouped = anomalies.reduce<Record<string, AnomalyItem[]>>((acc, a) => { (acc[a.severity] ??= []).push(a); return acc; }, {});
  const SEV_ORDER = ["critical", "high", "medium", "low"];
  const SS: Record<string, { bg: string; border: string; text: string; label: string }> = {
    critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "Critical" },
    high: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", label: "High" },
    medium: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", label: "Medium" },
    low: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", label: "Low" },
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionHeader title="Anomaly Detection" icon={AlertTriangle} count={anomalies.length} />
        <p className="text-sm text-muted-foreground mb-4">Automated pattern detection across all projects. Flags suspicious data, stagnant progress, gaming patterns, and process violations.</p>
        <div className="flex gap-2 mb-4 flex-wrap">
          {SEV_ORDER.map((sev) => { const count = grouped[sev]?.length ?? 0; if (count === 0) return null; const s = SS[sev]; return (<div key={sev} className={`${s.bg} ${s.border} border rounded-full px-3 py-1 flex items-center gap-1.5`}><span className={`text-xs font-bold ${s.text}`}>{count}</span><span className={`text-[10px] font-semibold ${s.text}`}>{s.label}</span></div>); })}
        </div>
      </Card>
      {anomalies.length === 0 && (<Card className="p-8 text-center"><CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-3" /><h3 className="text-lg font-bold">No Anomalies Detected</h3><p className="text-sm text-muted-foreground mt-1">All projects show normal patterns.</p></Card>)}
      {SEV_ORDER.map((sev) => { const items = grouped[sev]; if (!items || items.length === 0) return null; const s = SS[sev]; return (
        <Card key={sev} className="p-5"><h4 className={`text-xs font-bold uppercase ${s.text} mb-3`}>{s.label} ({items.length})</h4><div className="space-y-3">{items.map((a, i) => { const t = ANOMALY_LABELS[a.type] ?? { label: a.type, icon: "⚠" }; return (
          <div key={i} className={`${s.bg} ${s.border} border rounded-xl p-4`}><div className="flex items-start justify-between gap-3"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span>{t.icon}</span><span className={`text-xs font-bold ${s.text}`}>{t.label}</span><span className="text-xs text-muted-foreground">· {a.projectName}</span></div><p className="text-sm font-semibold text-foreground">{a.description}</p><p className="text-xs text-muted-foreground mt-1 italic">{a.evidence}</p></div></div><div className="mt-2 pt-2 border-t border-border/30"><div className="text-xs text-primary font-medium">{a.suggestedAction}</div></div></div>
        ); })}</div></Card>
      ); })}
    </div>
  );
}

// ─── Dependency Finder Panel ─────────────────────────────────────

interface DepSuggestion {
  sourceType: string; sourceId: number; sourceName: string; sourceProjectName: string | null;
  targetType: string; targetId: number; targetName: string; targetProjectName: string | null;
  depType: string; confidence: string; reason: string; suggestedLagDays: number;
  isHard: boolean; source: string; alreadyExists: boolean;
}

interface DepFinderData {
  suggestions: DepSuggestion[];
  analysisMethod: string;
  totalAnalysed: { milestones: number; projects: number; risks: number };
  existingDependencies: number;
  newSuggestionsCount: number;
}

const DEP_TYPE_LABELS: Record<string, string> = {
  finish_to_start: "Finish → Start",
  start_to_start: "Start → Start",
  finish_to_finish: "Finish → Finish",
  budget: "Budget Constraint",
  risk: "Risk Cascade",
  resource: "Resource Conflict",
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string }> = {
  high: { bg: "bg-green-100", text: "text-green-700" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700" },
  low: { bg: "bg-slate-100", text: "text-slate-600" },
};

const SOURCE_LABELS: Record<string, string> = {
  heuristic: "Rule-based",
  ai: "AI Suggested",
  name_similarity: "Name Match",
  timeline_overlap: "Timeline",
  budget_link: "Budget Link",
};

function DependencyFinderPanel() {
  const { data, isLoading } = useQuery<DepFinderData>({
    queryKey: ["/api/spmo/analytics/dependency-suggestions"],
    queryFn: () => customFetch("/api/spmo/analytics/dependency-suggestions"),
    staleTime: 300_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const newSuggestions = data.suggestions.filter((s) => !s.alreadyExists);
  const existing = data.suggestions.filter((s) => s.alreadyExists);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionHeader title="Auto Dependency Finder" icon={GitBranch} count={data.newSuggestionsCount} />
        <p className="text-sm text-muted-foreground mb-4">
          Analyses all projects, milestones, risks, and budgets to suggest missing dependencies.
          Method: <span className="font-semibold">{data.analysisMethod === "ai_enhanced" ? "AI-Enhanced + Rules" : "Rule-Based"}</span>.
          Scanned {data.totalAnalysed.milestones} milestones, {data.totalAnalysed.projects} projects, {data.totalAnalysed.risks} risks.
          {data.existingDependencies} dependencies already registered.
        </p>
        <div className="flex gap-3 flex-wrap">
          {["high", "medium", "low"].map((c) => {
            const count = newSuggestions.filter((s) => s.confidence === c).length;
            if (count === 0) return null;
            const cs = CONFIDENCE_STYLES[c] ?? CONFIDENCE_STYLES.low;
            return <div key={c} className={`${cs.bg} rounded-full px-3 py-1 text-xs font-bold ${cs.text}`}>{count} {c}</div>;
          })}
        </div>
      </Card>

      {newSuggestions.length === 0 && (
        <Card className="p-8 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-3" />
          <h3 className="text-lg font-bold">No Missing Dependencies Found</h3>
          <p className="text-sm text-muted-foreground mt-1">All detected dependencies are already registered.</p>
        </Card>
      )}

      {newSuggestions.length > 0 && (
        <Card className="p-5">
          <h4 className="text-sm font-bold mb-3">Suggested Dependencies ({newSuggestions.length})</h4>
          <div className="space-y-3">
            {newSuggestions.map((s, i) => {
              const cs = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;
              return (
                <div key={i} className="border border-border rounded-xl p-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cs.bg} ${cs.text}`}>{s.confidence}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded">{SOURCE_LABELS[s.source] ?? s.source}</span>
                        <span className="text-[10px] text-muted-foreground">{DEP_TYPE_LABELS[s.depType] ?? s.depType}</span>
                        {s.isHard && <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">BLOCKING</span>}
                      </div>
                      <div className="text-sm">
                        <span className="font-semibold">{s.sourceName}</span>
                        {s.sourceProjectName && <span className="text-muted-foreground text-xs"> ({s.sourceProjectName})</span>}
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="font-semibold">{s.targetName}</span>
                        {s.targetProjectName && <span className="text-muted-foreground text-xs"> ({s.targetProjectName})</span>}
                      </div>
                    </div>
                    {s.suggestedLagDays !== 0 && (
                      <div className="text-xs text-muted-foreground shrink-0">Lag: {s.suggestedLagDays}d</div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {existing.length > 0 && (
        <Card className="p-5">
          <h4 className="text-sm font-bold text-muted-foreground mb-3">Already Registered ({existing.length})</h4>
          <div className="space-y-1">
            {existing.slice(0, 10).map((s, i) => (
              <div key={i} className="text-xs text-muted-foreground py-1 border-b border-border/30 last:border-0 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                <span>{s.sourceName} → {s.targetName}</span>
                <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">{DEP_TYPE_LABELS[s.depType] ?? s.depType}</span>
              </div>
            ))}
            {existing.length > 10 && <div className="text-xs text-muted-foreground mt-1">...and {existing.length - 10} more</div>}
          </div>
        </Card>
      )}
    </div>
  );
}
