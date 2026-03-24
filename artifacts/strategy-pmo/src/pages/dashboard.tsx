import {
  useGetSpmoOverview,
  useListSpmoAlerts,
  useListSpmoInitiatives,
  useListSpmoBudget,
  useListSpmoProjects,
  useRunSpmoAiAssessment,
  useGetSpmoDepartmentStatus,
  type SpmoHealthStatus,
  type SpmoStatusResult,
  type SpmoProjectWithProgress,
  type SpmoDepartmentStatus,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LabelList } from "recharts";

import { Target, FolderOpen, AlertTriangle, Sparkles, AlertCircle, Loader2, ChevronRight, ChevronDown, Wallet, ThumbsUp, Lightbulb, ShieldAlert, Upload, FileText, BarChart2, Layers, Zap } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Link } from "wouter";
import type React from "react";
import { useIsAdmin } from "@/hooks/use-is-admin";

function calcPlannedProgress(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.max((end.getTime() - start.getTime()) / 86_400_000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86_400_000, 0);
  return Math.min(Math.round((elapsedDays / totalDays) * 100), 100);
}

const HEALTH_BADGE_MAP: Record<SpmoHealthStatus, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-success/10 text-success border border-success/30" },
  on_track:  { label: "On Track",  cls: "bg-primary/10 text-primary border border-primary/30" },
  at_risk:   { label: "At Risk",   cls: "bg-warning/10 text-warning border border-warning/30" },
  delayed:   { label: "Delayed",   cls: "bg-destructive/10 text-destructive border border-destructive/30" },
};

function ComputedStatusBadge({ cs }: { cs: SpmoStatusResult | undefined }) {
  if (!cs) return null;
  const { label, cls } = HEALTH_BADGE_MAP[cs.status];
  return (
    <div className="relative group inline-flex flex-col gap-0.5">
      <div className="inline-flex items-center gap-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
        <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover:block pointer-events-none">
          <div className="bg-popover border border-border rounded-lg shadow-xl px-3 py-2 text-xs text-foreground w-72 whitespace-normal leading-relaxed">
            <div className="font-semibold mb-1">{label}</div>
            <div className="text-muted-foreground">{cs.reason}</div>
            {cs.burnGap !== 0 && (
              <div className={`mt-1 ${cs.burnGap > 0 ? "text-warning" : "text-success"}`}>
                Budget burn gap: {cs.burnGap > 0 ? "+" : ""}{cs.burnGap}pts
              </div>
            )}
          </div>
        </div>
      </div>
      {cs.delayedChildren && cs.delayedChildren.length > 0 && (
        <div className="text-xs text-destructive/80 leading-snug mt-0.5 font-medium">
          ⚠ Delayed: {cs.delayedChildren.join(", ")}
        </div>
      )}
    </div>
  );
}

type ProjectStatusCategory = "on_track" | "at_risk" | "delayed" | "completed" | "not_started" | "on_hold";

function classifyProject(project: SpmoProjectWithProgress): ProjectStatusCategory {
  if (project.status === "on_hold") return "on_hold";
  if (project.status === "completed" || project.status === "cancelled") return "completed";
  const prog = project.progress ?? 0;
  const started = project.startDate ? new Date(project.startDate) <= new Date() : false;
  if (prog === 0 && !started) return "not_started";
  const cs = project.computedStatus?.status;
  if (cs === "completed") return "completed";
  if (cs === "delayed") return "delayed";
  if (cs === "at_risk") return "at_risk";
  if (cs === "on_track") return "on_track";
  if (prog === 0) return "not_started";
  return "on_track";
}

const STATUS_CHIPS: Record<ProjectStatusCategory, { label: string; bg: string; text: string }> = {
  on_track:    { label: "On Track",       bg: "bg-primary/10 border border-primary/20",        text: "text-primary"      },
  at_risk:     { label: "Risk of Delay",  bg: "bg-warning/10 border border-warning/20",        text: "text-warning"      },
  delayed:     { label: "Delayed",        bg: "bg-destructive/10 border border-destructive/20", text: "text-destructive" },
  completed:   { label: "Completed",      bg: "bg-success/10 border border-success/20",        text: "text-success"      },
  not_started: { label: "Not Started",    bg: "bg-secondary border border-border",             text: "text-muted-foreground" },
  on_hold:     { label: "On Hold",        bg: "bg-orange-100 border border-orange-200",        text: "text-orange-600"   },
};

