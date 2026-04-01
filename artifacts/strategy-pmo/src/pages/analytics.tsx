import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, PageHeader } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, TrendingDown, TrendingUp, AlertTriangle, Clock, DollarSign,
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

type Tab = "overview" | "delays" | "budget" | "stakeholders" | "evm" | "scenario" | "advisor" | "board-report";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: summary, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/spmo/analytics/summary"],
    queryFn: () => customFetch("/api/spmo/analytics/summary"),
    staleTime: 60_000,
  });

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
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
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
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
                        {f.alert === "overrun" ? `+SAR ${fmtM(f.projectedOverrun)}` : `-SAR ${fmtM(f.projectedUnderspend)}`}
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
            <Card className="p-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-3" />
              <h3 className="text-lg font-bold">Programme Healthy</h3>
              <p className="text-sm text-muted-foreground mt-1">No delay predictions, budget alerts, or stakeholder issues detected.</p>
            </Card>
          )}
        </div>
      )}

      {/* ─── Delays Tab ────────────────────────────────────────── */}
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
        <div className="text-center py-8 text-muted-foreground"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" /><p>No projects predicted to be delayed.</p></div>
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
        <div className="text-center py-8 text-muted-foreground"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" /><p>All projects on track with budget.</p></div>
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
                  <td className="px-4 py-3 text-right">SAR {fmtM(f.totalBudget)}</td>
                  <td className="px-4 py-3 text-right">{Math.round(f.spentPct)}%</td>
                  <td className="px-4 py-3 text-right">{Math.round(f.progress)}%</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={f.costPerformanceIndex < 0.9 ? "text-destructive" : f.costPerformanceIndex > 1.1 ? "text-green-600" : ""}>
                      {f.costPerformanceIndex.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">SAR {fmtM(f.projectedTotalSpend)}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    {f.alert === "overrun" ? <span className="text-destructive">+SAR {fmtM(f.projectedOverrun)}</span> : <span className="text-warning">−SAR {fmtM(f.projectedUnderspend)}</span>}
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
        <Card className="p-10 text-center"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" /><p className="text-muted-foreground">No stakeholder issues detected.</p></Card>
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

  return (
    <Card className="p-5">
      <SectionHeader title="Earned Value Management" icon={TrendingUp} count={items.length} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <th className="px-3 py-2 text-left">Project</th>
            <th className="px-3 py-2 text-right">PV</th>
            <th className="px-3 py-2 text-right">EV</th>
            <th className="px-3 py-2 text-right">AC</th>
            <th className="px-3 py-2 text-right">CPI</th>
            <th className="px-3 py-2 text-right">SPI</th>
            <th className="px-3 py-2 text-right">CV</th>
            <th className="px-3 py-2 text-right">SV</th>
            <th className="px-3 py-2 text-right">EAC</th>
            <th className="px-3 py-2 text-center">Cost</th>
            <th className="px-3 py-2 text-center">Schedule</th>
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
  cascadeImpact: { milestoneId: number; milestoneName: string; projectName: string; shiftDays: number; newDueDate: string }[];
  financialImpact?: { originalBudget: number; newBudget: number; actualSpent: number; overSpent: boolean; originalCpi: number; newCpi: number; originalEac: number; newEac: number };
  summary: string;
}

function ScenarioPanel() {
  const { toast } = useToast();
  const [scenarioType, setScenarioType] = useState<"delay" | "cancel" | "budget_cut">("delay");
  const [projectId, setProjectId] = useState("");
  const [delayDays, setDelayDays] = useState("90");
  const [budgetReduction, setBudgetReduction] = useState("20");
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
      if (scenarioType === "budget_cut") body.budgetReduction = parseInt(budgetReduction) || 20;
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
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <Card className="p-5 border-l-4 border-l-primary">
            <h3 className="font-bold text-sm mb-2">Impact Summary</h3>
            <p className="text-sm text-muted-foreground">{result.summary}</p>
          </Card>

          {/* Before / After comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Before</h4>
              <div className="text-2xl font-bold mb-3">{result.before.programmeProgress.toFixed(1)}%</div>
              {result.before.affectedPillarProgress.map((p) => (
                <div key={p.pillarId} className="flex justify-between text-sm py-1 border-b border-border/30">
                  <span className="text-muted-foreground">{p.pillarName}</span>
                  <span className="font-semibold">{p.progress.toFixed(1)}%</span>
                </div>
              ))}
            </Card>
            <Card className="p-5 border-l-4 border-l-destructive">
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">After</h4>
              <div className="text-2xl font-bold mb-3">
                {result.after.programmeProgress.toFixed(1)}%
                <span className="text-sm text-destructive ml-2">
                  ({(result.after.programmeProgress - result.before.programmeProgress).toFixed(1)}%)
                </span>
              </div>
              {result.after.affectedPillarProgress.map((p) => {
                const before = result.before.affectedPillarProgress.find((bp) => bp.pillarId === p.pillarId);
                const delta = before ? p.progress - before.progress : 0;
                return (
                  <div key={p.pillarId} className="flex justify-between text-sm py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{p.pillarName}</span>
                    <span>
                      <span className="font-semibold">{p.progress.toFixed(1)}%</span>
                      {delta !== 0 && <span className={`text-xs ml-1 ${delta < 0 ? "text-destructive" : "text-green-600"}`}>({delta > 0 ? "+" : ""}{delta.toFixed(1)})</span>}
                    </span>
                  </div>
                );
              })}
            </Card>
          </div>

          {/* Cascade impact */}
          {result.cascadeImpact.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Cascade Impact" icon={GitBranch} count={result.cascadeImpact.length} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 text-left">Milestone</th>
                    <th className="px-4 py-2 text-left">Project</th>
                    <th className="px-4 py-2 text-right">Shift</th>
                    <th className="px-4 py-2 text-right">New Due Date</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/50">
                    {result.cascadeImpact.map((c) => (
                      <tr key={c.milestoneId} className="hover:bg-secondary/20">
                        <td className="px-4 py-2 font-semibold">{c.milestoneName}</td>
                        <td className="px-4 py-2 text-muted-foreground">{c.projectName}</td>
                        <td className="px-4 py-2 text-right font-bold text-destructive">+{c.shiftDays}d</td>
                        <td className="px-4 py-2 text-right">{fmtDate(c.newDueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Financial impact for budget cut scenarios */}
          {result.financialImpact && (
            <Card className="p-5">
              <SectionHeader title="Financial Impact" icon={DollarSign} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-secondary/50 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Original Budget</div>
                  <div className="text-sm font-bold">SAR {fmtM(result.financialImpact.originalBudget)}</div>
                </div>
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">New Budget</div>
                  <div className="text-sm font-bold text-destructive">SAR {fmtM(result.financialImpact.newBudget)}</div>
                </div>
                <div className={`rounded-lg px-3 py-2.5 ${result.financialImpact.overSpent ? "bg-destructive/10 border border-destructive/30" : "bg-secondary/50"}`}>
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Actual Spent</div>
                  <div className={`text-sm font-bold ${result.financialImpact.overSpent ? "text-destructive" : ""}`}>SAR {fmtM(result.financialImpact.actualSpent)}</div>
                  {result.financialImpact.overSpent && <div className="text-[10px] text-destructive font-bold mt-0.5">⚠ EXCEEDS NEW BUDGET</div>}
                </div>
                <div className="bg-secondary/50 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">EAC Change</div>
                  <div className="text-sm font-bold">SAR {fmtM(result.financialImpact.originalEac)} → {fmtM(result.financialImpact.newEac)}</div>
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
      )}
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
