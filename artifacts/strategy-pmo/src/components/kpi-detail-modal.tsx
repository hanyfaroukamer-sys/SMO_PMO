import { useState } from "react";
import type React from "react";
import {
  useListSpmoKpiMeasurements,
  useCreateSpmoKpiMeasurement,
  useDeleteSpmoKpiMeasurement,
  useUpdateSpmoKpi,
  type SpmoKpiMeasurement,
} from "@workspace/api-client-react";
import { inputClass } from "@/components/modal";
import { Loader2, Trash2, TrendingUp, BarChart2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  computeKpiStatus,
  ENGINE_STATUS_LABEL,
  ENGINE_STATUS_ICON,
  type KpiEngineInput,
} from "@/lib/kpi-engine";

export type KpiDetail = {
  id: number;
  name: string;
  description?: string | null;
  unit: string;
  baseline: number;
  target: number;
  actual: number;
  nextYearTarget?: number | null;
  target2030?: number | null;
  pillarId?: number | null;
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

export function KpiDetailModal({ kpi, pillarName, pillarColor, isAdmin, onClose }: {
  kpi: KpiDetail;
  pillarName?: string;
  pillarColor?: string;
  isAdmin?: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, queryKey } = useListSpmoKpiMeasurements(kpi.id);
  const createMeasurement = useCreateSpmoKpiMeasurement(kpi.id);
  const deleteMeasurement = useDeleteSpmoKpiMeasurement(kpi.id);
  const updateKpi = useUpdateSpmoKpi();
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newValue, setNewValue] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState(kpi.formula ?? "");
  const [savingFormula, setSavingFormula] = useState(false);
  const formulaDirty = formulaDraft !== (kpi.formula ?? "");

  const handleSaveFormula = async () => {
    setSavingFormula(true);
    try {
      await updateKpi.mutateAsync({ id: kpi.id, data: { formula: formulaDraft || undefined } });
      qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });
      toast({ title: "Formula saved" });
    } catch {
      toast({ title: "Failed to save formula", variant: "destructive" });
    } finally {
      setSavingFormula(false);
    }
  };

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
    exceeding: "text-success bg-success/10 border-success/20",
    on_track: "text-success bg-success/10 border-success/20",
    at_risk: "text-warning bg-warning/10 border-warning/20",
    critical: "text-destructive bg-destructive/10 border-destructive/20",
    achieved: "text-success bg-success/10 border-success/20",
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
    { year: 2026, target: kpi.target2026 ?? (currentYear === 2026 ? kpi.target : null), actual: kpi.actual2026, isCurrent: currentYear === 2026 },
    { year: 2027, target: kpi.target2027, actual: kpi.actual2027, isCurrent: currentYear === 2027 },
    { year: 2028, target: kpi.target2028, actual: kpi.actual2028, isCurrent: currentYear === 2028 },
    { year: 2029, target: kpi.target2029, actual: kpi.actual2029, isCurrent: currentYear === 2029 },
    { year: 2030, target: kpi.target2030, actual: currentYear === 2030 ? kpi.actual : null, isCurrent: currentYear === 2030 },
  ];
  const hasMultiYear = multiYear.some((r) => r.target != null || r.actual != null);

  const color = pillarColor ?? "hsl(221 83% 53%)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
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

          {/* Quick stats strip */}
          <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
            {[
              { label: "Baseline", value: fmt(kpi.baseline, kpi.unit) },
              { label: `${currentYear} Target`, value: fmt(kpi.target, kpi.unit) },
              { label: `${currentYear} Actual`, value: fmt(kpi.actual, kpi.unit) },
              { label: "Achievement", value: kpi.target > 0 ? `${Math.round((kpi.actual / kpi.target) * 100)}%` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">{label}</div>
                <div className="text-base font-display font-bold">{value}</div>
              </div>
            ))}
          </div>

          <div className="p-6 space-y-6">

            {/* KPI Metadata */}
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

            {/* Formula */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1.5">
                  <BarChart2 className="w-3 h-3" /> Calculation Formula
                </div>
                {isAdmin && formulaDirty && (
                  <button
                    onClick={handleSaveFormula}
                    disabled={savingFormula}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {savingFormula ? "Saving…" : "Save"}
                  </button>
                )}
              </div>
              {isAdmin ? (
                <textarea
                  className="w-full bg-transparent text-sm font-mono text-foreground leading-relaxed resize-none border-none outline-none placeholder:text-muted-foreground/50 min-h-[3rem]"
                  rows={3}
                  value={formulaDraft}
                  onChange={(e) => setFormulaDraft(e.target.value)}
                  placeholder="e.g. (Total digital transactions / All transactions) × 100"
                />
              ) : (
                <p className="text-sm font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                  {kpi.formula || <span className="text-muted-foreground italic">No formula defined</span>}
                </p>
              )}
            </div>

            {/* Target Rationale */}
            {kpi.targetRationale && (
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> Target Rationale
                </div>
                <p className="text-sm text-foreground leading-relaxed">{kpi.targetRationale}</p>
              </div>
            )}

            {/* Multi-year Targets Table 2026–2030 */}
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

            {/* Sparkline */}
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

            {/* Record New Measurement */}
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

            {/* Measurement History */}
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