const STATUS_ORDER: ProjectStatusCategory[] = ["on_track", "at_risk", "delayed", "completed", "not_started", "on_hold"];

// Exact colours per user spec
const PIE_COLOURS: Record<ProjectStatusCategory, string> = {
  on_track:    "#86efac", // light green
  completed:   "#16a34a", // dark green
  at_risk:     "#f59e0b", // amber
  delayed:     "#ef4444", // red
  on_hold:     "#9ca3af", // grey
  not_started: "#d1d5db", // light grey
};

const PIE_LABELS: Record<ProjectStatusCategory, string> = {
  on_track:    "On Track",
  completed:   "Completed",
  at_risk:     "Risk of Delay",
  delayed:     "Delayed",
  on_hold:     "On Hold",
  not_started: "Not Started",
};

function ProjectStatusPieChart({ projects }: { projects: SpmoProjectWithProgress[] }) {
  const counts: Record<ProjectStatusCategory, number> = {
    on_track: 0, at_risk: 0, delayed: 0, completed: 0, not_started: 0, on_hold: 0,
  };
  for (const p of projects) counts[classifyProject(p)]++;

  const chartData = STATUS_ORDER
    .filter((s) => counts[s] > 0)
    .map((s) => ({ name: PIE_LABELS[s], value: counts[s], key: s }));

  if (chartData.length === 0) return null;

  const total = projects.length;

  return (
    <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <h2 className="text-[15px] font-display font-bold text-foreground tracking-tight border-l-[3px] border-primary pl-2 mb-4">Project Status Breakdown</h2>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Pie */}
        <div className="relative w-52 h-52 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={PIE_COLOURS[entry.key as ProjectStatusCategory]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value} project${value !== 1 ? "s" : ""}`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)" }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-display font-bold leading-none">{total}</span>
            <span className="text-[11px] text-muted-foreground mt-1">projects</span>
          </div>
        </div>

        {/* Legend + counts — always show all 6 categories */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6 w-full">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: PIE_COLOURS[s], opacity: counts[s] === 0 ? 0.35 : 1 }}
              />
              <span className={`text-sm flex-1 ${counts[s] === 0 ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                {PIE_LABELS[s]}
              </span>
              <span className={`text-sm font-bold tabular-nums ${counts[s] === 0 ? "text-muted-foreground/40" : ""}`}>
                {counts[s]}
              </span>
              {total > 0 && counts[s] > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round((counts[s] / total) * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// Phase distribution pie chart
const PHASE_COLOURS: Record<string, string> = {
  planning:  "#60a5fa",
  tendering: "#a78bfa",
  execution: "#34d399",
  closure:   "#f59e0b",
  completed: "#16a34a",
  unknown:   "#d1d5db",
};
const PHASE_LABELS: Record<string, string> = {
  planning:  "Planning",
  tendering: "Tendering",
  execution: "Execution",
  closure:   "Closure",
  completed: "Completed",
  unknown:   "Not Started",
};
const PHASE_ORDER = ["planning", "tendering", "execution", "closure", "completed", "unknown"];

function ProjectPhasePieChart({ projects }: { projects: SpmoProjectWithProgress[] }) {
  const counts: Record<string, number> = {};
  for (const p of projects) {
    const phase = (p as { currentPhase?: string }).currentPhase ?? "unknown";
    counts[phase] = (counts[phase] ?? 0) + 1;
  }
  const chartData = PHASE_ORDER.filter((ph) => (counts[ph] ?? 0) > 0).map((ph) => ({ name: PHASE_LABELS[ph] ?? ph, value: counts[ph], key: ph }));
  if (chartData.length === 0) return null;
  return (
    <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <h2 className="text-[15px] font-display font-bold text-foreground tracking-tight border-l-[3px] border-primary pl-2 mb-4">Project Phase Distribution</h2>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-44 h-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={2} dataKey="value" strokeWidth={0}>
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={PHASE_COLOURS[entry.key] ?? "#9ca3af"} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, n: string) => [`${v} project${v !== 1 ? "s" : ""}`, n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-display font-bold leading-none">{projects.length}</span>
            <span className="text-[11px] text-muted-foreground mt-0.5">projects</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-5 w-full">
          {PHASE_ORDER.map((ph) => (
            <div key={ph} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PHASE_COLOURS[ph], opacity: (counts[ph] ?? 0) === 0 ? 0.3 : 1 }} />
              <span className={`text-sm flex-1 ${(counts[ph] ?? 0) === 0 ? "text-muted-foreground/40" : "text-muted-foreground"}`}>{PHASE_LABELS[ph]}</span>
              <span className={`text-sm font-bold tabular-nums ${(counts[ph] ?? 0) === 0 ? "text-muted-foreground/30" : ""}`}>{counts[ph] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Department health stacked bar chart — horizontal layout handles long names naturally
function DepartmentHealthBarChart({ depts }: { depts: SpmoDepartmentStatus[] }) {
  if (depts.length === 0) return null;
  const chartData = depts.map((d) => ({
    name: d.departmentName,
    "On Track": d.onTrack,
    "At Risk": d.atRisk,
    "Delayed": d.delayed,
    "Completed": d.completed,
    "Not Started": d.notStarted,
  }));
  const chartHeight = Math.max(180, depts.length * 44);
  return (
    <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <h2 className="text-[15px] font-display font-bold text-foreground tracking-tight border-l-[3px] border-primary pl-2 mb-4">Department Health Overview</h2>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 21) + "…" : v}
          />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)" }} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="On Track"    stackId="a" fill="#86efac">
            <LabelList dataKey="On Track"    position="center" formatter={(v: number) => v > 0 ? `${v}` : ""} style={{ fill: "#166534", fontSize: 10, fontWeight: 700 }} />
          </Bar>
          <Bar dataKey="At Risk"     stackId="a" fill="#f59e0b">
            <LabelList dataKey="At Risk"     position="center" formatter={(v: number) => v > 0 ? `${v}` : ""} style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} />
          </Bar>
          <Bar dataKey="Delayed"     stackId="a" fill="#ef4444">
            <LabelList dataKey="Delayed"     position="center" formatter={(v: number) => v > 0 ? `${v}` : ""} style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} />
          </Bar>
          <Bar dataKey="Completed"   stackId="a" fill="#16a34a">
            <LabelList dataKey="Completed"   position="center" formatter={(v: number) => v > 0 ? `${v}` : ""} style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} />
          </Bar>
          <Bar dataKey="Not Started" stackId="a" fill="#d1d5db" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="Not Started" position="center" formatter={(v: number) => v > 0 ? `${v}` : ""} style={{ fill: "#374151", fontSize: 10, fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BudgetStackedBarChart({
  totalAllocated, totalCapex, totalOpex, totalSpent,
  budgetUsed, budgetView, setBudgetView,
}: {
  totalAllocated: number; totalCapex: number; totalOpex: number; totalSpent: number;
  budgetUsed: number;
  budgetView: "total" | "capex" | "opex";
  setBudgetView: (v: "total" | "capex" | "opex") => void;
}) {
  const M = 1_000_000;
  // Proportionally split spent between CAPEX/OPEX
  const capexRatio = totalAllocated > 0 ? totalCapex / totalAllocated : 0.5;
  const capexSpent = Math.round(totalSpent * capexRatio);
  const opexSpent  = totalSpent - capexSpent;

  const chartData = (() => {
    if (budgetView === "capex") return [
      { name: "Allocated", CAPEX: totalCapex / M },
      { name: "Spent",     CAPEX: capexSpent / M },
    ];
    if (budgetView === "opex") return [
      { name: "Allocated", OPEX: totalOpex / M },
      { name: "Spent",     OPEX: opexSpent / M },
    ];
    return [
      { name: "Allocated", CAPEX: totalCapex / M, OPEX: totalOpex / M },
      { name: "Spent",     CAPEX: capexSpent / M, OPEX: opexSpent / M },
    ];
  })();

  const maxVal = Math.max(totalAllocated / M, totalSpent / M);
  const fmt = (v: number) => `${v.toFixed(0)}M SAR`;

  return (
    <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-warning/10">
            <Wallet className="w-4 h-4 text-warning" />
          </div>
          <div>
            <h2 className="text-[15px] font-display font-bold text-foreground tracking-tight">Budget Overview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(totalAllocated / M).toFixed(0)}M SAR allocated · {budgetUsed.toFixed(1)}% utilized
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* CAPEX / OPEX / Total toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-[11px] font-bold">
            {(["total", "capex", "opex"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setBudgetView(v)}
                className={`px-3 py-1 transition-colors ${budgetView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              >
                {v === "total" ? "TOTAL" : v.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Key numbers */}
          <div className="hidden sm:flex gap-4 text-xs">
            {budgetView !== "opex" && (
              <div className="text-center">
                <div className="font-bold" style={{ color: "#2563EB" }}>{(totalCapex / M).toFixed(0)}M</div>
                <div className="text-muted-foreground">CAPEX</div>
              </div>
            )}
            {budgetView !== "capex" && (
              <div className="text-center">
                <div className="font-bold" style={{ color: "#D97706" }}>{(totalOpex / M).toFixed(0)}M</div>
                <div className="text-muted-foreground">OPEX</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 20, right: 24, left: 20, bottom: 4 }} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}M`}
            domain={[0, Math.ceil(maxVal * 1.2)]}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false} tickLine={false}
          />
          <Tooltip
            formatter={(val: number, name: string) => [fmt(val), name]}
            contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", fontSize: 12 }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          {(budgetView === "total" || budgetView === "capex") && (
            <Bar dataKey="CAPEX" stackId="a" fill="#2563EB" radius={budgetView === "capex" ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={80}>
              <LabelList dataKey="CAPEX" position="center" formatter={(v: number) => v > 0 ? `${v.toFixed(0)}M` : ""} style={{ fill: "#fff", fontSize: 11, fontWeight: 700 }} />
            </Bar>
          )}
          {(budgetView === "total" || budgetView === "opex") && (
            <Bar dataKey="OPEX" stackId="a" fill="#D97706" radius={[6, 6, 0, 0]} maxBarSize={80}>
              <LabelList dataKey="OPEX" position="insideTop" offset={6} formatter={(v: number) => v > 0 ? `${v.toFixed(0)}M` : ""} style={{ fill: "#fff", fontSize: 11, fontWeight: 700 }} />
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useGetSpmoOverview();
  const { data: alertsData } = useListSpmoAlerts();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: budgetData } = useListSpmoBudget();
  const { data: projectsData } = useListSpmoProjects();
  const { data: deptStatus } = useGetSpmoDepartmentStatus();
  const isAdmin = useIsAdmin();
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [expandedPillars, setExpandedPillars] = useState<Set<number>>(new Set());
  const [expandedInitiatives, setExpandedInitiatives] = useState<Set<number>>(new Set());
  const [budgetView, setBudgetView] = useState<"total" | "capex" | "opex">("total");
  const aiMutation = useRunSpmoAiAssessment();

  const togglePillar = (id: number) =>
    setExpandedPillars((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleInitiative = (id: number) =>
    setExpandedInitiatives((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleRunAi = () => {
    setIsAiModalOpen(true);
    if (!aiMutation.data) {
      aiMutation.mutate();
    }
  };

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error || !data)
    return <div className="p-8 text-destructive">Failed to load dashboard data.</div>;

  const criticalAlerts = alertsData?.alerts.filter((a) => a.severity === "critical") ?? [];
  const totalProjects = data.pillarSummaries.reduce((s, p) => s + p.projectCount, 0);
  const budgetUsed = budgetData?.utilizationPct ?? 0;
  const initiatives = initiativesData?.initiatives ?? [];
  const projects = (projectsData?.projects ?? []) as SpmoProjectWithProgress[];

  const totalAllocated = budgetData?.totalAllocated ?? 0;
  const totalSpent = budgetData?.totalSpent ?? 0;

  // CAPEX/OPEX breakdowns from budget API (bottom-up from projects)
  const totalCapex = budgetData?.totalCapex ?? 0;
  const totalOpex  = budgetData?.totalOpex  ?? 0;
  const budgetViewAllocated = budgetView === "capex" ? totalCapex : budgetView === "opex" ? totalOpex : totalAllocated || (totalCapex + totalOpex);
  const budgetViewLabel = budgetView === "capex" ? "CAPEX" : budgetView === "opex" ? "OPEX" : "Total";
  const initiativesOnTrack = initiatives.filter((i) => {
    const s = i.computedStatus?.status ?? i.healthStatus;
    return s === "on_track" || s === "completed";
  }).length;
  const projectsNeedAttention = data.pillarSummaries.reduce((s, p) => s + p.pendingApprovals, 0);

  const initiativeCodeMap = new Map(initiatives.map((ini, idx) => [ini.id, ini.initiativeCode ?? String(idx + 1).padStart(2, "0")]));

  const projectsByInitiative = new Map<number, SpmoProjectWithProgress[]>();
  for (const proj of projects) {
    const list = projectsByInitiative.get(proj.initiativeId) ?? [];
    list.push(proj);
    projectsByInitiative.set(proj.initiativeId, list);
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Programme Dashboard"
        description={`Weighted progress cascade · last updated ${format(new Date(data.lastUpdated), "MMM d, yyyy HH:mm")}`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const res = await fetch("/api/spmo/reports/pdf", { method: "POST", credentials: "include" });
              if (!res.ok) { alert("Failed to generate PDF"); return; }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `Programme-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 bg-white border border-border hover:bg-muted/50 text-foreground px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={async () => {
              const res = await fetch("/api/spmo/reports/pptx", { method: "POST", credentials: "include" });
              if (!res.ok) { alert("Failed to generate PPTX"); return; }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `Programme-Report-${new Date().toISOString().slice(0, 10)}.pptx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 bg-white border border-border hover:bg-muted/50 text-foreground px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            Export PPTX
          </button>
          {isAdmin && (
            <button
              onClick={handleRunAi}
              className="flex items-center gap-2 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all text-sm"
            >
              <Sparkles className="w-4 h-4" />
              AI Assessment
            </button>
          )}
        </div>
      </PageHeader>

      {data.pillarSummaries.length === 0 && (
        <div className="flex items-center gap-4 p-5 rounded-xl bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-200">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">No programme data yet</div>
            <div className="text-xs text-muted-foreground mt-0.5">Import your strategy documents to auto-populate the programme structure, or create pillars manually.</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/import" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              Import from documents
            </Link>
            <Link href="/admin" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors">
              Create manually
            </Link>
          </div>
        </div>
      )}

      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-3.5">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <div className="flex-1 text-sm font-medium text-destructive">
            {criticalAlerts.length} critical alert{criticalAlerts.length > 1 ? "s" : ""} require immediate attention.
          </div>
          <Link href="/alerts" className="flex items-center gap-1 text-sm font-semibold text-destructive hover:underline shrink-0">
            View Alerts <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <SummaryCard
          icon={Target}
          label="Strategy Progress"
          value={`${Math.round(data.programmeProgress)}%`}
          sub={`${data.approvedMilestones} of ${data.totalMilestones} milestones approved`}
          color="text-primary"
          bg="bg-primary/10"
          accent="linear-gradient(90deg, #2563eb, #7c3aed)"
        />
        <SummaryCard
          icon={Sparkles}
          label="Initiatives"
          value={String(data.pillarSummaries.reduce((s, p) => s + p.initiativeCount, 0))}
          sub={`${initiativesOnTrack} on track`}
          color="text-violet-600"
          bg="bg-violet-100"
          accent="linear-gradient(90deg, #7c3aed, #a78bfa)"
        />
        <SummaryCard
          icon={FolderOpen}
          label="Projects"
          value={String(totalProjects)}
          sub={`${projectsNeedAttention} need attention`}
          color="text-success"
          bg="bg-success/10"
          accent="linear-gradient(90deg, #059669, #34d399)"
        />
      </div>

      {/* Budget Stacked Bar Chart — full width */}
      {(totalAllocated > 0 || totalCapex > 0) && (
        <BudgetStackedBarChart
          totalAllocated={totalAllocated}
          totalCapex={totalCapex}
          totalOpex={totalOpex}
          totalSpent={totalSpent}
          budgetUsed={budgetUsed}
          budgetView={budgetView}
          setBudgetView={setBudgetView}
        />
      )}

      {/* Charts Row — Status + Phase */}
      {projects.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ProjectStatusPieChart projects={projects} />
          <ProjectPhasePieChart projects={projects} />
        </div>
      )}

      {/* Department Health Bar Chart */}
      {(deptStatus ?? []).length > 0 && (
        <DepartmentHealthBarChart depts={deptStatus ?? []} />
      )}

      {/* Strategic Pillars section */}
      {(() => {
        const strategicPillars = data.pillarSummaries.filter((p) => (p.pillarType ?? "pillar") === "pillar");
        const enablers = data.pillarSummaries.filter((p) => p.pillarType === "enabler");

        const renderPillarGroup = (group: typeof data.pillarSummaries, groupLabel: string, groupIcon: React.ReactNode) => {
          if (group.length === 0) return null;
          return (
            <section key={groupLabel}>
              <div className="flex items-center gap-2 mb-4">
                {groupIcon}
                <h2 className="text-[15px] font-display font-bold text-foreground tracking-tight border-l-[3px] border-primary pl-2">{groupLabel}</h2>
              </div>
              <div className="space-y-5">
                {group.map((pillar) => {
                  const isPillarExpanded = expandedPillars.has(pillar.id);
                  const pillarInitiatives = initiatives.filter((i) => i.pillarId === pillar.id);
                  const pillarPlanned = (() => {
                    if (pillarInitiatives.length === 0) return 0;
                    const minStart = pillarInitiatives.reduce((m, i) => i.startDate < m ? i.startDate : m, pillarInitiatives[0].startDate);
                    const maxEnd = pillarInitiatives.reduce((m, i) => i.targetDate > m ? i.targetDate : m, pillarInitiatives[0].targetDate);
                    return calcPlannedProgress(minStart, maxEnd);
                  })();
                  const typeLabel = pillar.pillarType === "enabler" ? "Cross-Cutting Enabler" : "Strategic Pillar";
                  return (
                    <div key={pillar.id} className="rounded-[14px] border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
                      <div className="bg-card border-b border-border" style={{ borderLeft: `4px solid ${pillar.color}` }}>
                        <button onClick={() => togglePillar(pillar.id)} className="w-full px-6 pt-4 pb-3 text-left hover:bg-secondary/20 transition-colors focus:outline-none">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: pillar.color }}>{typeLabel}</div>
                              <h3 className="font-bold text-base">{pillar.name}</h3>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right shrink-0">
                                <div className="text-2xl font-display font-bold" style={{ color: pillar.color }}>{Math.round(pillar.progress)}%</div>
                                {pillarPlanned > 0 && <div className="text-[10px] text-muted-foreground">plan {pillarPlanned}%</div>}
                                <div className="text-[10px] text-muted-foreground">{pillar.projectCount} project{pillar.projectCount !== 1 ? "s" : ""}</div>
                              </div>
                              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0" style={{ transform: isPillarExpanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
                            </div>
                          </div>
                          <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden mt-3">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pillar.progress)}%`, backgroundColor: pillar.color }} />
                            {pillarPlanned > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-warning/80" style={{ left: `${Math.min(100, pillarPlanned)}%`, transform: "translateX(-50%)" }} />}
                          </div>
                        </button>
                        <div className="px-6 pb-3 flex justify-end">
                          <Link to={`/pillars/${pillar.id}/portfolio`} onClick={(e) => e.stopPropagation()} className="text-[11px] font-semibold hover:underline flex items-center gap-1" style={{ color: pillar.color }}>
                            View Pillar Dashboard <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                      {isPillarExpanded && (
                        <>
                          {pillarInitiatives.length > 0 ? (
                            <div className="divide-y divide-border/40 bg-secondary/10">
                              {pillarInitiatives.map((initiative) => {
                                const isInitExpanded = expandedInitiatives.has(initiative.id);
                                const progress = initiative.progress ?? 0;
                                const planned = calcPlannedProgress(initiative.startDate, initiative.targetDate);
                                const initProjects = projectsByInitiative.get(initiative.id) ?? [];
                                const initCounts: Record<ProjectStatusCategory, number> = { on_track: 0, at_risk: 0, delayed: 0, completed: 0, not_started: 0, on_hold: 0 };
                                for (const p of initProjects) { initCounts[classifyProject(p)]++; }
                                return (
                                  <div key={initiative.id}>
                                    <button onClick={() => toggleInitiative(initiative.id)} className="w-full flex items-start gap-4 px-6 py-3.5 hover:bg-secondary/30 transition-colors text-left focus:outline-none">
                                      <div className="w-1 h-10 rounded-full shrink-0 mt-1" style={{ backgroundColor: pillar.color }} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-semibold text-sm">Initiative {initiativeCodeMap.get(initiative.id) ?? "??"}: {initiative.name}</span>
                                              <ComputedStatusBadge cs={initiative.computedStatus} />
                                              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{initProjects.length} project{initProjects.length !== 1 ? "s" : ""}</span>
                                            </div>
                                            {initiative.computedStatus?.reason && <span className="text-[10px] text-muted-foreground truncate block">{initiative.computedStatus.reason}</span>}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <div className="text-right">
                                              <div className="text-sm font-bold" style={{ color: pillar.color }}>{Math.round(progress)}%</div>
                                              {planned > 0 && <div className="text-[10px] text-muted-foreground">plan {planned}%</div>}
                                            </div>
                                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200" style={{ transform: isInitExpanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
                                          </div>
                                        </div>
                                        <ProgressBar progress={progress} planned={planned} showLabel={false} />
                                        {initProjects.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-2">
                                            {STATUS_ORDER.filter((s) => initCounts[s] > 0).map((s) => {
                                              const { label, bg, text } = STATUS_CHIPS[s];
                                              return (
                                                <span key={s} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${bg} ${text}`}>
                                                  <span className="font-bold leading-none">{initCounts[s]}</span> {label}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                    {isInitExpanded && initProjects.length > 0 && (
                                      <div className="divide-y divide-border/30 bg-card border-t border-border/40">
                                        {initProjects.map((proj) => (
                                          <Link key={proj.id} to={`/projects?project=${proj.id}`}>
                                            <div className="flex items-center gap-4 px-10 py-2.5 hover:bg-secondary/30 transition-colors cursor-pointer">
                                              <div className="w-0.5 h-6 rounded-full shrink-0" style={{ backgroundColor: pillar.color }} />
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  {proj.projectCode && <span className="font-mono text-[11px] text-muted-foreground">{proj.projectCode}:</span>}
                                                  <span className="text-sm font-medium truncate">{proj.name}</span>
                                                  <ComputedStatusBadge cs={proj.computedStatus} />
                                                </div>
                                              </div>
                                              <div className="text-sm font-bold shrink-0" style={{ color: pillar.color }}>{proj.progress}%</div>
                                            </div>
                                          </Link>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="px-6 py-3 text-xs text-muted-foreground bg-secondary/10">No initiatives linked yet.</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        };

        return (
          <>
            {renderPillarGroup(strategicPillars, "Strategic Pillars", <Layers className="w-4 h-4 text-primary" />)}
            {enablers.length > 0 && strategicPillars.length > 0 && <div className="pt-2" />}
            {renderPillarGroup(enablers, "Cross-Cutting Enablers", <Zap className="w-4 h-4 text-warning" />)}
          </>
        );
      })()}

      {/* Fallback: initiatives with no pillars */}
      {data.pillarSummaries.length === 0 && initiatives.length > 0 && (
            <Card noPadding className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="divide-y divide-border">
                {initiatives.map((initiative) => {
                  const isInitExpanded = expandedInitiatives.has(initiative.id);
                  const progress = initiative.progress ?? 0;
                  const planned = calcPlannedProgress(initiative.startDate, initiative.targetDate);
                  const initProjects = projectsByInitiative.get(initiative.id) ?? [];
                  return (
                    <div key={initiative.id}>
                      <button
                        onClick={() => toggleInitiative(initiative.id)}
                        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/30 transition-colors text-left focus:outline-none"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-sm truncate block">Initiative {initiativeCodeMap.get(initiative.id) ?? "??"}: {initiative.name}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <div className="text-sm font-bold">{Math.round(progress)}%</div>
                                {planned > 0 && <div className="text-[10px] text-muted-foreground">plan {planned}%</div>}
                              </div>
                              <ComputedStatusBadge cs={initiative.computedStatus} />
                              <ChevronDown
                                className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200"
                                style={{ transform: isInitExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                              />
                            </div>
                          </div>
                          <ProgressBar progress={progress} planned={planned} showLabel={false} />
                        </div>
                      </button>
                      {isInitExpanded && initProjects.length > 0 && (
                        <div className="divide-y divide-border/30 bg-secondary/10 border-t border-border/40">
                          {initProjects.map((proj) => (
                            <Link key={proj.id} to={`/projects?project=${proj.id}`}>
                              <div className="flex items-center gap-4 px-8 py-2.5 hover:bg-secondary/40 transition-colors cursor-pointer">
                                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                  {proj.projectCode && (
                                    <span className="font-mono text-[11px] text-muted-foreground">{proj.projectCode}:</span>
                                  )}
                                  <span className="text-sm font-medium truncate">{proj.name}</span>
                                  <ComputedStatusBadge cs={proj.computedStatus} />
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-bold">{proj.progress}%</div>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
      )}

      {/* AI Modal — admin only */}
      {isAdmin && isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-600/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-violet-600" />
                </div>
                <h2 className="text-xl font-display font-bold">AI Programme Assessment</h2>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="text-muted-foreground hover:text-foreground text-lg font-bold">✕</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {aiMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-muted-foreground animate-pulse font-medium">Claude is analyzing your programme…</p>
                </div>
              )}
              {aiMutation.isError && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-sm space-y-1">
                  <div className="font-semibold">AI assessment failed.</div>
                  {(() => {
                    const detail = (aiMutation.error as { data?: { detail?: string } } | null)?.data?.detail;
                    return detail ? <div className="text-destructive/80 text-xs">{detail}</div> : null;
                  })()}
                  <div className="text-destructive/70 text-xs">Please try again or contact support if the issue persists.</div>
                </div>
              )}
              {aiMutation.isSuccess && aiMutation.data && (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 p-4 bg-secondary/40 rounded-xl border border-border">
                    <div className="shrink-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Overall Health</p>
                      {(() => {
                        const s = aiMutation.data.overallHealth as string;
                        const entry = Object.entries(HEALTH_BADGE_MAP).find(([k]) => k === s);
                        const { label, cls } = entry ? entry[1] : { label: s, cls: "bg-secondary text-foreground border border-border" };
                        return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
                      })()}
                    </div>
                    <p className="flex-1 text-sm leading-relaxed text-foreground/80">{aiMutation.data.summary}</p>
                  </div>

                  {aiMutation.data.pillarInsights.filter((pi) => pi.sentiment === "positive").length > 0 && (
                    <div>
                      <h3 className="font-bold mb-2 flex items-center gap-2 text-base">
                        <ThumbsUp className="w-4 h-4 text-success" /> Positive Highlights
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {aiMutation.data.pillarInsights
                          .filter((pi) => pi.sentiment === "positive")
                          .map((pi, i) => (
                            <div key={i} className="flex items-start gap-2 bg-success/5 p-2.5 rounded-lg border border-success/15 text-sm">
                              <span className="text-success font-bold shrink-0">✓</span>
                              <div>
                                <span className="font-semibold text-success/80 text-xs block">{pi.pillarName}</span>
                                <span className="text-foreground">{pi.insight}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <h3 className="font-bold mb-2 flex items-center gap-2 text-base">
                        <ShieldAlert className="w-4 h-4 text-warning" /> Concerns
                      </h3>
                      <ul className="space-y-1.5">
                        {aiMutation.data.riskFlags.map((risk, i) => (
                          <li key={i} className="flex items-start gap-2 bg-destructive/5 text-destructive p-2.5 rounded-lg border border-destructive/10 text-sm">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{risk}
                          </li>
                        ))}
                        {aiMutation.data.pillarInsights
                          .filter((pi) => pi.sentiment === "negative")
                          .map((pi, i) => (
                            <li key={`neg-${i}`} className="flex items-start gap-2 bg-warning/5 p-2.5 rounded-lg border border-warning/15 text-sm">
                              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-warning/80 text-xs block">{pi.pillarName}</span>
                                <span className="text-foreground">{pi.insight}</span>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-bold mb-2 flex items-center gap-2 text-base">
                        <Lightbulb className="w-4 h-4 text-primary" /> Actions
                      </h3>
                      <ul className="space-y-1.5">
                        {aiMutation.data.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2 bg-primary/5 p-2.5 rounded-lg border border-primary/10 text-sm">
                            <span className="shrink-0 mt-0.5 text-primary font-bold">→</span>
                            <span className="text-foreground">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {aiMutation.data.pillarInsights.filter((pi) => pi.sentiment === "neutral").length > 0 && (
                    <div>
                      <h3 className="font-bold mb-2 text-sm text-muted-foreground uppercase tracking-wider">Pillar Notes</h3>
                      <div className="space-y-1.5">
                        {aiMutation.data.pillarInsights
                          .filter((pi) => pi.sentiment === "neutral")
                          .map((pi, i) => (
                            <div key={i} className="flex items-start gap-2 bg-secondary/40 p-2.5 rounded-lg border border-border text-sm">
                              <span className="font-semibold text-muted-foreground text-xs shrink-0 mt-0.5">{pi.pillarName}:</span>
                              <span className="text-foreground/80">{pi.insight}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end">
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="px-5 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bg,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
  accent?: string;
}) {
  return (
    <Card noPadding className="hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      {accent && <div className="h-0.5 w-full" style={{ background: accent }} />}
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
        <div className={`text-3xl font-display font-bold tracking-tight ${color} mb-1.5`}>{value}</div>
        <div className="font-semibold text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </div>
    </Card>
  );
}
