import { useMemo, useState } from "react";
import {
  useListSpmoProjects,
  useListSpmoPillars,
  useListSpmoInitiatives,
  useListSpmoAllMilestones,
  type SpmoProjectWithProgress,
} from "@workspace/api-client-react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui-elements";

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function toDate(s: string | null | undefined | Date): Date | null {
  if (!s) return null;
  if (s instanceof Date) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatMonthYear(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function formatDateShort(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

type GanttPillar = { id: number; name: string; color: string };

type GanttMilestone = { id: number; name: string; dueDate: Date; status: string };

type GanttRow = {
  project: SpmoProjectWithProgress;
  pillar: GanttPillar | undefined;
  milestones: GanttMilestone[];
};

type PillarGroup = {
  pillar: GanttPillar | undefined;
  pillarId: number;
  rows: GanttRow[];
};

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 32;
const LABEL_WIDTH = 220;
const DIAMOND = 8;

function hex2rgba(hex: string, alpha = 1) {
  const h = (hex ?? "#6366f1").replace("#", "").padStart(6, "0");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function milestoneStrokeColor(status: string) {
  if (status === "approved") return "#16a34a";
  if (status === "submitted") return "#d97706";
  if (status === "rejected") return "#dc2626";
  return "#6b7280";
}

interface GanttChartProps {
  pillarFilter: number | "all";
  departmentFilter: number | "all";
}

export function GanttChart({ pillarFilter, departmentFilter }: GanttChartProps) {
  const { data: projectsData, isLoading: projLoading } = useListSpmoProjects();
  const { data: pillarsData } = useListSpmoPillars();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: milestonesData } = useListSpmoAllMilestones();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const pillars = (pillarsData?.pillars ?? []) as GanttPillar[];
  const pillarMap = useMemo(() => new Map(pillars.map((p) => [p.id, p])), [pillars]);

  const initiativeMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const ini of initiativesData?.initiatives ?? []) {
      m.set(ini.id, ini.pillarId);
    }
    return m;
  }, [initiativesData]);

  const milestonesByProject = useMemo(() => {
    const map = new Map<number, GanttMilestone[]>();
    for (const item of milestonesData?.items ?? []) {
      const dd = toDate(item.milestone.dueDate as string | null | undefined);
      if (!dd) continue;
      const list = map.get(item.project.id) ?? [];
      list.push({ id: item.milestone.id, name: item.milestone.name, dueDate: dd, status: item.milestone.status });
      map.set(item.project.id, list);
    }
    return map;
  }, [milestonesData]);

  const groups: PillarGroup[] = useMemo(() => {
    const byPillar = new Map<number, GanttRow[]>();
    const projects = (projectsData?.projects ?? []) as SpmoProjectWithProgress[];
    for (const project of projects) {
      if (departmentFilter !== "all" && project.departmentId !== departmentFilter) continue;
      const pillarId = initiativeMap.get(project.initiativeId) ?? 0;
      if (pillarFilter !== "all" && pillarId !== pillarFilter) continue;
      const pillar = pillarMap.get(pillarId);
      const rows = byPillar.get(pillarId) ?? [];
      rows.push({ project, pillar, milestones: milestonesByProject.get(project.id) ?? [] });
      byPillar.set(pillarId, rows);
    }
    return Array.from(byPillar.entries()).map(([pillarId, rows]) => ({
      pillarId,
      pillar: pillarMap.get(pillarId),
      rows,
    }));
  }, [projectsData, departmentFilter, pillarFilter, initiativeMap, pillarMap, milestonesByProject]);

  const { chartStart, chartEnd } = useMemo(() => {
    let minT = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1).getTime();
    let maxT = new Date(TODAY.getFullYear() + 1, TODAY.getMonth(), 1).getTime();
    for (const g of groups) {
      for (const row of g.rows) {
        const sd = toDate(row.project.startDate);
        const td = toDate(row.project.targetDate);
        if (sd && sd.getTime() < minT) minT = sd.getTime();
        if (td && td.getTime() > maxT) maxT = td.getTime();
        for (const m of row.milestones) {
          if (m.dueDate.getTime() < minT) minT = m.dueDate.getTime();
          if (m.dueDate.getTime() > maxT) maxT = m.dueDate.getTime();
        }
      }
    }
    const s = new Date(minT);
    const e = new Date(maxT);
    return {
      chartStart: new Date(s.getFullYear(), s.getMonth(), 1),
      chartEnd: new Date(e.getFullYear(), e.getMonth() + 2, 1),
    };
  }, [groups]);

  const totalMs = Math.max(1, chartEnd.getTime() - chartStart.getTime());

  function xFrac(date: Date) {
    return Math.max(0, Math.min(1, (date.getTime() - chartStart.getTime()) / totalMs));
  }

  const monthHeaders = useMemo(() => {
    const months: Array<{ label: string; left: number; width: number }> = [];
    let cur = new Date(chartStart);
    while (cur < chartEnd) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const l = xFrac(cur);
      const r = xFrac(next < chartEnd ? next : chartEnd);
      months.push({ label: formatMonthYear(cur), left: l, width: r - l });
      cur = next;
    }
    return months;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStart, chartEnd]);

  if (projLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  if (groups.length === 0)
    return (
      <Card className="py-16 text-center">
        <p className="text-muted-foreground">No projects match the selected filters.</p>
      </Card>
    );

  const todayX = xFrac(TODAY);

  function toggleGroup(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: "860px" }}>
          {/* Month header */}
          <div className="flex border-b border-border bg-secondary/40" style={{ height: HEADER_HEIGHT }}>
            <div
              className="shrink-0 border-r border-border bg-secondary/60 flex items-center px-4"
              style={{ width: LABEL_WIDTH }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project</span>
            </div>
            <div className="relative flex-1">
              {monthHeaders.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden border-r border-border/30"
                  style={{ left: `${m.left * 100}%`, width: `${m.width * 100}%` }}
                >
                  <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap px-1">{m.label}</span>
                </div>
              ))}
              {/* Today line on header */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-400/70 z-10"
                style={{ left: `${todayX * 100}%` }}
              />
            </div>
          </div>

          {/* Groups */}
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.pillarId);
            const pillarColor = g.pillar?.color ?? "#6366f1";
            return (
              <div key={g.pillarId}>
                {/* Pillar group header */}
                <button
                  onClick={() => toggleGroup(g.pillarId)}
                  className="flex w-full border-b border-border hover:brightness-95 transition-all"
                  style={{ height: HEADER_HEIGHT, background: hex2rgba(pillarColor, 0.07) }}
                >
                  <div
                    className="shrink-0 border-r border-border flex items-center gap-2 px-3"
                    style={{ width: LABEL_WIDTH, borderLeft: `3px solid ${pillarColor}` }}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-bold truncate" style={{ color: pillarColor }}>
                      {g.pillar?.name ?? "Unassigned"}&nbsp;
                      <span className="font-normal opacity-70">({g.rows.length})</span>
                    </span>
                  </div>
                  <div className="flex-1 relative">
                    {monthHeaders.map((m, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-r border-border/20"
                        style={{ left: `${m.left * 100}%`, width: `${m.width * 100}%` }}
                      />
                    ))}
                    <div className="absolute top-0 bottom-0 w-px bg-red-400/40 z-10" style={{ left: `${todayX * 100}%` }} />
                  </div>
                </button>

                {/* Project rows */}
                {!isCollapsed &&
                  g.rows.map((row) => {
                    const sd = toDate(row.project.startDate);
                    const td = toDate(row.project.targetDate);
                    const barL = sd ? xFrac(sd) : 0;
                    const barW = sd && td ? Math.max(0.004, xFrac(td) - barL) : 0;
                    const isOverdue = td && td < TODAY && row.project.status !== "completed";

                    return (
                      <div
                        key={row.project.id}
                        className="flex border-b border-border/40 hover:bg-secondary/15 transition-colors"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* Label cell */}
                        <div
                          className="shrink-0 border-r border-border/60 flex items-center px-3 gap-2"
                          style={{ width: LABEL_WIDTH }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pillarColor }} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate leading-tight">{row.project.name}</p>
                            {row.project.ownerName && (
                              <p className="text-[10px] text-muted-foreground truncate">{row.project.ownerName}</p>
                            )}
                          </div>
                        </div>

                        {/* Timeline cell */}
                        <div className="flex-1 relative flex items-center">
                          {/* Column shading */}
                          {monthHeaders.map((m, i) => (
                            <div
                              key={i}
                              className="absolute top-0 bottom-0 border-r border-border/15"
                              style={{ left: `${m.left * 100}%`, width: `${m.width * 100}%` }}
                            />
                          ))}

                          {/* Today line */}
                          <div
                            className="absolute top-0 bottom-0 w-px bg-red-400/50 z-10"
                            style={{ left: `${todayX * 100}%` }}
                          />

                          {/* Progress bar */}
                          {sd && td && (
                            <div
                              className="absolute z-20 rounded-full overflow-hidden"
                              style={{
                                left: `${barL * 100}%`,
                                width: `${barW * 100}%`,
                                height: 16,
                                background: isOverdue ? "rgba(220,38,38,0.12)" : hex2rgba(pillarColor, 0.14),
                                border: `1.5px solid ${isOverdue ? "#dc2626" : pillarColor}`,
                              }}
                              title={`${row.project.name}: ${formatDateShort(sd)} → ${formatDateShort(td)} · ${row.project.progress}%`}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, row.project.progress)}%`,
                                  background: isOverdue ? "rgba(220,38,38,0.35)" : hex2rgba(pillarColor, 0.45),
                                }}
                              />
                            </div>
                          )}

                          {/* Milestone diamonds */}
                          {row.milestones.map((ms) => {
                            const mx = xFrac(ms.dueDate);
                            const clr = milestoneStrokeColor(ms.status);
                            const filled = ms.status === "approved";
                            const cx = DIAMOND / 2;
                            const size = DIAMOND * 0.707;
                            return (
                              <div
                                key={ms.id}
                                className="absolute z-30"
                                style={{
                                  left: `calc(${mx * 100}% - ${DIAMOND / 2}px)`,
                                  top: "50%",
                                  marginTop: -(DIAMOND / 2),
                                }}
                                title={`${ms.name} · ${formatDateShort(ms.dueDate)} · ${ms.status}`}
                              >
                                <svg width={DIAMOND} height={DIAMOND} viewBox={`0 0 ${DIAMOND} ${DIAMOND}`} overflow="visible">
                                  <rect
                                    x={cx}
                                    y={0}
                                    width={size}
                                    height={size}
                                    rx={1}
                                    transform={`rotate(45,${cx},${cx})`}
                                    fill={filled ? clr : "white"}
                                    stroke={clr}
                                    strokeWidth={1.5}
                                  />
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {/* Footer today label */}
          <div className="flex relative bg-secondary/20 border-t border-border" style={{ height: 20 }}>
            <div style={{ width: LABEL_WIDTH }} className="shrink-0" />
            <div className="flex-1 relative">
              <div
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: `calc(${todayX * 100}% - 0px)`, transform: "translateX(-50%)" }}
              >
                <span className="text-[9px] font-bold text-red-500 whitespace-nowrap bg-card/90 px-1 rounded border border-red-300/40">
                  Today
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-t border-border bg-secondary/20 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-full bg-primary/15 border border-primary/60" />
          <span>Project bar (filled = progress)</span>
        </div>
        {[
          { status: "approved", label: "Approved milestone", clr: "#16a34a", filled: true },
          { status: "submitted", label: "Pending milestone", clr: "#d97706", filled: false },
          { status: "pending", label: "Upcoming milestone", clr: "#6b7280", filled: false },
          { status: "rejected", label: "Rejected milestone", clr: "#dc2626", filled: false },
        ].map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <svg width={10} height={10} viewBox="0 0 10 10" overflow="visible">
              <rect
                x={5} y={0} width={7.07} height={7.07} rx={1}
                transform="rotate(45,5,5)"
                fill={item.filled ? item.clr : "white"}
                stroke={item.clr}
                strokeWidth={1.5}
              />
            </svg>
            <span>{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-px h-3 bg-red-400" />
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}
