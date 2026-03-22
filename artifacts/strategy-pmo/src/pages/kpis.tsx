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
import {
  computeKpiStatus,
  ENGINE_STATUS_LABEL,
  ENGINE_STATUS_ICON,
  type KpiEngineInput,
  type KpiEngineStatus,
} from "@/lib/kpi-engine";

type KpiForm = {
  name: string;
  description: string;
  unit: string;
  target: string;
  actual: string;
  baseline: string;
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
  target: "100", actual: "0", baseline: "0", pillarId: "",
  kpiType: "rate", direction: "higher", measurementPeriod: "annual",
  periodStart: "", periodEnd: "", milestoneDue: "", milestoneDone: false,
});

const STATUS_BG: Record<KpiEngineStatus, string> = {
  "exceeding": "bg-secondary border border-border",
  "on-track": "bg-secondary border border-border",
  "at-risk": "bg-secondary border border-border",
  "critical": "bg-secondary border border-border",
  "achieved": "bg-secondary border border-border",
  "not-started": "bg-secondary border border-border",
};

function GaugeCircle({ progress, color }: { progress: number; color: string }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-secondary" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 36 36)" className="transition-all duration-700" />
      <text x="36" y="40" textAnchor="middle" fontSize="12" fontWeight="bold" fill={color}>
        {Math.round(progress)}%
      </text>
    </svg>
  );
}

export default function KPIs() {
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
  const getPillarById = (id: number | null | undefined) => pillars.find((p) => p.id === id);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(kpi: NonNullable<typeof data>["kpis"][number]) {
    setEditId(kpi.id);
    setForm({
      name: kpi.name,
      description: kpi.description ?? "",
      unit: kpi.unit ?? "%",
      target: String(kpi.target),
      actual: String(kpi.actual),
      baseline: String(kpi.baseline ?? 0),
      pillarId: kpi.pillarId ? String(kpi.pillarId) : "",
      kpiType: kpi.kpiType ?? "rate",
      direction: kpi.direction ?? "higher",
      measurementPeriod: kpi.measurementPeriod ?? "annual",
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
    const shared = {
      name: form.name,
      description: form.description || undefined,
      unit: form.unit,
      target: parseFloat(form.target) || 0,
      actual: parseFloat(form.actual) || 0,
      baseline: parseFloat(form.baseline) || 0,
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
  const kpis = data?.kpis ?? [];
  const isMilestone = form.kpiType === "milestone";

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Strategic KPIs" description="Track strategic metrics linked to national transformation pillars.">
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Add KPI
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kpis.map((kpi) => {
            const pillar = getPillarById(kpi.pillarId);
            const color = pillar?.color ?? "#2563eb";
            const pillarName = pillar?.name ?? "";

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
            const progress = kpi.target > 0 ? Math.min(100, (kpi.actual / kpi.target) * 100) : 0;

            return (
              <Card
                key={kpi.id}
                className="relative overflow-hidden group hover:shadow-md transition-shadow cursor-pointer pl-5"
                noPadding={false}
                onClick={() => openEdit(kpi)}
              >
                <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-xl" style={{ backgroundColor: color }} />
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(kpi)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(kpi.id, kpi.name); }} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-start gap-4">
                  {kpi.kpiType === "milestone" ? (
                    <div className="w-[72px] h-[72px] flex items-center justify-center shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2`}
                        style={{ borderColor: color, color }}>
                        {kpi.milestoneDone ? "✓" : "○"}
                      </div>
                    </div>
                  ) : (
                    <GaugeCircle progress={progress} color={color} />
                  )}

                  <div className="flex-1 min-w-0 pt-1">
                    {pillarName && (
                      <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color }}>{pillarName}</div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground capitalize">
                        {kpi.kpiType ?? "rate"}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm leading-tight pr-12">{kpi.name}</h3>
                    {kpi.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kpi.description}</p>
                    )}

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BG[result.status]}`}>
                        <span>{ENGINE_STATUS_ICON[result.status]}</span>
                        {ENGINE_STATUS_LABEL[result.status]}
                      </span>
                      {result.performanceIndex > 0 && result.status !== "achieved" && result.status !== "not-started" && kpi.kpiType !== "milestone" && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          PI {result.performanceIndex.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{result.reason}</p>

                    {kpi.kpiType !== "milestone" && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span><span className="font-bold text-foreground">{kpi.actual}</span> / {kpi.target} {kpi.unit}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {kpis.length === 0 && (
            <div className="col-span-full p-12 text-center text-muted-foreground bg-card border border-dashed border-border rounded-xl">
              No strategic KPIs defined yet. Click "Add KPI" to create one.
            </div>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit KPI" : "New Strategic KPI"}>
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
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Baseline">
                  <input type="number" className={inputClass} value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} placeholder="0" step="any" />
                </FormField>
                <FormField label="Target" required>
                  <input type="number" className={inputClass} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="100" step="any" required />
                </FormField>
                <FormField label="Actual">
                  <input type="number" className={inputClass} value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} placeholder="0" step="any" />
                </FormField>
              </div>
              <FormField label="Unit">
                <input className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%" />
              </FormField>
            </>
          )}

          <FormActions loading={isSaving} label={editId ? "Update KPI" : "Create KPI"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
