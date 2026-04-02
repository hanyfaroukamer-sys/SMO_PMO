import { useState } from "react";
import type React from "react";
import {
  useListSpmoKpis,
  useListSpmoPillars,
  useListSpmoInitiatives,
  useCreateSpmoKpi,
  useUpdateSpmoKpi,
  useDeleteSpmoKpi,
  type CreateSpmoKpiRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2, Download, BarChart2, TrendingUp, Activity } from "lucide-react";
import { exportToXlsx } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  computeKpiStatus,
  ENGINE_STATUS_LABEL,
  ENGINE_STATUS_ICON,
  type KpiEngineInput,
} from "@/lib/kpi-engine";
import { KpiDetailModal, type KpiDetail } from "@/components/kpi-detail-modal";
import { UserMentionInput } from "@/components/user-mention-input";

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
  ownerName: string;
  ownerId: string;
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
  ownerName: "", ownerId: "",
});

const EVIDENCE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  pending: "Evidence: Pending",
  submitted: "Evidence: Submitted",
  approved: "Evidence: Approved",
  rejected: "Evidence: Rejected",
};

type Kpi = KpiDetail & { pillarId: number | null };

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
  const [kpiTypeTab, setKpiTypeTab] = useState<"strategic" | "operational">("strategic");
  const { data, isLoading } = useListSpmoKpis({ type: kpiTypeTab });
  const { data: pillarsData } = useListSpmoPillars();
  const { data: initiativesData } = useListSpmoInitiatives();
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
      ownerName: (kpi as any).ownerName ?? "",
      ownerId: (kpi as any).ownerId ?? "",
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
    const saveOwner = async (kpiId: number) => {
      if (form.ownerId) {
        try {
          await fetch(`/api/spmo/kpis/${kpiId}/owner`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerId: form.ownerId, ownerName: form.ownerName }),
          });
        } catch { /* best effort */ }
      }
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: shared }, {
        onSuccess: async () => {
          await saveOwner(editId);
          toast({ title: "KPI Updated" }); setModalOpen(false); invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update KPI." }),
      });
    } else {
      const createPayload: CreateSpmoKpiRequest = {
        ...shared,
        type: kpiTypeTab,
        pillarId: form.pillarId ? parseInt(form.pillarId) : undefined,
      };
      createMutation.mutate({ data: createPayload }, {
        onSuccess: async (result: any) => {
          const newId = result?.kpi?.id ?? result?.id;
          if (newId) await saveOwner(newId);
          toast({ title: "KPI Created" }); setModalOpen(false); invalidate();
        },
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
      <PageHeader title="KPIs" description={kpiTypeTab === "strategic" ? "Grouped by pillar — baseline, targets, actuals and 2030 outlook." : "Operational KPIs linked to initiatives and projects."}>
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
            })), `${kpiTypeTab}-kpis-export`)}
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

      {/* Type toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => { setKpiTypeTab("strategic"); setModalOpen(false); setEditId(null); }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${kpiTypeTab === "strategic" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <TrendingUp className="w-4 h-4" /> Strategic
        </button>
        <button
          onClick={() => { setKpiTypeTab("operational"); setModalOpen(false); setEditId(null); }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${kpiTypeTab === "operational" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Activity className="w-4 h-4" /> Operational
        </button>
      </div>

      {kpis.length === 0 ? (
        <Card className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No {kpiTypeTab} KPIs defined yet.</p>
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
                          <tr
                            key={kpi.id}
                            onClick={() => setDetailKpi(kpi)}
                            className="hover:bg-primary/5 transition-colors group cursor-pointer"
                          >
                            <td className="px-6 py-4">
                              <div className="font-semibold text-sm text-primary group-hover:underline underline-offset-2 flex items-center gap-1.5">
                                {kpi.name}
                                <BarChart2 className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground capitalize bg-secondary/60 px-1.5 py-0.5 rounded">{kpi.kpiType ?? "rate"}</span>
                                {kpi.category && <span className="text-xs text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">{kpi.category}</span>}
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
                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDetailKpi(kpi); }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors whitespace-nowrap"
                                >
                                  <BarChart2 className="w-3 h-3" /> Deep Dive
                                </button>
                                {isAdmin && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); openEdit(kpi); }} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors" title="Edit KPI">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(kpi.id, kpi.name); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
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
            isAdmin={isAdmin}
            onClose={() => setDetailKpi(null)}
          />
        );
      })()}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? `Edit ${kpiTypeTab === "operational" ? "Operational" : "Strategic"} KPI` : `New ${kpiTypeTab === "operational" ? "Operational" : "Strategic"} KPI`}>
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
                  <input type="number" min={0} className={inputClass} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="100" step="any" required />
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
