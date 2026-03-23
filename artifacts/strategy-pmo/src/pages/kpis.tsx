import { useState } from "react";
import {
  useListSpmoKpis,
  useListSpmoPillars,
  useCreateSpmoKpi,
  useUpdateSpmoKpi,
  useDeleteSpmoKpi,
  type CreateSpmoKpiRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";
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
};

const emptyForm = (): KpiForm => ({
  name: "", description: "", unit: "%",
  target: "100", actual: "0", baseline: "0",
  nextYearTarget: "", target2030: "", pillarId: "",
  kpiType: "rate", direction: "higher", measurementPeriod: "annual",
  periodStart: "", periodEnd: "", milestoneDue: "", milestoneDone: false,
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

export default function KPIs() {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useListSpmoKpis({ type: "strategic" });
  const { data: pillarsData } = useListSpmoPillars();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<KpiForm>(emptyForm());
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
        {isAdmin && (
          <button onClick={() => openCreate()} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-all">
            <Plus className="w-4 h-4" /> Add KPI
          </button>
        )}
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
                              {isAdmin && (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => openEdit(kpi)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border bg-secondary hover:bg-secondary/70 text-foreground transition-colors" title="Edit KPI">
                                    <Pencil className="w-3 h-3" /> Edit
                                  </button>
                                  <button onClick={() => handleDelete(kpi.id, kpi.name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              )}
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
            </>
          )}

          <FormActions loading={isSaving} label={editId ? "Update KPI" : "Create KPI"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
