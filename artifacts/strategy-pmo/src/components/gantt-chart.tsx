import { useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  useListSpmoProjects,
  useListSpmoPillars,
  useListSpmoInitiatives,
  useListSpmoAllMilestones,
  type SpmoProjectWithProgress,
} from "@workspace/api-client-react";
import { useListDependencies, type DepEnrichedRow } from "@/hooks/use-dependencies";
import {
  Loader2, ChevronDown, ChevronRight,
  CalendarDays, X, Minus, Plus, ArrowRight,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────
const ROW_H = 52;
const GROUP_H = 36;
const HEADER_H = 58;  // quarter row + month row
const QUARTER_H = 22;
const MONTH_H = 36;
const LABEL_W = 264;
const DIAMOND = 12;

// Zoom levels: px per day (from widest to narrowest)
const ZOOM_PX_PER_DAY = [0.8, 1.5, 2.8, 4.5, 8, 14];
const ZOOM_LABELS = ["Annual", "Half-Year", "Quarter", "Month", "Biweek", "Week"];
const DEFAULT_ZOOM = 2; // "Quarter" — shows ~1 year on a typical screen

// ─── Helpers ──────────────────────────────────────────────────────
function toDate(s: string | null | undefined | Date): Date | null {
  if (!s) return null;
  if (s instanceof Date) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function fmtShort(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}
function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}
function daysBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

// ─── Color helpers ────────────────────────────────────────────────
function statusColors(project: SpmoProjectWithProgress) {
  const cs = project.computedStatus?.status ?? "";
  if (project.status === "completed" || cs === "completed")
    return { track: "#2563eb", fill: "#3b82f6", text: "#fff", glow: "rgba(59,130,246,0.25)" };
  if (project.status === "on_hold")
    return { track: "#64748b", fill: "#94a3b8", text: "#fff", glow: "rgba(148,163,184,0.20)" };
  if (cs === "delayed")
    return { track: "#dc2626", fill: "#ef4444", text: "#fff", glow: "rgba(239,68,68,0.25)" };
  if (cs === "at_risk")
    return { track: "#d97706", fill: "#f59e0b", text: "#fff", glow: "rgba(245,158,11,0.25)" };
  if (cs === "on_track")
    return { track: "#16a34a", fill: "#22c55e", text: "#fff", glow: "rgba(34,197,94,0.25)" };
  return { track: "#6366f1", fill: "#818cf8", text: "#fff", glow: "rgba(99,102,241,0.20)" };
}
function statusLabel(p: SpmoProjectWithProgress) {
  const cs = p.computedStatus?.status ?? "";
  if (p.status === "completed" || cs === "completed") return "Completed";
  if (p.status === "on_hold") return "On Hold";
  if (cs === "delayed") return "Delayed";
  if (cs === "at_risk") return "At Risk";
  if (cs === "on_track") return "On Track";
  return "Planning";
}
function milestoneColors(status: string) {
  if (status === "approved") return { stroke: "#16a34a", fill: "#16a34a", shadow: "rgba(22,163,74,0.4)" };
  if (status === "submitted") return { stroke: "#d97706", fill: "#fff", shadow: "rgba(217,119,6,0.3)" };
  if (status === "rejected") return { stroke: "#dc2626", fill: "#fff", shadow: "rgba(220,38,38,0.3)" };
  return { stroke: "#6b7280", fill: "#f3f4f6", shadow: "rgba(107,114,128,0.2)" };
}
function hex2rgba(hex: string, a = 1) {
  const h = (hex ?? "#6366f1").replace("#", "").padStart(6, "0");
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
}

// ─── Types ────────────────────────────────────────────────────────
type GanttPillar = { id: number; name: string; color: string };
type GanttMilestone = { id: number; name: string; dueDate: Date; status: string };
type GanttRow = { project: SpmoProjectWithProgress; pillar: GanttPillar | undefined; milestones: GanttMilestone[] };
type PillarGroup = { pillar: GanttPillar | undefined; pillarId: number; rows: GanttRow[] };

interface GanttChartProps {
  pillarFilter: number | "all";
  departmentFilter: number | "all";
}

interface HoverCard {
  project: SpmoProjectWithProgress;
  pillar: GanttPillar | undefined;
  milestones: GanttMilestone[];
  screenX: number;
  screenY: number;
}

// ─── Component ────────────────────────────────────────────────────
export function GanttChart({ pillarFilter, departmentFilter }: GanttChartProps) {
  const TODAY = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [, setLocation] = useLocation();
  const { data: projectsData, isLoading: projLoading } = useListSpmoProjects();
  const { data: pillarsData } = useListSpmoPillars();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: milestonesData } = useListSpmoAllMilestones();
  const { data: depsData } = useListDependencies();

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);
  const [hoveredDepId, setHoveredDepId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pillars = useMemo(() => (pillarsData?.pillars ?? []) as GanttPillar[], [pillarsData]);
  const pillarMap = useMemo(() => new Map(pillars.map(p => [p.id, p])), [pillars]);

  const initiativeMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of initiativesData?.initiatives ?? []) m.set(i.id, i.pillarId);
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

  // ── Date range ──
  const { chartStart, chartEnd } = useMemo(() => {
    const uf = dateFrom ? new Date(dateFrom) : null;
    const ut = dateTo ? new Date(dateTo) : null;
    if (uf && ut && uf <= ut) {
      return {
        chartStart: new Date(uf.getFullYear(), uf.getMonth(), 1),
        chartEnd: new Date(ut.getFullYear(), ut.getMonth() + 1, 28),
      };
    }
    // Default: 3 months before today to 12 months after today, expanded by project dates
    let minT = new Date(TODAY.getFullYear(), TODAY.getMonth() - 3, 1).getTime();
    let maxT = new Date(TODAY.getFullYear(), TODAY.getMonth() + 13, 1).getTime();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, dateFrom, dateTo]);

  // ── Timeline geometry ──
  const pxPerDay = ZOOM_PX_PER_DAY[zoomIdx];
  const totalDays = daysBetween(chartStart, chartEnd);
  const timelineWidth = Math.max(600, Math.round(totalDays * pxPerDay));

  const xPx = useCallback((date: Date): number => {
    return Math.round(daysBetween(chartStart, date) * pxPerDay);
  }, [chartStart, pxPerDay]);

  const todayX = xPx(TODAY);

  // Auto-scroll to today's date on mount
  const didScroll = useRef(false);
  const scrollToToday = useCallback(() => {
    if (!scrollRef.current || didScroll.current) return;
    // Scroll so today appears ~20% from left edge
    const scrollTarget = Math.max(0, todayX - scrollRef.current.clientWidth * 0.2);
    scrollRef.current.scrollLeft = scrollTarget;
    didScroll.current = true;
  }, [todayX]);

  // Reset scroll flag when zoom changes so it re-centers on today
  const prevZoom = useRef(zoomIdx);
  if (prevZoom.current !== zoomIdx) {
    didScroll.current = false;
    prevZoom.current = zoomIdx;
  }

  // ── Quarter + Month headers ──
  const { quarters, months } = useMemo(() => {
    const qs: Array<{ label: string; left: number; width: number }> = [];
    const ms: Array<{ label: string; left: number; width: number; alt: boolean }> = [];
    let cur = new Date(chartStart);
    let qLabel = "";
    let qLeft = 0;
    let mIdx = 0;
    while (cur < chartEnd) {
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const endOfMonth = nextMonth < chartEnd ? nextMonth : chartEnd;
      const left = xPx(cur);
      const width = xPx(endOfMonth) - left;
      const mo = cur.toLocaleDateString("en-GB", { month: "short" });
      ms.push({ label: mo, left, width, alt: mIdx % 2 === 1 });
      mIdx++;
      // Quarter grouping
      const q = Math.floor(cur.getMonth() / 3) + 1;
      const yr = cur.getFullYear();
      const newQLabel = `Q${q} ${yr}`;
      if (newQLabel !== qLabel) {
        if (qLabel) qs[qs.length - 1].width = left - qLeft;
        qLabel = newQLabel;
        qLeft = left;
        qs.push({ label: newQLabel, left, width: 0 });
      }
      cur = nextMonth;
    }
    if (qs.length > 0) qs[qs.length - 1].width = timelineWidth - qLeft;
    return { quarters: qs, months: ms };
  }, [chartStart, chartEnd, xPx, timelineWidth]);

  // ── Row position map (projectId → yCenter in timeline area) ──
  const rowYMap = useMemo(() => {
    const map = new Map<number, number>();
    let y = HEADER_H;
    for (const g of groups) {
      y += GROUP_H;
      if (!collapsed.has(g.pillarId)) {
        for (const row of g.rows) {
          map.set(row.project.id, y + ROW_H / 2);
          y += ROW_H;
        }
      }
    }
    return map;
  }, [groups, collapsed]);

  // ── Bar position map (projectId → {x1, x2}) ──
  const barXMap = useMemo(() => {
    const map = new Map<number, { x1: number; x2: number }>();
    for (const g of groups) {
      for (const row of g.rows) {
        const sd = toDate(row.project.startDate);
        const td = toDate(row.project.targetDate);
        if (sd && td) {
          map.set(row.project.id, { x1: xPx(sd), x2: xPx(td) });
        }
      }
    }
    return map;
  }, [groups, xPx]);

  // ── Dependency lines data ──
  const depLines = useMemo(() => {
    const deps = (depsData?.dependencies ?? []) as DepEnrichedRow[];
    return deps
      .filter(d => d.depType === "proj-proj")
      .map(d => {
        const srcY = rowYMap.get(d.sourceId);
        const tgtY = rowYMap.get(d.targetId);
        const srcX = barXMap.get(d.sourceId);
        const tgtX = barXMap.get(d.targetId);
        if (srcY === undefined || tgtY === undefined || !srcX || !tgtX) return null;
        return { dep: d, srcX: srcX.x2, srcY, tgtX: tgtX.x1, tgtY };
      })
      .filter(Boolean) as Array<{ dep: DepEnrichedRow; srcX: number; srcY: number; tgtX: number; tgtY: number }>;
  }, [depsData, rowYMap, barXMap]);

  // ── Total chart height ──
  const chartHeight = useMemo(() => {
    let h = HEADER_H;
    for (const g of groups) {
      h += GROUP_H;
      if (!collapsed.has(g.pillarId)) h += g.rows.length * ROW_H;
    }
    return h + 28; // footer
  }, [groups, collapsed]);

  function toggleGroup(id: number) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleProjectClick(project: SpmoProjectWithProgress) {
    setLocation(`/projects/${project.id}`);
  }

  if (projLoading)
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (groups.length === 0)
    return (
      <div className="rounded-2xl border border-border bg-card py-16 text-center">
        <p className="text-muted-foreground">No projects match the selected filters.</p>
      </div>
    );

  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm" ref={containerRef}>
      {/* ── Controls bar ── */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-secondary/20 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">Project Timeline</span>
          {depLines.length > 0 && (
            <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {depLines.length} dep{depLines.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Date filter */}
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {hasDateFilter && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="p-1 rounded hover:bg-secondary text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {/* Zoom */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg px-1 py-1">
            <button
              onClick={() => setZoomIdx(z => Math.max(0, z - 1))}
              disabled={zoomIdx === 0}
              className="p-1 rounded text-muted-foreground hover:bg-background disabled:opacity-30 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-semibold text-muted-foreground min-w-[46px] text-center">
              {ZOOM_LABELS[zoomIdx]}
            </span>
            <button
              onClick={() => setZoomIdx(z => Math.min(ZOOM_PX_PER_DAY.length - 1, z + 1))}
              disabled={zoomIdx === ZOOM_PX_PER_DAY.length - 1}
              className="p-1 rounded text-muted-foreground hover:bg-background disabled:opacity-30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Hover card ── */}
      <AnimatePresence>
        {hoverCard && (
          <motion.div
            key="gantt-hover"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="fixed z-[200] pointer-events-none bg-popover border border-border rounded-2xl shadow-2xl p-4 text-left"
            style={{
              width: 280,
              top: Math.max(8, hoverCard.screenY - 10),
              left: Math.min(hoverCard.screenX + 14, window.innerWidth - 296),
            }}
          >
            {/* Status stripe */}
            <div
              className="h-1 rounded-full mb-3"
              style={{ background: statusColors(hoverCard.project).fill }}
            />
            <p className="font-bold text-sm text-foreground leading-tight mb-0.5 line-clamp-2">
              {hoverCard.project.name}
            </p>
            {hoverCard.pillar && (
              <p className="text-[11px] font-medium mb-1" style={{ color: hoverCard.pillar.color }}>
                {hoverCard.pillar.name}
              </p>
            )}
            {hoverCard.project.ownerName && (
              <p className="text-xs text-muted-foreground mb-3">{hoverCard.project.ownerName}</p>
            )}
            {/* Progress */}
            <div className="mb-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-bold">{hoverCard.project.progress ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hoverCard.project.progress ?? 0}%`,
                    background: statusColors(hoverCard.project).fill,
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-2">
              <span className="text-muted-foreground">Status</span>
              <span className="font-semibold">{statusLabel(hoverCard.project)}</span>
              {toDate(hoverCard.project.startDate) && (
                <>
                  <span className="text-muted-foreground">Start</span>
                  <span>{fmtShort(toDate(hoverCard.project.startDate)!)}</span>
                </>
              )}
              {toDate(hoverCard.project.targetDate) && (
                <>
                  <span className="text-muted-foreground">Target</span>
                  <span>{fmtShort(toDate(hoverCard.project.targetDate)!)}</span>
                </>
              )}
              {hoverCard.project.budget && (
                <>
                  <span className="text-muted-foreground">Budget</span>
                  <span>{fmtNum(Math.round(hoverCard.project.budget / 1_000_000))}M SAR</span>
                </>
              )}
            </div>
            {hoverCard.milestones.length > 0 && (
              <div className="border-t border-border pt-2 mt-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {hoverCard.milestones.length} Milestone{hoverCard.milestones.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-1">
                  {hoverCard.milestones.slice(0, 4).map(ms => {
                    const mc = milestoneColors(ms.status);
                    return (
                      <div key={ms.id} className="flex items-center gap-1.5 text-[11px]">
                        <div className="w-2 h-2 rounded-sm rotate-45 shrink-0" style={{ background: mc.fill, border: `1.5px solid ${mc.stroke}` }} />
                        <span className="truncate text-foreground/80">{ms.name}</span>
                        <span className="ml-auto text-muted-foreground shrink-0">{fmtShort(ms.dueDate)}</span>
                      </div>
                    );
                  })}
                  {hoverCard.milestones.length > 4 && (
                    <p className="text-[10px] text-muted-foreground">+{hoverCard.milestones.length - 4} more</p>
                  )}
                </div>
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-border flex items-center gap-1 text-[11px] text-primary font-medium">
              <ArrowRight className="w-3 h-3" />
              Click bar to open project
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scrollable chart ── */}
      <div ref={(el) => { (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el; if (el) setTimeout(scrollToToday, 50); }} className="overflow-auto">
        <div style={{ minWidth: LABEL_W + timelineWidth, position: "relative" }}>
          {/* === HEADER (sticky) === */}
          <div className="sticky top-0 z-30" style={{ height: HEADER_H }}>
            <div className="flex" style={{ height: HEADER_H }}>
              {/* Label column header */}
              <div
                className="shrink-0 border-r border-b border-border bg-secondary/60 flex items-end px-4 pb-2"
                style={{ width: LABEL_W, height: HEADER_H }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Project</span>
              </div>
              {/* Timeline header */}
              <div className="relative border-b border-border" style={{ width: timelineWidth, flexShrink: 0 }}>
                {/* Quarter row */}
                <div className="absolute top-0 left-0 right-0 bg-secondary/60" style={{ height: QUARTER_H }}>
                  {quarters.map((q, i) => (
                    <div
                      key={i}
                      className="absolute flex items-center px-2 border-r border-border/40"
                      style={{ left: q.left, width: q.width, top: 0, height: QUARTER_H }}
                    >
                      <span className="text-[10px] font-bold text-primary/80 truncate">{q.label}</span>
                    </div>
                  ))}
                </div>
                {/* Month row */}
                <div
                  className="absolute left-0 right-0 bg-background/40"
                  style={{ top: QUARTER_H, height: MONTH_H }}
                >
                  {months.map((m, i) => (
                    <div
                      key={i}
                      className={`absolute flex items-center justify-center border-r border-border/30 ${m.alt ? "bg-secondary/20" : ""}`}
                      style={{ left: m.left, width: m.width, top: 0, height: MONTH_H }}
                    >
                      {m.width >= 20 && (
                        <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
                          {m.width < 40 ? m.label.charAt(0) : m.label}
                        </span>
                      )}
                    </div>
                  ))}
                  {/* Today on header */}
                  <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: todayX }} />
                </div>
              </div>
            </div>
          </div>

          {/* === SVG DEPENDENCY LAYER === */}
          {depLines.length > 0 && (
            <svg
              className="absolute pointer-events-none z-20"
              style={{ left: LABEL_W, top: 0, width: timelineWidth, height: chartHeight }}
              overflow="visible"
            >
              <defs>
                <marker id="arr-normal" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" opacity="0.7" />
                </marker>
                <marker id="arr-hard" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#f59e0b" opacity="0.8" />
                </marker>
                <marker id="arr-hover" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
                </marker>
              </defs>
              {depLines.map(({ dep, srcX, srcY, tgtX, tgtY }) => {
                const isHovered = hoveredDepId === dep.id ||
                  hoveredProjectId === dep.sourceId ||
                  hoveredProjectId === dep.targetId;
                const cx1 = srcX + Math.max(20, Math.abs(tgtX - srcX) * 0.4);
                const cx2 = tgtX - Math.max(20, Math.abs(tgtX - srcX) * 0.4);
                const color = dep.isHard ? "#f59e0b" : "#6366f1";
                const markerId = dep.isHard ? "arr-hard" : "arr-normal";
                return (
                  <g key={dep.id}>
                    {/* Wide invisible hit area */}
                    <path
                      d={`M${srcX},${srcY} C${cx1},${srcY} ${cx2},${tgtY} ${tgtX},${tgtY}`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      className="pointer-events-auto cursor-pointer"
                      onMouseEnter={() => setHoveredDepId(dep.id)}
                      onMouseLeave={() => setHoveredDepId(null)}
                      onClick={() => setLocation(`/projects/${dep.targetId}`)}
                    />
                    {/* Visible line */}
                    <path
                      d={`M${srcX},${srcY} C${cx1},${srcY} ${cx2},${tgtY} ${tgtX},${tgtY}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeDasharray={dep.isHard ? undefined : "5,4"}
                      opacity={isHovered ? 1 : 0.55}
                      markerEnd={`url(#${isHovered ? "arr-hover" : markerId})`}
                      style={{ transition: "opacity 0.15s, stroke-width 0.15s" }}
                    />
                    {/* Dep label on hover */}
                    {isHovered && (
                      <text
                        x={(srcX + tgtX) / 2}
                        y={((srcY + tgtY) / 2) - 6}
                        textAnchor="middle"
                        fontSize={10}
                        fill={color}
                        fontWeight={600}
                        className="pointer-events-none select-none"
                      >
                        {dep.isHard ? "Hard" : "Soft"} dep{dep.lagDays > 0 ? ` +${dep.lagDays}d` : ""}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* === ROWS === */}
          {groups.map(g => {
            const isCollapsed = collapsed.has(g.pillarId);
            const pillarColor = g.pillar?.color ?? "#6366f1";
            return (
              <div key={g.pillarId}>
                {/* Pillar group header */}
                <button
                  onClick={() => toggleGroup(g.pillarId)}
                  className="flex w-full border-b border-border/60 hover:brightness-95 transition-all"
                  style={{ height: GROUP_H, background: hex2rgba(pillarColor, 0.05) }}
                >
                  <div
                    className="shrink-0 border-r border-border flex items-center gap-2 px-3"
                    style={{ width: LABEL_W, borderLeft: `3px solid ${pillarColor}` }}
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    }
                    <span className="text-[11px] font-bold truncate" style={{ color: pillarColor }}>
                      {g.pillar?.name ?? "Unassigned"}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-medium shrink-0 bg-background/60 rounded px-1">
                      {g.rows.length}
                    </span>
                  </div>
                  <div className="relative flex-1" style={{ height: GROUP_H }}>
                    {months.map((m, i) => (
                      <div
                        key={i}
                        className={`absolute top-0 bottom-0 border-r border-border/20 ${m.alt ? "bg-black/[0.015]" : ""}`}
                        style={{ left: m.left, width: m.width }}
                      />
                    ))}
                    <div className="absolute top-0 bottom-0 w-px bg-red-400/30" style={{ left: todayX }} />
                  </div>
                </button>

                {/* Project rows */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && g.rows.map(row => {
                    const sd = toDate(row.project.startDate);
                    const td = toDate(row.project.targetDate);
                    const colors = statusColors(row.project);
                    const pct = Math.min(100, row.project.progress ?? 0);
                    const barL = sd ? xPx(sd) : -1;
                    const barW = sd && td ? Math.max(6, xPx(td) - barL) : 0;
                    const isHovered = hoveredProjectId === row.project.id;
                    const isDepRelated = depLines.some(
                      d => d.dep.sourceId === row.project.id || d.dep.targetId === row.project.id
                    );

                    return (
                      <motion.div
                        key={row.project.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: ROW_H }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.16 }}
                        className="flex border-b border-border/20 overflow-hidden"
                        style={{
                          background: isHovered
                            ? hex2rgba(pillarColor, 0.06)
                            : isDepRelated && hoveredDepId !== null
                              ? "rgba(99,102,241,0.04)"
                              : undefined,
                        }}
                        onMouseLeave={() => { setHoveredProjectId(null); setHoverCard(null); }}
                      >
                        {/* Label */}
                        <div
                          className="shrink-0 border-r border-border/40 flex items-center px-3 gap-2 cursor-pointer group"
                          style={{ width: LABEL_W, height: ROW_H }}
                          onClick={() => handleProjectClick(row.project)}
                          onMouseEnter={() => setHoveredProjectId(row.project.id)}
                        >
                          <div className="w-1 h-7 rounded-full shrink-0 opacity-70" style={{ background: pillarColor }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate leading-tight group-hover:text-primary transition-colors">
                              {row.project.name}
                            </p>
                            {row.project.ownerName && (
                              <p className="text-[10px] text-muted-foreground truncate">{row.project.ownerName}</p>
                            )}
                          </div>
                          {/* dep indicator */}
                          {isDepRelated && (
                            <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/50" title="Has dependencies" />
                          )}
                        </div>

                        {/* Timeline */}
                        <div
                          className="relative flex items-center"
                          style={{ width: timelineWidth, flexShrink: 0, height: ROW_H }}
                          onMouseEnter={(e) => {
                            setHoveredProjectId(row.project.id);
                            setHoverCard({
                              project: row.project,
                              pillar: row.pillar,
                              milestones: row.milestones,
                              screenX: e.clientX,
                              screenY: e.clientY,
                            });
                          }}
                          onMouseMove={(e) => {
                            setHoverCard(prev => prev ? { ...prev, screenX: e.clientX, screenY: e.clientY } : null);
                          }}
                        >
                          {/* Alternating column backgrounds */}
                          {months.map((m, i) => (
                            <div
                              key={i}
                              className={`absolute top-0 bottom-0 border-r border-border/10 ${m.alt ? "bg-secondary/20" : ""}`}
                              style={{ left: m.left, width: m.width }}
                            />
                          ))}

                          {/* Today line */}
                          <div className="absolute top-0 bottom-0 w-px bg-red-400/40 z-10" style={{ left: todayX }} />

                          {/* Project bar */}
                          {sd && td && barW > 0 && (
                            <div
                              className="absolute z-20 rounded-full overflow-hidden cursor-pointer group/bar"
                              style={{
                                left: barL,
                                width: barW,
                                height: 26,
                                top: "50%",
                                marginTop: -13,
                                background: hex2rgba(colors.track, 0.12),
                                border: `1.5px solid ${colors.track}`,
                                boxShadow: isHovered ? `0 0 0 3px ${colors.glow}` : undefined,
                                transition: "box-shadow 0.15s",
                              }}
                              onClick={() => handleProjectClick(row.project)}
                            >
                              {/* Progress fill */}
                              <motion.div
                                className="h-full rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.7, ease: "easeOut" }}
                                style={{ background: colors.fill }}
                              />
                              {/* Progress % label inside bar */}
                              {barW > 40 && (
                                <div
                                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                >
                                  <span
                                    className="text-[10px] font-bold leading-none select-none"
                                    style={{
                                      color: pct > 45 ? "#fff" : colors.track,
                                      mixBlendMode: "multiply",
                                      filter: pct > 45 ? "none" : "none",
                                    }}
                                  >
                                    {pct}%
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Milestone diamonds */}
                          {row.milestones.map(ms => {
                            const mx = xPx(ms.dueDate);
                            const mc = milestoneColors(ms.status);
                            const half = DIAMOND / 2;
                            return (
                              <div
                                key={ms.id}
                                className="absolute z-30 cursor-default"
                                style={{
                                  left: mx - half,
                                  top: "50%",
                                  marginTop: -half,
                                  width: DIAMOND,
                                  height: DIAMOND,
                                  filter: `drop-shadow(0 0 3px ${mc.shadow})`,
                                }}
                                title={`${ms.name} · ${fmtShort(ms.dueDate)} · ${ms.status}`}
                              >
                                <svg width={DIAMOND} height={DIAMOND} viewBox={`0 0 ${DIAMOND} ${DIAMOND}`} overflow="visible">
                                  <rect
                                    x={half} y={0}
                                    width={half * 1.414} height={half * 1.414}
                                    rx={1.2}
                                    transform={`rotate(45,${half},${half})`}
                                    fill={mc.fill}
                                    stroke={mc.stroke}
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

          {/* === Footer: TODAY label === */}
          <div className="flex relative border-t border-border bg-secondary/10" style={{ height: 28 }}>
            <div style={{ width: LABEL_W }} className="shrink-0" />
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

      {/* === Legend === */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 border-t border-border bg-secondary/10 text-[11px] text-muted-foreground">
        <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Status:</span>
        {[
          { c: "#16a34a", l: "On Track" }, { c: "#d97706", l: "At Risk" },
          { c: "#dc2626", l: "Delayed" }, { c: "#2563eb", l: "Completed" }, { c: "#64748b", l: "On Hold" },
        ].map(({ c, l }) => (
          <div key={l} className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-full" style={{ background: `${c}22`, border: `1.5px solid ${c}` }} />
            {l}
          </div>
        ))}
        <span className="text-border">|</span>
        <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Milestones:</span>
        {[
          { stroke: "#16a34a", fill: "#16a34a", l: "Approved" },
          { stroke: "#d97706", fill: "#fff", l: "Pending" },
          { stroke: "#dc2626", fill: "#fff", l: "Rejected" },
        ].map(({ stroke, fill, l }) => (
          <div key={l} className="flex items-center gap-1.5">
            <svg width={10} height={10} viewBox="0 0 10 10">
              <rect x={5} y={0} width={7.07} height={7.07} rx={1} transform="rotate(45,5,5)"
                fill={fill} stroke={stroke} strokeWidth={1.5} />
            </svg>
            {l}
          </div>
        ))}
        {depLines.length > 0 && (
          <>
            <span className="text-border">|</span>
            <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Dependencies:</span>
            <div className="flex items-center gap-1.5">
              <svg width={28} height={8}><line x1={0} y1={4} x2={22} y2={4} stroke="#f59e0b" strokeWidth={1.5} markerEnd="url(#arr-hard-legend)" />
                <defs><marker id="arr-hard-legend" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#f59e0b" /></marker></defs>
              </svg>
              Hard
            </div>
            <div className="flex items-center gap-1.5">
              <svg width={28} height={8}><line x1={0} y1={4} x2={22} y2={4} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arr-soft-legend)" />
                <defs><marker id="arr-soft-legend" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#6366f1" /></marker></defs>
              </svg>
              Soft
            </div>
          </>
        )}
        <span className="text-border">|</span>
        <div className="flex items-center gap-1.5">
          <div className="w-px h-3 bg-red-500" />
          Today
        </div>
      </div>
    </div>
  );
}
