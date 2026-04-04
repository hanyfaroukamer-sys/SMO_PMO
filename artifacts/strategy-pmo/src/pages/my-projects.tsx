import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListSpmoProjects,
  useGetCurrentAuthUser,
  useGetSpmoConfig,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { selectClass } from "@/components/modal";
import { Loader2, FolderOpen, TrendingUp, Target, Pencil, SlidersHorizontal, AlertTriangle, CheckCircle2, Clock, Pause } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const fmtCurrencyWithCode = (n: number, currency: string = "SAR") => {
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${currency} ${(n / 1_000).toFixed(0)}K`;
  return `${currency} ${n.toLocaleString()}`;
};

type StatusCategory = "on_track" | "at_risk" | "delayed" | "completed" | "not_started" | "on_hold";

const STATUS_ORDER: StatusCategory[] = ["on_track", "at_risk", "delayed", "completed", "not_started", "on_hold"];

const PIE_COLOURS: Record<StatusCategory, string> = {
  on_track: "#86efac", completed: "#16a34a", at_risk: "#f59e0b",
  delayed: "#ef4444", on_hold: "#9ca3af", not_started: "#d1d5db",
};

const PIE_LABELS: Record<StatusCategory, string> = {
  on_track: "On Track", completed: "Completed", at_risk: "Risk of Delay",
  delayed: "Delayed", on_hold: "On Hold", not_started: "Not Started",
};

const STATUS_TEXT: Record<StatusCategory, string> = {
  on_track: "text-green-700 dark:text-green-400", completed: "text-green-800 dark:text-green-300",
  at_risk: "text-amber-700 dark:text-amber-400", delayed: "text-red-600 dark:text-red-400",
  on_hold: "text-slate-500", not_started: "text-slate-400",
};

const STATUS_ICONS: Record<StatusCategory, React.ReactNode> = {
  on_track: <CheckCircle2 className="w-3.5 h-3.5" />, completed: <CheckCircle2 className="w-3.5 h-3.5" />,
  at_risk: <AlertTriangle className="w-3.5 h-3.5" />, delayed: <AlertTriangle className="w-3.5 h-3.5" />,
  on_hold: <Pause className="w-3.5 h-3.5" />, not_started: <Clock className="w-3.5 h-3.5" />,
};

function calcPlannedProgress(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.max((end.getTime() - start.getTime()) / 86_400_000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86_400_000, 0);
  return Math.min(Math.round((elapsedDays / totalDays) * 100), 100);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyProject(p: any): StatusCategory {
  if (p.status === "completed" || p.progress >= 100) return "completed";
  if (p.status === "on_hold") return "on_hold";
  if (p.progress === 0) return "not_started";
  if (p.targetDate) {
    const today = new Date();
    if (new Date(p.targetDate) < today) return "delayed";
    const planned = calcPlannedProgress(p.startDate, p.targetDate);
    if (planned - p.progress > 15) return "at_risk";
  }
  return "on_track";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatusBadge({ project }: { project: any }) {
  const category = classifyProject(project);
  const color = PIE_COLOURS[category];
  const textCls = STATUS_TEXT[category];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${textCls}`}
      style={{ backgroundColor: `${color}22`, borderColor: `${color}55` }}
    >
      {STATUS_ICONS[category]} {PIE_LABELS[category]}
    </span>
  );
}

