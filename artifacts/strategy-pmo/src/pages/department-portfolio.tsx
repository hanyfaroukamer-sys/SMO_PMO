import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetSpmaDepartmentPortfolio,
  type SpmaDepartmentPortfolioProject,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { selectClass } from "@/components/modal";
import { Loader2, ArrowLeft, Building2, FolderOpen, TrendingUp, Target, ExternalLink, SlidersHorizontal } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

type StatusCategory = "on_track" | "at_risk" | "delayed" | "completed" | "not_started" | "on_hold";

const STATUS_ORDER: StatusCategory[] = ["on_track", "at_risk", "delayed", "completed", "not_started", "on_hold"];

const PIE_COLOURS: Record<StatusCategory, string> = {
  on_track:    "#86efac",
  completed:   "#16a34a",
  at_risk:     "#f59e0b",
  delayed:     "#ef4444",
  on_hold:     "#9ca3af",
  not_started: "#d1d5db",
};

const PIE_LABELS: Record<StatusCategory, string> = {
  on_track:    "On Track",
  completed:   "Completed",
  at_risk:     "Risk of Delay",
  delayed:     "Delayed",
  on_hold:     "On Hold",
  not_started: "Not Started",
};

const STATUS_TEXT: Record<StatusCategory, string> = {
  on_track:    "text-green-700 dark:text-green-400",
  completed:   "text-green-800 dark:text-green-300",
  at_risk:     "text-amber-700 dark:text-amber-400",
  delayed:     "text-red-600 dark:text-red-400",
  on_hold:     "text-slate-500",
  not_started: "text-slate-400",
};

