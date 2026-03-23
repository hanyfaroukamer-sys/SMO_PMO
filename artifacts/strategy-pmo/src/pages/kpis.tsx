import { useState } from "react";
import type React from "react";
import {
  useListSpmoKpis,
  useListSpmoPillars,
  useCreateSpmoKpi,
  useUpdateSpmoKpi,
  useDeleteSpmoKpi,
  useListSpmoKpiMeasurements,
  useCreateSpmoKpiMeasurement,
  useDeleteSpmoKpiMeasurement,
  type CreateSpmoKpiRequest,
  type SpmoKpiMeasurement,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2, TrendingUp, Download, BarChart2, X } from "lucide-react";
import { exportToXlsx } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  computeKpiStatus,
  ENGINE_STATUS_LABEL,
  ENGINE_STATUS_ICON,
  type KpiEngineInput,
} from "@/lib/kpi-engine";

type KpiForm = {
  name: string;
  description: string;
  unit: string;
  target: string;
  actual: string;
  baseline: string;
  nextYearTarget: string;
  target2030: string;
  pillarId: string;
  kpiType: string;
  direction: string;
  measurementPeriod: string;
  periodStart: string;
  periodEnd: string;
  milestoneDue: string;
  milestoneDone: boolean;
  formula: string;
  targetRationale: string;
  category: string;
  measurementFrequency: string;
  target2026: string;
  target2027: string;
  target2028: string;
  target2029: string;
  actual2026: string;
  actual2027: string;
  actual2028: string;
  actual2029: string;
};

const emptyForm = (): KpiForm => ({
  name: "", description: "", unit: "%",
  target: "100", actual: "0", baseline: "0",
  nextYearTarget: "", target2030: "", pillarId: "",
  kpiType: "rate", direction: "higher", measurementPeriod: "annual",
  periodStart: "", periodEnd: "", milestoneDue: "", milestoneDone: false,
  formula: "", targetRationale: "", category: "", measurementFrequency: "annual",
  target2026: "", target2027: "", target2028: "", target2029: "",
  actual2026: "", actual2027: "", actual2028: "", actual2029: "",
});

type Kpi = {
  id: number;
  name: string;
  description?: string | null;
  unit: string;
  baseline: number;
  target: number;
  actual: number;
  nextYearTarget?: number | null;
  target2030?: number | null;
  pillarId: number | null;
  prevActual?: number | null;
  prevActualDt?: string | null;
  kpiType?: string | null;
  direction?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  milestoneDue?: string | null;
  milestoneDone?: boolean | null;
  formula?: string | null;
  targetRationale?: string | null;
  category?: string | null;
  measurementFrequency?: string | null;
  target2026?: number | null;
  target2027?: number | null;
  target2028?: number | null;
  target2029?: number | null;
  actual2026?: number | null;
  actual2027?: number | null;
  actual2028?: number | null;
  actual2029?: number | null;
};

function fmt(val: number | null | undefined, unit: string) {
  if (val == null) return "—";
  return `${val.toLocaleString()} ${unit}`.trim();
}

function vsTarget(actual: number, target: number) {
  if (target <= 0) return "—";
  return `${Math.round((actual / target) * 100)}%`;
}