export default function MyProjects() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | StatusCategory>("all");
  const { data: authData } = useGetCurrentAuthUser();
  const { data: projectsData, isLoading } = useListSpmoProjects();
  const { data: configData } = useGetSpmoConfig();
  const currency = (configData as any)?.reportingCurrency ?? "SAR";
  const fmtCurrency = (n: number) => fmtCurrencyWithCode(n, currency);

  const userId = authData?.user?.id;
  const allProjects = projectsData?.projects ?? [];
  const myProjects = allProjects.filter((p) => p.ownerId === userId);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64 p-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalBudget = myProjects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalSpent = myProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
  const avgProgress = myProjects.length > 0
    ? Math.round(myProjects.reduce((s, p) => s + (p.progress ?? 0), 0) / myProjects.length)
    : 0;

  // Status counts for pie chart
  const counts: Record<StatusCategory, number> = { on_track: 0, at_risk: 0, delayed: 0, completed: 0, not_started: 0, on_hold: 0 };
  for (const p of myProjects) counts[classifyProject(p)]++;

  const chartData = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({ name: PIE_LABELS[s], value: counts[s], key: s }));
  const filteredProjects = statusFilter === "all" ? myProjects : myProjects.filter((p) => classifyProject(p) === statusFilter);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="My Projects"
        description={`${myProjects.length} project${myProjects.length !== 1 ? "s" : ""} assigned to you as owner`}
      />

      {myProjects.length === 0 ? (
        <Card className="p-10 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-lg font-semibold text-foreground">No projects assigned to you</p>
          <p className="text-sm text-muted-foreground mt-1">Ask an admin to set you as owner on a project to see it here.</p>
        </Card>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><FolderOpen className="w-4 h-4" /><span>Projects</span></div>
              <p className="text-2xl font-bold">{myProjects.length}</p>
            </Card>
            <Card className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><TrendingUp className="w-4 h-4" /><span>Avg Progress</span></div>
              <p className="text-2xl font-bold">{avgProgress}%</p>
            </Card>
            <Card className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Target className="w-4 h-4" /><span>Total Budget</span></div>
              <p className="text-2xl font-bold">{fmtCurrency(totalBudget)}</p>
            </Card>
            <Card className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Target className="w-4 h-4" /><span>Spent</span></div>
              <p className="text-2xl font-bold">{fmtCurrency(totalSpent)}</p>
              {totalBudget > 0 && <p className="text-xs text-muted-foreground">{Math.round((totalSpent / totalBudget) * 100)}% of budget</p>}
            </Card>
          </div>

          {/* Pie chart */}
          {chartData.length > 0 && (
            <Card className="p-5">
              <h2 className="text-base font-display font-bold mb-4">Project Status Breakdown</h2>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative w-52 h-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} dataKey="value" strokeWidth={0}>
                        {chartData.map((entry) => <Cell key={entry.key} fill={PIE_COLOURS[entry.key as StatusCategory]} />)}
                      </Pie>
                      <Tooltip formatter={(value: number, name: string) => [`${value} project${value !== 1 ? "s" : ""}`, name]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-display font-bold leading-none">{myProjects.length}</span>
                    <span className="text-[11px] text-muted-foreground mt-1">projects</span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6 w-full">
                  {STATUS_ORDER.map((s) => (
                    <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                      className={`flex items-center gap-2.5 px-2 py-1 rounded-lg transition-colors ${statusFilter === s ? "bg-accent ring-1 ring-primary/20" : "hover:bg-muted/50"}`}>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLOURS[s], opacity: counts[s] === 0 ? 0.35 : 1 }} />
                      <span className={`text-sm flex-1 text-left ${counts[s] === 0 ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{PIE_LABELS[s]}</span>
                      <span className={`text-sm font-bold tabular-nums ${counts[s] === 0 ? "text-muted-foreground/40" : ""}`}>{counts[s]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
              <select className={`${selectClass} py-1.5 text-xs w-44`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | StatusCategory)}>
                <option value="all">All Statuses</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{PIE_LABELS[s]}</option>)}
              </select>
            </div>
            {statusFilter !== "all" && <button className="text-xs text-primary hover:underline" onClick={() => setStatusFilter("all")}>Clear filter</button>}
            <span className="ml-auto text-xs text-muted-foreground">{filteredProjects.length} of {myProjects.length} projects</span>
          </div>

          {/* Project cards */}
          {filteredProjects.length === 0 ? (
            <Card className="text-center py-8 text-muted-foreground">No projects match the selected filter.</Card>
          ) : (
            <div className="space-y-3">
              {filteredProjects.map((project) => {
                const budgetUsedPct = project.budget > 0 ? Math.min(100, Math.round(((project.budgetSpent ?? 0) / project.budget) * 100)) : 0;
                return (
                  <Card key={project.id} className="flex flex-col gap-3 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => navigate(`/projects/${project.id}`)}
                            className="font-semibold text-foreground hover:text-primary hover:underline text-left transition-colors">
                            {project.projectCode && <span className="font-mono text-muted-foreground mr-1">{project.projectCode}:</span>}{project.name}
                          </button>
                          <StatusBadge project={project} />
                        </div>
                        {project.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold">{project.progress ?? 0}%</p>
                        <p className="text-xs text-muted-foreground">complete</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{project.approvedMilestones ?? 0} / {project.milestoneCount ?? 0} milestones</span>
                      </div>
                      <ProgressBar progress={project.progress ?? 0} />
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span>Budget: {fmtCurrency(project.budget ?? 0)}</span>
                        <span>Spent: {fmtCurrency(project.budgetSpent ?? 0)} ({budgetUsedPct}%)</span>
                      </div>
                      <button onClick={() => navigate(`/projects/${project.id}`)}
                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0">
                        <Pencil className="w-3 h-3" /> Update
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
