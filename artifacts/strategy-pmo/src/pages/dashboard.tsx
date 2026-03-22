import {
  useGetSpmoOverview,
  useListSpmoAlerts,
  useListSpmoInitiatives,
  useListSpmoBudget,
  useListSpmoProjects,
  useRunSpmoAiAssessment,
  type SpmoHealthStatus,
  type SpmoStatusResult,
  type SpmoProjectWithProgress,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";

import { Target, FolderOpen, AlertTriangle, Sparkles, AlertCircle, Loader2, ChevronRight, Wallet, ThumbsUp, Lightbulb, ShieldAlert, Upload } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Link } from "wouter";
import type React from "react";

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
        <div className="text-[10px] text-destructive/80 leading-tight">
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
    <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-display font-bold mb-4">Project Status Breakdown</h2>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Pie */}
        <div className="w-52 h-52 shrink-0">
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

        {/* Centre total */}
      </div>
      <div className="mt-3 text-xs text-muted-foreground text-right">{total} total project{total !== 1 ? "s" : ""}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useGetSpmoOverview();
  const { data: alertsData } = useListSpmoAlerts();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: budgetData } = useListSpmoBudget();
  const { data: projectsData } = useListSpmoProjects();
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const aiMutation = useRunSpmoAiAssessment();

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
  const initiativesOnTrack = initiatives.filter((i) => {
    const s = i.computedStatus?.status ?? i.healthStatus;
    return s === "on_track" || s === "completed";
  }).length;
  const projectsNeedAttention = data.pillarSummaries.reduce((s, p) => s + p.pendingApprovals, 0);

  const projectsByInitiative = new Map<number, SpmoProjectWithProgress[]>();
  for (const proj of projects) {
    const list = projectsByInitiative.get(proj.initiativeId) ?? [];
    list.push(proj);
    projectsByInitiative.set(proj.initiativeId, list);
  }

  const projectsByPillar = new Map<number, SpmoProjectWithProgress[]>();
  for (const proj of projects) {
    const init = initiatives.find((i) => i.id === proj.initiativeId);
    if (!init?.pillarId) continue;
    const list = projectsByPillar.get(init.pillarId) ?? [];
    list.push(proj);
    projectsByPillar.set(init.pillarId, list);
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Programme Dashboard"
        description={`Weighted progress cascade · last updated ${format(new Date(data.lastUpdated), "MMM d, yyyy HH:mm")}`}
      >
        <button
          onClick={handleRunAi}
          className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all text-sm"
        >
          <Sparkles className="w-4 h-4" />
          AI Assessment
        </button>
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
        />
        <SummaryCard
          icon={Sparkles}
          label="Initiatives"
          value={String(data.pillarSummaries.reduce((s, p) => s + p.initiativeCount, 0))}
          sub={`${initiativesOnTrack} on track`}
          color="text-violet-600"
          bg="bg-violet-100"
        />
        <SummaryCard
          icon={FolderOpen}
          label="Projects"
          value={String(totalProjects)}
          sub={`${projectsNeedAttention} need attention`}
          color="text-success"
          bg="bg-success/10"
        />
        <SummaryCard
          icon={Wallet}
          label="Budget Used"
          value={`${budgetUsed.toFixed(1)}%`}
          sub={
            totalAllocated > 0
              ? `Spent ${(totalSpent / 1_000_000).toFixed(0)}M / ${(totalAllocated / 1_000_000).toFixed(0)}M SAR`
              : budgetUsed > 90 ? "Over budget threshold" : "Of total allocation"
          }
          color={budgetUsed > 90 ? "text-destructive" : "text-warning"}
          bg={budgetUsed > 90 ? "bg-destructive/10" : "bg-warning/10"}
        />
      </div>

      {/* Project Status Pie Chart */}
      {projects.length > 0 && (
        <ProjectStatusPieChart projects={projects} />
      )}

      {/* Pillar Groups — Initiatives + Project Status Counts */}
      <section>
        <h2 className="text-lg font-display font-bold mb-4">Pillars &amp; Initiatives</h2>
        <div className="space-y-5">
          {data.pillarSummaries.map((pillar) => {
            const pillarInitiatives = initiatives.filter((i) => i.pillarId === pillar.id);
            const pillarProjects = projectsByPillar.get(pillar.id) ?? [];

            const counts: Record<ProjectStatusCategory, number> = {
              on_track: 0, at_risk: 0, delayed: 0, completed: 0, not_started: 0, on_hold: 0,
            };
            for (const proj of pillarProjects) {
              counts[classifyProject(proj)]++;
            }

            return (
              <div key={pillar.id} className="rounded-2xl border border-border overflow-hidden shadow-sm">
                {/* Pillar header */}
                <div
                  className="px-6 py-4 bg-card border-b border-border"
                  style={{ borderLeft: `4px solid ${pillar.color}` }}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: pillar.color }}>
                        Pillar
                      </div>
                      <h3 className="font-bold text-base">{pillar.name}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-display font-bold" style={{ color: pillar.color }}>
                        {Math.round(pillar.progress)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">{pillar.projectCount} project{pillar.projectCount !== 1 ? "s" : ""}</div>
                    </div>
                  </div>

                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-3 mb-3">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, pillar.progress)}%`, backgroundColor: pillar.color }}
                    />
                  </div>

                  {/* Project status chips */}
                  {pillarProjects.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => {
                        const { label, bg, text } = STATUS_CHIPS[s];
                        return (
                          <span key={s} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${bg} ${text}`}>
                            <span className="font-bold text-[13px] leading-none">{counts[s]}</span>
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Initiative rows */}
                {pillarInitiatives.length > 0 && (
                  <div className="divide-y divide-border/40 bg-secondary/10">
                    {pillarInitiatives.map((initiative) => {
                      const progress = initiative.progress ?? 0;
                      const planned = calcPlannedProgress(initiative.startDate, initiative.targetDate);
                      const initProjects = projectsByInitiative.get(initiative.id) ?? [];
                      const initCounts: Record<ProjectStatusCategory, number> = {
                        on_track: 0, at_risk: 0, delayed: 0, completed: 0, not_started: 0, on_hold: 0,
                      };
                      for (const p of initProjects) {
                        initCounts[classifyProject(p)]++;
                      }

                      return (
                        <div key={initiative.id} className="flex items-start gap-4 px-6 py-3.5 hover:bg-secondary/30 transition-colors">
                          <div className="w-1 h-10 rounded-full shrink-0 mt-1" style={{ backgroundColor: pillar.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm">{initiative.name}</span>
                                  <ComputedStatusBadge cs={initiative.computedStatus} />
                                </div>
                                {initiative.computedStatus?.reason && (
                                  <span className="text-[10px] text-muted-foreground truncate block">{initiative.computedStatus.reason}</span>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-bold" style={{ color: pillar.color }}>{Math.round(progress)}%</div>
                                {planned > 0 && <div className="text-[10px] text-muted-foreground">plan {planned}%</div>}
                              </div>
                            </div>
                            <ProgressBar progress={progress} planned={planned} showLabel={false} />
                            {/* Per-initiative project status chips */}
                            {initProjects.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {STATUS_ORDER.filter((s) => initCounts[s] > 0).map((s) => {
                                  const { label, bg, text } = STATUS_CHIPS[s];
                                  return (
                                    <span key={s} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${bg} ${text}`}>
                                      <span className="font-bold leading-none">{initCounts[s]}</span>
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {pillarInitiatives.length === 0 && (
                  <div className="px-6 py-3 text-xs text-muted-foreground bg-secondary/10">
                    No initiatives linked to this pillar yet.
                  </div>
                )}
              </div>
            );
          })}

          {data.pillarSummaries.length === 0 && initiatives.length > 0 && (
            <Card noPadding className="overflow-hidden">
              <div className="divide-y divide-border">
                {initiatives.map((initiative) => {
                  const progress = initiative.progress ?? 0;
                  const planned = calcPlannedProgress(initiative.startDate, initiative.targetDate);
                  return (
                    <div key={initiative.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm truncate block">{initiative.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="text-sm font-bold">{Math.round(progress)}%</div>
                              {planned > 0 && <div className="text-[10px] text-muted-foreground">plan {planned}%</div>}
                            </div>
                            <ComputedStatusBadge cs={initiative.computedStatus} />
                          </div>
                        </div>
                        <ProgressBar progress={progress} planned={planned} showLabel={false} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* AI Modal */}
      {isAiModalOpen && (
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
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-sm">
                  Assessment failed. Please try again.
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <Card className="hover:-translate-y-1 transition-transform duration-200">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      <div className={`text-3xl font-display font-bold tracking-tight ${color} mb-1`}>{value}</div>
      <div className="font-semibold text-sm text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </Card>
  );
}