function MiniBar({ actual, target }: { actual: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (actual / target) * 100)) : 0;
  return (
    <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── KPI Detail Modal ─────────────────────────────────────────────────────────

function KpiDetailModal({ kpi, pillarName, pillarColor, onClose }: {
  kpi: Kpi;
  pillarName?: string;
  pillarColor?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, queryKey } = useListSpmoKpiMeasurements(kpi.id);
  const createMeasurement = useCreateSpmoKpiMeasurement(kpi.id);
  const deleteMeasurement = useDeleteSpmoKpiMeasurement(kpi.id);
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newValue, setNewValue] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const measurements: SpmoKpiMeasurement[] = data?.measurements ?? [];
  const sorted = [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const chartData = sorted.map((m) => ({ date: m.measuredAt.slice(0, 7), value: m.value }));

  const engineInput: KpiEngineInput = {
    kpiType: (kpi.kpiType as KpiEngineInput["kpiType"]) ?? "rate",
    direction: (kpi.direction as KpiEngineInput["direction"]) ?? "higher",
    target: kpi.target, actual: kpi.actual, baseline: kpi.baseline ?? null,
    prevActual: kpi.prevActual ?? null, prevActualDt: kpi.prevActualDt ?? null,
    periodStart: kpi.periodStart ?? null, periodEnd: kpi.periodEnd ?? null,
    milestoneDue: kpi.milestoneDue ?? null, milestoneDone: kpi.milestoneDone ?? false,
    unit: kpi.unit,
  };

  const statusResult = computeKpiStatus(engineInput);
  const statusIcon = ENGINE_STATUS_ICON[statusResult.status];
  const statusLabel = ENGINE_STATUS_LABEL[statusResult.status];
  const statusColors: Record<string, string> = {
    on_track: "text-success bg-success/10 border-success/20",
    at_risk: "text-warning bg-warning/10 border-warning/20",
    off_track: "text-destructive bg-destructive/10 border-destructive/20",
    not_started: "text-muted-foreground bg-secondary border-border",
    complete: "text-success bg-success/10 border-success/20",
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue) return;
    setAdding(true);
    try {
      await createMeasurement.mutateAsync({ measuredAt: newDate, value: parseFloat(newValue), notes: newNotes || undefined });
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });
      toast({ title: "Measurement recorded" });
      setNewValue("");
      setNewNotes("");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this measurement?")) return;
    await deleteMeasurement.mutateAsync(id);
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });
    toast({ title: "Measurement deleted" });
  };

  const currentYear = new Date().getFullYear();
  const multiYear: Array<{ year: number; target: number | null | undefined; actual: number | null | undefined; isCurrent: boolean }> = [
    { year: 2026, target: kpi.target2026, actual: kpi.actual2026, isCurrent: currentYear === 2026 },
    { year: 2027, target: kpi.target2027, actual: kpi.actual2027, isCurrent: currentYear === 2027 },
    { year: 2028, target: kpi.target2028, actual: kpi.actual2028, isCurrent: currentYear === 2028 },
    { year: 2029, target: kpi.target2029, actual: kpi.actual2029, isCurrent: currentYear === 2029 },
    { year: 2030, target: kpi.target2030, actual: kpi.actual, isCurrent: currentYear === 2030 },
  ];
  const hasMultiYear = multiYear.some((r) => r.target != null || r.actual != null);

  const color = pillarColor ?? "hsl(221 83% 53%)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-border bg-gradient-to-r from-card to-secondary/20">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {pillarName && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: color }}>
                  {pillarName}
                </span>
              )}
              {kpi.category && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
                  {kpi.category}
                </span>
              )}
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[statusResult.status] ?? statusColors.not_started}`}>
                <span>{statusIcon}</span>
                {statusLabel}
              </span>
            </div>
            <h2 className="text-xl font-display font-bold text-foreground leading-tight">{kpi.name}</h2>
            {kpi.description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{kpi.description}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ── Quick stats strip ── */}
          <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
            {[
              { label: "Baseline", value: fmt(kpi.baseline, kpi.unit) },
              { label: `${currentYear} Target`, value: fmt(kpi.target, kpi.unit) },
              { label: "Actual", value: fmt(kpi.actual, kpi.unit) },
              { label: "Achievement", value: kpi.target > 0 ? `${Math.round((kpi.actual / kpi.target) * 100)}%` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">{label}</div>
                <div className="text-base font-display font-bold">{value}</div>
              </div>
            ))}
          </div>

          <div className="p-6 space-y-6">

            {/* ── KPI Metadata ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "KPI Type", value: kpi.kpiType ? kpi.kpiType.charAt(0).toUpperCase() + kpi.kpiType.slice(1) : "Rate" },
                { label: "Direction", value: kpi.direction === "higher" ? "Higher is better ↑" : "Lower is better ↓" },
                { label: "Freq.", value: kpi.measurementFrequency ? kpi.measurementFrequency.charAt(0).toUpperCase() + kpi.measurementFrequency.slice(1) : "Annual" },
                { label: "Unit", value: kpi.unit },
                { label: "Period Start", value: kpi.periodStart ?? "—" },
                { label: "Period End", value: kpi.periodEnd ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-secondary/30 rounded-xl px-4 py-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">{label}</div>
                  <div className="text-sm font-medium capitalize">{value}</div>
                </div>
              ))}
            </div>

            {/* ── Formula ── */}
            {kpi.formula && (
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                  <BarChart2 className="w-3 h-3" /> Calculation Formula
                </div>
                <p className="text-sm font-mono text-foreground leading-relaxed">{kpi.formula}</p>
              </div>
            )}

            {/* ── Target Rationale ── */}
            {kpi.targetRationale && (
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> Target Rationale
                </div>
                <p className="text-sm text-foreground leading-relaxed">{kpi.targetRationale}</p>
              </div>
            )}

            {/* ── Multi-year Targets Table ── */}
            {hasMultiYear && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Multi-Year Targets & Actuals (2026–2030)</h3>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Year</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Target</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Actual</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Achievement</th>
                        <th className="px-4 py-2.5 w-28">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {multiYear.map(({ year, target, actual, isCurrent }) => {
                        const achievementPct = target && actual != null ? Math.round((actual / target) * 100) : null;
                        const barPct = achievementPct != null ? Math.min(100, Math.max(0, achievementPct)) : 0;
                        const isGood = achievementPct != null && (kpi.direction === "lower" ? achievementPct <= 100 : achievementPct >= 80);
                        return (
                          <tr key={year} className={isCurrent ? "bg-primary/5 font-semibold" : "hover:bg-secondary/20"}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span>{year}</span>
                                {isCurrent && <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 font-bold">Current</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono">{fmt(target, kpi.unit)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold">{fmt(actual, kpi.unit)}</td>
                            <td className="px-4 py-3 text-right font-mono">
                              {achievementPct != null ? (
                                <span className={isGood ? "text-success" : "text-destructive"}>{achievementPct}%</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${barPct}%`, backgroundColor: isGood ? "hsl(142 76% 36%)" : color }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Sparkline ── */}
            {chartData.length >= 2 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Measurement Trend</h3>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)" }} />
                    <ReferenceLine y={kpi.target} stroke="var(--primary)" strokeDasharray="4 2" label={{ value: "Target", fontSize: 10, fill: "var(--primary)" }} />
                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Record New Measurement ── */}
            <div className="rounded-xl border border-border bg-secondary/10 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Record New Measurement</h3>
              <form onSubmit={handleAdd} className="flex items-end gap-2 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">Date</label>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={`${inputClass} w-36`} required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">Value ({kpi.unit})</label>
                  <input type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} className={`${inputClass} w-28`} placeholder="0" step="any" required />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[10px] text-muted-foreground">Notes (optional)</label>
                  <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className={inputClass} placeholder="e.g. Q1 data source: MIS report" />
                </div>
                <button type="submit" disabled={adding || !newValue} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors shrink-0">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                </button>
              </form>
            </div>

            {/* ── Measurement History ── */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Measurement History ({measurements.length})</h3>
              {isLoading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
              {!isLoading && measurements.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No measurements recorded yet. Use the form above to record the first one.</p>
              )}
              {measurements.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 border-b border-border text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Date</th>
                        <th className="px-4 py-2 text-right font-semibold">Value</th>
                        <th className="px-4 py-2 text-right font-semibold">vs Target</th>
                        <th className="px-4 py-2 text-left font-semibold">Notes</th>
                        <th className="px-4 py-2 text-left font-semibold">Recorded By</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)).map((m) => {
                        const ach = kpi.target > 0 ? Math.round((m.value / kpi.target) * 100) : null;
                        const isGood = ach != null && (kpi.direction === "lower" ? ach <= 100 : ach >= 80);
                        return (
                          <tr key={m.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{m.measuredAt.slice(0, 10)}</td>
                            <td className="px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap">{m.value.toLocaleString()} {kpi.unit}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-sm">
                              {ach != null ? <span className={isGood ? "text-success" : "text-destructive"}>{ach}%</span> : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{m.notes ?? "—"}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{m.recordedByName ?? "—"}</td>
                            <td className="px-2 py-2.5">
                              <button onClick={() => handleDelete(m.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function KPIs() {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useListSpmoKpis({ type: "strategic" });
  const { data: pillarsData } = useListSpmoPillars();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<KpiForm>(emptyForm());
  const [detailKpi, setDetailKpi] = useState<Kpi | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoKpi();
  const updateMutation = useUpdateSpmoKpi();
  const deleteMutation = useDeleteSpmoKpi();

  const pillars = pillarsData?.pillars ?? [];
  const kpis: Kpi[] = (data?.kpis ?? []) as Kpi[];

  const thisYear = new Date().getFullYear();
  const prevYear = thisYear - 1;
  const nextYear = thisYear + 1;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });

  function openCreate(presetPillarId?: number) {
    setEditId(null);
    setForm({ ...emptyForm(), pillarId: presetPillarId ? String(presetPillarId) : "" });
    setModalOpen(true);
  }

  function openEdit(kpi: Kpi) {
    setEditId(kpi.id);
    setForm({
      name: kpi.name,
      description: kpi.description ?? "",
      unit: kpi.unit ?? "%",
      target: String(kpi.target),
      actual: String(kpi.actual),
      baseline: String(kpi.baseline ?? 0),
      nextYearTarget: kpi.nextYearTarget != null ? String(kpi.nextYearTarget) : "",
      target2030: kpi.target2030 != null ? String(kpi.target2030) : "",
      pillarId: kpi.pillarId ? String(kpi.pillarId) : "",
      kpiType: kpi.kpiType ?? "rate",
      direction: kpi.direction ?? "higher",
      measurementPeriod: "annual",
      periodStart: kpi.periodStart ?? "",
      periodEnd: kpi.periodEnd ?? "",
      milestoneDue: kpi.milestoneDue ?? "",
      milestoneDone: kpi.milestoneDone ?? false,
      formula: kpi.formula ?? "",
      targetRationale: kpi.targetRationale ?? "",
      category: kpi.category ?? "",
      measurementFrequency: kpi.measurementFrequency ?? "annual",
      target2026: kpi.target2026 != null ? String(kpi.target2026) : "",
      target2027: kpi.target2027 != null ? String(kpi.target2027) : "",
      target2028: kpi.target2028 != null ? String(kpi.target2028) : "",
      target2029: kpi.target2029 != null ? String(kpi.target2029) : "",
      actual2026: kpi.actual2026 != null ? String(kpi.actual2026) : "",
      actual2027: kpi.actual2027 != null ? String(kpi.actual2027) : "",
      actual2028: kpi.actual2028 != null ? String(kpi.actual2028) : "",
      actual2029: kpi.actual2029 != null ? String(kpi.actual2029) : "",
    });
    setModalOpen(true);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete KPI "${name}"?`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Deleted" }); invalidate(); },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nyt = form.nextYearTarget ? parseFloat(form.nextYearTarget) : undefined;
    const t2030 = form.target2030 ? parseFloat(form.target2030) : undefined;
    const shared = {
      name: form.name,
      description: form.description || undefined,
      unit: form.unit,
      target: parseFloat(form.target) || 0,
      actual: parseFloat(form.actual) || 0,
      baseline: parseFloat(form.baseline) || 0,
      nextYearTarget: nyt,
      target2030: t2030,
      pillarId: form.pillarId ? parseInt(form.pillarId) : null,
      kpiType: form.kpiType as CreateSpmoKpiRequest["kpiType"],
      direction: form.direction as CreateSpmoKpiRequest["direction"],
      measurementPeriod: form.measurementPeriod as CreateSpmoKpiRequest["measurementPeriod"],
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      milestoneDue: form.milestoneDue || undefined,
      milestoneDone: form.milestoneDone,
      formula: form.formula || undefined,
      targetRationale: form.targetRationale || undefined,
      category: form.category || undefined,
      measurementFrequency: form.measurementFrequency as CreateSpmoKpiRequest["measurementFrequency"] || undefined,
      target2026: form.target2026 ? parseFloat(form.target2026) : undefined,
      target2027: form.target2027 ? parseFloat(form.target2027) : undefined,
      target2028: form.target2028 ? parseFloat(form.target2028) : undefined,
      target2029: form.target2029 ? parseFloat(form.target2029) : undefined,
      actual2026: form.actual2026 ? parseFloat(form.actual2026) : undefined,
      actual2027: form.actual2027 ? parseFloat(form.actual2027) : undefined,
      actual2028: form.actual2028 ? parseFloat(form.actual2028) : undefined,
      actual2029: form.actual2029 ? parseFloat(form.actual2029) : undefined,
    };
    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: shared }, {
        onSuccess: () => { toast({ title: "KPI Updated" }); setModalOpen(false); invalidate(); },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update KPI." }),
      });
    } else {
      const createPayload: CreateSpmoKpiRequest = {
        ...shared,
        type: "strategic",
        pillarId: form.pillarId ? parseInt(form.pillarId) : undefined,
      };
      createMutation.mutate({ data: createPayload }, {
        onSuccess: () => { toast({ title: "KPI Created" }); setModalOpen(false); invalidate(); },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to create KPI." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isMilestone = form.kpiType === "milestone";

  const kpisByPillar = new Map<number | null, Kpi[]>();
  for (const kpi of kpis) {
    const list = kpisByPillar.get(kpi.pillarId) ?? [];
    list.push(kpi);
    kpisByPillar.set(kpi.pillarId, list);
  }

  const groups: Array<{ pillarId: number | null; kpis: Kpi[] }> = [];
  for (const pillar of pillars) {
    const list = kpisByPillar.get(pillar.id);
    if (list && list.length > 0) groups.push({ pillarId: pillar.id, kpis: list });
  }
  const unlinked = kpisByPillar.get(null) ?? [];
  if (unlinked.length > 0) groups.push({ pillarId: null, kpis: unlinked });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="Strategic KPIs" description="Grouped by pillar — baseline, targets, actuals and 2030 outlook.">
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToXlsx(kpis.map((k) => ({
              Name: k.name,
              Unit: k.unit,
              Baseline: k.baseline,
              Target: k.target,
              Actual: k.actual,
              "2030 Target": k.target2030,
              Status: (k as { status?: string }).status ?? "",
            })), "strategic-kpis-export")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          {isAdmin && (
            <button onClick={() => openCreate()} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-all">
              <Plus className="w-4 h-4" /> Add KPI
            </button>
          )}
        </div>
      </PageHeader>

      {kpis.length === 0 ? (
        <Card className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No strategic KPIs defined yet.</p>
          {isAdmin && <button onClick={() => openCreate()} className="mt-4 text-primary hover:underline text-sm font-medium">Add the first one</button>}
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ pillarId, kpis: groupKpis }) => {
            const pillar = pillars.find((p) => p.id === pillarId);
            const color = pillar?.color ?? "#6366f1";

            return (
              <div key={pillarId ?? "unlinked"} className="rounded-2xl border border-border overflow-hidden shadow-sm">
                <div className="px-6 py-4 flex items-center gap-4 bg-card border-b border-border" style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-bold text-base">{pillar?.name ?? "Unlinked KPIs"}</h3>
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{groupKpis.length} KPI{groupKpis.length !== 1 ? "s" : ""}</span>
                    </div>
                    {pillar?.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{pillar.description}</p>
                    )}
                  </div>
                  {isAdmin && pillar && (
                    <button onClick={() => openCreate(pillar.id)} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors">
                      <Plus className="w-3 h-3" /> Add KPI
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto bg-card">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-secondary/40 border-b border-border">
                      <tr>
                        <th className="px-6 py-3 font-semibold">KPI</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">{prevYear}<br /><span className="normal-case font-normal">(Baseline)</span></th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">{thisYear}<br /><span className="normal-case font-normal">(Target)</span></th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Actual</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">vs Target</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">Assessment</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">{nextYear}<br /><span className="normal-case font-normal">(Target)</span></th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">2030<br /><span className="normal-case font-normal">(Target)</span></th>
                        <th className="px-4 py-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {groupKpis.map((kpi) => {
                        const engineInput: KpiEngineInput = {
                          kpiType: (kpi.kpiType as KpiEngineInput["kpiType"]) ?? "rate",
                          direction: (kpi.direction as KpiEngineInput["direction"]) ?? "higher",
                          target: kpi.target,
                          actual: kpi.actual,
                          baseline: kpi.baseline ?? null,
                          prevActual: kpi.prevActual ?? null,
                          prevActualDt: kpi.prevActualDt ?? null,
                          periodStart: kpi.periodStart ?? null,
                          periodEnd: kpi.periodEnd ?? null,
                          milestoneDue: kpi.milestoneDue ?? null,
                          milestoneDone: kpi.milestoneDone ?? false,
                          unit: kpi.unit,
                        };
                        const result = computeKpiStatus(engineInput);

                        return (
                          <tr key={kpi.id} className="hover:bg-secondary/20 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-sm">{kpi.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground capitalize bg-secondary/60 px-1.5 py-0.5 rounded">{kpi.kpiType ?? "rate"}</span>
                              </div>
                              {kpi.description && (
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{kpi.description}</div>
                              )}
                              {result.reason && (
                                <div className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">{result.reason}</div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground whitespace-nowrap">{fmt(kpi.baseline, kpi.unit)}</td>
                            <td className="px-4 py-4 text-right font-mono text-sm font-semibold whitespace-nowrap">{fmt(kpi.target, kpi.unit)}</td>
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              <div className="font-mono text-sm font-bold">{fmt(kpi.actual, kpi.unit)}</div>
                              {kpi.kpiType !== "milestone" && <MiniBar actual={kpi.actual} target={kpi.target} />}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-sm font-semibold whitespace-nowrap" style={{ color }}>
                              {kpi.kpiType === "milestone" ? (kpi.milestoneDone ? "✓ Done" : "Pending") : vsTarget(kpi.actual, kpi.target)}
                            </td>
                            <td className="px-4 py-4">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary border border-border">
                                <span>{ENGINE_STATUS_ICON[result.status]}</span>
                                {ENGINE_STATUS_LABEL[result.status]}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground whitespace-nowrap">{fmt(kpi.nextYearTarget, kpi.unit)}</td>
                            <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground whitespace-nowrap">{fmt(kpi.target2030, kpi.unit)}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setDetailKpi(kpi)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="View detail & measurements">
                                  <BarChart2 className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <>
                                    <button onClick={() => openEdit(kpi)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border bg-secondary hover:bg-secondary/70 text-foreground transition-colors" title="Edit KPI">
                                      <Pencil className="w-3 h-3" /> Edit
                                    </button>
                                    <button onClick={() => handleDelete(kpi.id, kpi.name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailKpi && (() => {
        const detailPillar = pillars.find((p) => p.id === detailKpi.pillarId);
        return (
          <KpiDetailModal
            kpi={detailKpi}
            pillarName={detailPillar?.name}
            pillarColor={detailPillar?.color}
            onClose={() => setDetailKpi(null)}
          />
        );
      })()}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Strategic KPI" : "New Strategic KPI"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="KPI Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Digital Services Adoption Rate" required />
          </FormField>

          <FormField label="Description">
            <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this KPI measure?" />
          </FormField>

          <FormField label="Pillar">
            <select className={selectClass} value={form.pillarId} onChange={(e) => setForm({ ...form, pillarId: e.target.value })}>
              <option value="">— No pillar —</option>
              {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="KPI Type" required>
              <select className={selectClass} value={form.kpiType} onChange={(e) => setForm({ ...form, kpiType: e.target.value })}>
                <option value="rate">Rate / Percentage</option>
                <option value="cumulative">Cumulative</option>
                <option value="milestone">Milestone</option>
                <option value="reduction">Reduction</option>
              </select>
            </FormField>
            {!isMilestone && (
              <FormField label="Direction">
                <select className={selectClass} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="higher">Higher is better</option>
                  <option value="lower">Lower is better</option>
                </select>
              </FormField>
            )}
          </div>

          {isMilestone ? (
            <>
              <FormField label="Due Date">
                <input type="date" className={inputClass} value={form.milestoneDue} onChange={(e) => setForm({ ...form, milestoneDue: e.target.value })} />
              </FormField>
              <FormField label="Completed?">
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input type="checkbox" checked={form.milestoneDone} onChange={(e) => setForm({ ...form, milestoneDone: e.target.checked })} className="w-4 h-4 accent-primary" />
                  <span className="text-sm">Mark as completed</span>
                </label>
              </FormField>
            </>
          ) : (
            <>
              <FormField label="Measurement Period">
                <select className={selectClass} value={form.measurementPeriod} onChange={(e) => setForm({ ...form, measurementPeriod: e.target.value })}>
                  <option value="annual">Annual</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Period Start">
                  <input type="date" className={inputClass} value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
                </FormField>
                <FormField label="Period End">
                  <input type="date" className={inputClass} value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
                </FormField>
              </div>
              <FormField label="Unit">
                <input className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={`${prevYear} (Baseline)`}>
                  <input type="number" className={inputClass} value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} placeholder="0" step="any" />
                </FormField>
                <FormField label={`${thisYear} Target`} required>
                  <input type="number" className={inputClass} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="100" step="any" required />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={`${nextYear} Target`}>
                  <input type="number" className={inputClass} value={form.nextYearTarget} onChange={(e) => setForm({ ...form, nextYearTarget: e.target.value })} placeholder="—" step="any" />
                </FormField>
                <FormField label="2030 Target">
                  <input type="number" className={inputClass} value={form.target2030} onChange={(e) => setForm({ ...form, target2030: e.target.value })} placeholder="—" step="any" />
                </FormField>
              </div>
              <FormField label="Actual (Current)">
                <input type="number" className={inputClass} value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} placeholder="0" step="any" />
              </FormField>

              {/* Multi-year Targets */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Multi-Year Targets (2026–2029)</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { yr: "2026", tf: "target2026" as const, af: "actual2026" as const },
                    { yr: "2027", tf: "target2027" as const, af: "actual2027" as const },
                    { yr: "2028", tf: "target2028" as const, af: "actual2028" as const },
                    { yr: "2029", tf: "target2029" as const, af: "actual2029" as const },
                  ].map(({ yr, tf, af }) => (
                    <div key={yr} className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2">
                      <div className="text-xs font-bold text-muted-foreground">{yr}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">Target</div>
                          <input type="number" className={`${inputClass} text-xs`} value={form[tf]} onChange={(e) => setForm({ ...form, [tf]: e.target.value })} placeholder="—" step="any" />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">Actual</div>
                          <input type="number" className={`${inputClass} text-xs`} value={form[af]} onChange={(e) => setForm({ ...form, [af]: e.target.value })} placeholder="—" step="any" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Analytical fields (all KPI types) ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Analytical Details</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Category">
                <input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Efficiency, Quality" />
              </FormField>
              <FormField label="Measurement Frequency">
                <select className={selectClass} value={form.measurementFrequency} onChange={(e) => setForm({ ...form, measurementFrequency: e.target.value })}>
                  <option value="annual">Annual</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </FormField>
            </div>
            <FormField label="Calculation Formula">
              <textarea className={inputClass} rows={2} value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} placeholder="e.g. (Total digital transactions / All transactions) × 100" />
            </FormField>
            <FormField label="Target Rationale">
              <textarea className={inputClass} rows={2} value={form.targetRationale} onChange={(e) => setForm({ ...form, targetRationale: e.target.value })} placeholder="Why was this target set? What benchmark or standard does it reference?" />
            </FormField>
          </div>

          <FormActions loading={isSaving} label={editId ? "Update KPI" : "Create KPI"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