function DeptStatusBadge({ project }: { project: SpmaDepartmentPortfolioProject }) {
  const category = classifyProject(project);
  const label = PIE_LABELS[category];
  const color = PIE_COLOURS[category];
  const textCls = STATUS_TEXT[category];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${textCls}`}
      style={{ backgroundColor: `${color}22`, borderColor: `${color}55` }}
    >
      {label}
    </span>
  );
}

function calcPlannedProgress(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.max((end.getTime() - start.getTime()) / 86_400_000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86_400_000, 0);
  return Math.min(Math.round((elapsedDays / totalDays) * 100), 100);
}

function classifyProject(p: SpmaDepartmentPortfolioProject): StatusCategory {
  if (p.status === "completed" || p.progress >= 100) return "completed";
  if (p.status === "on_hold") return "on_hold";
  if (p.progress === 0) return "not_started";
  if (p.targetDate) {
    const today = new Date();
    const target = new Date(p.targetDate);
    if (target < today) return "delayed";
    const planned = calcPlannedProgress(p.startDate, p.targetDate);
    if (planned - p.progress > 15) return "at_risk";
  }
  return "on_track";
}

function DeptProjectStatusPieChart({ projects }: { projects: SpmaDepartmentPortfolioProject[] }) {
  const counts: Record<StatusCategory, number> = {
    on_track: 0, at_risk: 0, delayed: 0, completed: 0, not_started: 0, on_hold: 0,
  };
  for (const p of projects) counts[classifyProject(p)]++;

  const chartData = STATUS_ORDER
    .filter((s) => counts[s] > 0)
    .map((s) => ({ name: PIE_LABELS[s], value: counts[s], key: s }));

  if (chartData.length === 0) return null;

  const total = projects.length;

  return (
    <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-display font-bold mb-4">Project Status Breakdown</h2>
      <div className="flex flex-col sm:flex-row items-center gap-6">
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
                  <Cell key={entry.key} fill={PIE_COLOURS[entry.key as StatusCategory]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value} project${value !== 1 ? "s" : ""}`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-display font-bold leading-none">{total}</span>
            <span className="text-[11px] text-muted-foreground mt-1">projects</span>
          </div>
        </div>

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

type Props = {
  params: { id: string };
};

export default function DepartmentPortfolio({ params }: Props) {
  const deptId = parseInt(params?.id ?? "0");
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | StatusCategory>("all");

  const { data, isLoading, isError } = useGetSpmaDepartmentPortfolio(deptId);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64 p-6">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <Card className="text-center py-12 text-slate-500">Department not found.</Card>
      </div>
    );
  }

  const { department, projects } = data;
  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalSpent = projects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/departments")}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <PageHeader
          title={department.name}
          description="Department project portfolio"
        />
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <FolderOpen className="w-4 h-4" />
            <span>Projects</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{projects.length}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>Avg Progress</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{avgProgress}%</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Target className="w-4 h-4" />
            <span>Total Budget</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{fmtCurrency(totalBudget)}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Building2 className="w-4 h-4" />
            <span>Spent</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{fmtCurrency(totalSpent)}</p>
          {totalBudget > 0 && (
            <p className="text-xs text-slate-400">{Math.round((totalSpent / totalBudget) * 100)}% of budget</p>
          )}
        </Card>
      </div>

      {/* Status Pie Chart */}
      {projects.length > 0 && <DeptProjectStatusPieChart projects={projects} />}

      {/* Project list */}
      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 font-medium">No projects assigned to this department</p>
          <p className="text-slate-400 text-sm mt-1">
            Go to Projects and assign a department to include them here.
          </p>
        </Card>
      ) : (() => {
        const filteredProjects = statusFilter === "all"
          ? projects
          : projects.filter((p) => classifyProject(p) === statusFilter);
        return (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
              <select
                className={`${selectClass} py-1.5 text-xs w-44`}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | StatusCategory)}
              >
                <option value="all">All Statuses</option>
                {(Object.keys(PIE_LABELS) as StatusCategory[]).map((s) => (
                  <option key={s} value={s}>{PIE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            {statusFilter !== "all" && (
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setStatusFilter("all")}
              >
                Clear filter
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredProjects.length} of {projects.length} projects
            </span>
          </div>

          {filteredProjects.length === 0 ? (
            <Card className="text-center py-8 text-slate-400">
              No projects match the selected status filter.
            </Card>
          ) : (
          <div className="space-y-3">
          {filteredProjects.map((project) => {
            const budgetUsedPct = project.budget > 0
              ? Math.min(100, Math.round((project.budgetSpent / project.budget) * 100))
              : 0;

            return (
              <Card key={project.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => navigate(`/projects?project=${project.id}`)}
                        className="font-semibold text-slate-800 hover:text-blue-600 hover:underline text-left transition-colors"
                      >
                        {project.projectCode && <span className="font-mono text-slate-500 mr-1">{project.projectCode}:</span>}{project.name}
                      </button>
                      <DeptStatusBadge project={project} />
                    </div>
                    {(project.initiativeName || project.pillarName) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {project.pillarName && <span>{project.pillarName}</span>}
                        {project.pillarName && project.initiativeName && <span className="mx-1">›</span>}
                        {project.initiativeName && <span>{project.initiativeName}</span>}
                      </p>
                    )}
                    {project.description && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-800">{project.progress}%</p>
                    <p className="text-xs text-slate-400">complete</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Progress</span>
                    <span>{project.approvedMilestones ?? 0} / {project.milestoneCount ?? 0} milestones</span>
                  </div>
                  <ProgressBar progress={project.progress} />
                </div>

                <div className="flex items-center justify-between text-sm text-slate-500 border-t border-slate-100 pt-2">
                  <div className="flex items-center gap-3">
                    <span>Budget: {fmtCurrency(project.budget)}</span>
                    <span>Spent: {fmtCurrency(project.budgetSpent)} ({budgetUsedPct}%)</span>
                    {project.ownerName && <span className="hidden sm:block">Owner: {project.ownerName}</span>}
                  </div>
                  <button
                    onClick={() => navigate(`/projects?project=${project.id}`)}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline shrink-0"
                    title="View in Projects"
                  >
                    <ExternalLink className="w-3 h-3" /> View
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
        )}
      </>
    );
  })()}
    </div>
  );
}
