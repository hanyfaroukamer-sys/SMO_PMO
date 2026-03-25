import { useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListSpmoProjects,
  useListSpmoPillars,
  useListSpmoInitiatives,
  useListSpmoAllMilestones,
  type SpmoProjectWithProgress,
} from "@workspace/api-client-react";
import { Loader2, ChevronDown, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

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
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 52;
const LABEL_WIDTH = 256;
const DIAMOND = 10;

function statusBarColor(project: SpmoProjectWithProgress): { bg: string; fill: string; border: string } {
  const cs = project.computedStatus?.status ?? "";
  if (project.status === "completed" || cs === "completed")
    return { bg: "rgba(37,99,235,0.10)", fill: "rgba(37,99,235,0.55)", border: "#2563eb" };
  if (project.status === "on_hold")
    return { bg: "rgba(100,116,139,0.10)", fill: "rgba(100,116,139,0.45)", border: "#64748b" };
  if (cs === "delayed")
    return { bg: "rgba(220,38,38,0.10)", fill: "rgba(220,38,38,0.45)", border: "#dc2626" };
  if (cs === "at_risk")
    return { bg: "rgba(217,119,6,0.10)", fill: "rgba(217,119,6,0.45)", border: "#d97706" };
  if (cs === "on_track")
    return { bg: "rgba(22,163,74,0.10)", fill: "rgba(22,163,74,0.45)", border: "#16a34a" };
  return { bg: "rgba(99,102,241,0.10)", fill: "rgba(99,102,241,0.40)", border: "#6366f1" };
}

function statusLabel(project: SpmoProjectWithProgress): string {
  const cs = project.computedStatus?.status ?? "";
  if (project.status === "completed" || cs === "completed") return "Completed";
  if (project.status === "on_hold") return "On Hold";
  if (cs === "delayed") return "Delayed";
  if (cs === "at_risk") return "At Risk";
  if (cs === "on_track") return "On Track";
  return "—";
}

function milestoneColor(status: string): { stroke: string; fill: string } {
  if (status === "approved") return { stroke: "#16a34a", fill: "#16a34a" };
  if (status === "submitted") return { stroke: "#d97706", fill: "#fff" };
  if (status === "rejected") return { stroke: "#dc2626", fill: "#fff" };
  return { stroke: "#6b7280", fill: "#fff" };
}

function hex2rgba(hex: string, alpha = 1) {
  const h = (hex ?? "#6366f1").replace("#", "").padStart(6, "0");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface GanttChartProps {
  pillarFilter: number | "all";
  departmentFilter: number | "all";
}

interface Tooltip {
  project: SpmoProjectWithProgress;
  pillar: GanttPillar | undefined;
  milestones: GanttMilestone[];
  x: number;
  y: number;
}

export function GanttChart({ pillarFilter, departmentFilter }: GanttChartProps) {
  const { data: projectsData, isLoading: projLoading } = useListSpmoProjects();
  const { data: pillarsData } = useListSpmoPillars();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: milestonesData } = useListSpmoAllMilestones();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pillars = (pillarsData?.pillars ?? []) as GanttPillar[];
  const pillarMap = useMemo(() => new Map(pillars.map((p) => [p.id, p])), [pillars]);

  const initiativeMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const ini of initiativesData?.initiatives ?? []) m.set(ini.id, ini.pillarId);
    return m;
  }, [initiativesData]);

  const milestonesByProject = useMemo(() => {
    const map = new Map<number, GanttMilestone[]>();
    for (const item of milestonesData?.items ?? []) {
      const dd = toDate(item.milestone.dueDate as string | null | undefined);
      if (!dd) continue;
      const list = map.get(item.project.id) ?? [];
      list.push({
        id: item.milestone.id,
        name: item.milestone.name,
        dueDate: dd,
        status: item.milestone.status,
      });
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
    let minT = new Date(TODAY.getFullYear(), TODAY.getMonth() - 2, 1).getTime();
    let maxT = new Date(TODAY.getFullYear() + 1, TODAY.getMonth() + 2, 1).getTime();
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

  const monthHeaders = useMemo(() => {
    const months: Array<{ label: string; date: Date }> = [];
    let cur = new Date(chartStart);
    while (cur < chartEnd) {
      months.push({ label: formatMonthYear(cur), date: new Date(cur) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return months;
  }, [chartStart, chartEnd]);

  const MIN_COL_PX = [64, 104, 160][zoom - 1];
  const totalCols = monthHeaders.length;
  const timelineWidth = Math.max(600, totalCols * MIN_COL_PX);

  function xPx(date: Date): number {
    const totalMs = Math.max(1, chartEnd.getTime() - chartStart.getTime());
    const frac = Math.max(0, Math.min(1, (date.getTime() - chartStart.getTime()) / totalMs));
    return frac * timelineWidth;
  }

  const todayX = xPx(TODAY);

  function toggleGroup(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (projLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  if (groups.length === 0)
    return (
      <div className="rounded-2xl border border-border bg-card py-16 text-center">
        <p className="text-muted-foreground">No projects match the selected filters.</p>
      </div>
    );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm relative">
      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/20">
        <span className="text-sm font-semibold text-foreground">Project Timeline</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(1, z - 1))}
            disabled={zoom === 1}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground w-6 text-center">{zoom}x</span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 1))}
            disabled={zoom === 3}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            key="gantt-tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 pointer-events-none bg-popover border border-border rounded-xl shadow-xl px-3.5 py-3 text-left"
            style={{
              minWidth: 220,
              maxWidth: 300,
              top: tooltip.y + 10,
              left: Math.min(tooltip.x + 10, (containerRef.current?.clientWidth ?? 400) - 310),
            }}
          >
            <p className="font-semibold text-sm text-foreground leading-tight mb-1 line-clamp-2">
              {tooltip.project.name}
            </p>
            {tooltip.project.ownerName && (
              <p className="text-xs text-muted-foreground mb-2">{tooltip.project.ownerName}</p>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{tooltip.project.progress ?? 0}%</span>
              <span className="text-muted-foreground">Status</span>
              <span className="font-semibold">{statusLabel(tooltip.project)}</span>
              {toDate(tooltip.project.startDate) && (
                <>
                  <span className="text-muted-foreground">Start</span>
                  <span>{formatDateShort(toDate(tooltip.project.startDate)!)}</span>
                </>
              )}
              {toDate(tooltip.project.targetDate) && (
                <>
                  <span className="text-muted-foreground">Target</span>
                  <span>{formatDateShort(toDate(tooltip.project.targetDate)!)}</span>
                </>
              )}
              {tooltip.milestones.length > 0 && (
                <>
                  <span className="text-muted-foreground">Milestones</span>
                  <span>{tooltip.milestones.length}</span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable chart */}
      <div ref={containerRef} className="overflow-x-auto">
        <div style={{ minWidth: LABEL_WIDTH + timelineWidth }}>
          {/* Month header */}
          <div className="flex border-b border-border bg-secondary/30 sticky top-0 z-20" style={{ height: HEADER_HEIGHT }}>
            <div
              className="shrink-0 border-r border-border bg-secondary/50 flex items-end px-4 pb-2"
              style={{ width: LABEL_WIDTH }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project</span>
            </div>
            <div className="relative" style={{ width: timelineWidth, flexShrink: 0 }}>
              {monthHeaders.map((m, i) => {
                const colW = timelineWidth / totalCols;
                const left = i * colW;
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 flex items-center justify-center border-r border-border/25 overflow-hidden"
                    style={{ left, width: colW }}
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap px-1 truncate">
                      {m.label}
                    </span>
                  </div>
                );
              })}
              {/* Today line on header */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                style={{ left: todayX }}
              />
            </div>
          </div>

          {/* Groups */}
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.pillarId);
            const pillarColor = g.pillar?.color ?? "#6366f1";
            const colW = timelineWidth / totalCols;
            return (
              <div key={g.pillarId}>
                {/* Pillar group header */}
                <button
                  onClick={() => toggleGroup(g.pillarId)}
                  className="flex w-full border-b border-border hover:brightness-95 transition-all"
                  style={{ height: 40, background: hex2rgba(pillarColor, 0.06) }}
                >
                  <div
                    className="shrink-0 border-r border-border flex items-center gap-2 px-3"
                    style={{ width: LABEL_WIDTH, borderLeft: `3px solid ${pillarColor}` }}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-[11px] font-bold truncate" style={{ color: pillarColor }}>
                      {g.pillar?.name ?? "Unassigned"}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-medium shrink-0">
                      {g.rows.length}
                    </span>
                  </div>
                  <div className="relative" style={{ width: timelineWidth, flexShrink: 0 }}>
                    {monthHeaders.map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-r border-border/15"
                        style={{ left: i * colW, width: colW }}
                      />
                    ))}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-400/40" style={{ left: todayX }} />
                  </div>
                </button>

                {/* Project rows */}
                <AnimatePresence initial={false}>
                  {!isCollapsed &&
                    g.rows.map((row) => {
                      const sd = toDate(row.project.startDate);
                      const td = toDate(row.project.targetDate);
                      const barL = sd ? xPx(sd) : 0;
                      const barW = sd && td ? Math.max(4, xPx(td) - barL) : 0;
                      const colors = statusBarColor(row.project);

                      return (
                        <motion.div
                          key={row.project.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: ROW_HEIGHT }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="flex border-b border-border/30 hover:bg-secondary/10 transition-colors overflow-hidden"
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {/* Label cell */}
                          <div
                            className="shrink-0 border-r border-border/50 flex items-center px-3 gap-2 cursor-default"
                            style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
                            onMouseEnter={(e) => {
                              const rect = containerRef.current?.getBoundingClientRect();
                              const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setTooltip({
                                project: row.project,
                                pillar: row.pillar,
                                milestones: row.milestones,
                                x: elRect.left - (rect?.left ?? 0) + elRect.width,
                                y: elRect.top - (rect?.top ?? 0),
                              });
                            }}
                          >
                            <div
                              className="w-1.5 h-6 rounded-full shrink-0"
                              style={{ background: pillarColor }}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate leading-tight">{row.project.name}</p>
                              {row.project.ownerName && (
                                <p className="text-[10px] text-muted-foreground truncate">{row.project.ownerName}</p>
                              )}
                            </div>
                          </div>

                          {/* Timeline cell */}
                          <div
                            className="relative flex items-center"
                            style={{ width: timelineWidth, flexShrink: 0, height: ROW_HEIGHT }}
                          >
                            {/* Column shading */}
                            {monthHeaders.map((_, i) => (
                              <div
                                key={i}
                                className="absolute top-0 bottom-0 border-r border-border/10"
                                style={{ left: i * colW, width: colW }}
                              />
                            ))}

                            {/* Today line */}
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-red-400/40 z-10"
                              style={{ left: todayX }}
                            />

                            {/* Progress bar */}
                            {sd && td && barW > 0 && (
                              <div
                                className="absolute z-20 rounded-full overflow-hidden cursor-pointer"
                                style={{
                                  left: barL,
                                  width: barW,
                                  height: 22,
                                  background: colors.bg,
                                  border: `1.5px solid ${colors.border}`,
                                  top: "50%",
                                  marginTop: -11,
                                }}
                                onMouseEnter={(e) => {
                                  const rect = containerRef.current?.getBoundingClientRect();
                                  const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  setTooltip({
                                    project: row.project,
                                    pillar: row.pillar,
                                    milestones: row.milestones,
                                    x: elRect.left - (rect?.left ?? 0),
                                    y: elRect.top - (rect?.top ?? 0) - 130,
                                  });
                                }}
                              >
                                <motion.div
                                  className="h-full rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(100, row.project.progress ?? 0)}%` }}
                                  transition={{ duration: 0.6, ease: "easeOut" }}
                                  style={{ background: colors.fill }}
                                />
                              </div>
                            )}

                            {/* Milestone diamonds */}
                            {row.milestones.map((ms) => {
                              const mx = xPx(ms.dueDate);
                              const { stroke, fill } = milestoneColor(ms.status);
                              const size = DIAMOND * 0.707;
                              const cx = DIAMOND / 2;
                              return (
                                <div
                                  key={ms.id}
                                  className="absolute z-30"
                                  style={{
                                    left: mx - DIAMOND / 2,
                                    top: "50%",
                                    marginTop: -(DIAMOND / 2),
                                  }}
                                  title={`${ms.name} · ${formatDateShort(ms.dueDate)} · ${ms.status}`}
                                >
                                  <svg
                                    width={DIAMOND}
                                    height={DIAMOND}
                                    viewBox={`0 0 ${DIAMOND} ${DIAMOND}`}
                                    overflow="visible"
                                  >
                                    <rect
                                      x={cx}
                                      y={0}
                                      width={size}
                                      height={size}
                                      rx={1}
                                      transform={`rotate(45,${cx},${cx})`}
                                      fill={fill}
                                      stroke={stroke}
                                      strokeWidth={1.5}
                                    />
                                  </svg>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Footer today label */}
          <div className="flex relative bg-secondary/15 border-t border-border" style={{ height: 22 }}>
            <div style={{ width: LABEL_WIDTH }} className="shrink-0" />
            <div className="relative" style={{ width: timelineWidth, flexShrink: 0 }}>
              <div
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: todayX, transform: "translateX(-50%)" }}
              >
                <span className="text-[9px] font-bold text-red-500 whitespace-nowrap bg-card/90 px-1.5 py-0.5 rounded border border-red-300/50">
                  TODAY
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-t border-border bg-secondary/15 text-[11px] text-muted-foreground">
        {[
          { clr: "#16a34a", label: "On Track" },
          { clr: "#d97706", label: "At Risk" },
          { clr: "#dc2626", label: "Delayed" },
          { clr: "#2563eb", label: "Completed" },
          { clr: "#64748b", label: "On Hold" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="w-5 h-3 rounded-full"
              style={{ background: `${item.clr}22`, border: `1.5px solid ${item.clr}` }}
            />
            <span>{item.label}</span>
          </div>
        ))}
        {[
          { label: "Approved", stroke: "#16a34a", fill: true },
          { label: "Pending", stroke: "#d97706", fill: false },
          { label: "Rejected", stroke: "#dc2626", fill: false },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <svg width={10} height={10} viewBox="0 0 10 10">
              <rect
                x={5} y={0} width={7.07} height={7.07} rx={1}
                transform="rotate(45,5,5)"
                fill={item.fill ? item.stroke : "white"}
                stroke={item.stroke}
                strokeWidth={1.5}
              />
            </svg>
            <span>{item.label} milestone</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-red-500" />
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}
