import { useState } from "react";
import {
  useListSpmoKpis,
  useListSpmoInitiatives,
  useListSpmoPillars,
  useCreateSpmoKpi,
  useUpdateSpmoKpi,
  useDeleteSpmoKpi,
  type CreateSpmoKpiRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Activity, Plus, Pencil, Trash2, User, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type KpiForm = {
  name: string;
  description: string;
  unit: string;
  target: string;
  actual: string;
  baseline: string;
  nextYearTarget: string;
  status: string;
  initiativeId: string;
};

const emptyForm = (): KpiForm => ({
  name: "", description: "", unit: "", target: "100", actual: "0",
  baseline: "0", nextYearTarget: "", status: "on_track", initiativeId: "",
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
  status: "on_track" | "at_risk" | "off_track";
  initiativeId: number | null;
  ownerName?: string | null;
};

function getAssessment(actual: number, target: number): { label: string; className: string } {
  if (target <= 0) return { label: "—", className: "text-muted-foreground" };
  const pct = (actual / target) * 100;
  if (pct >= 90) return { label: "On Track", className: "bg-secondary text-foreground border border-border" };
  if (pct >= 70) return { label: "Behind", className: "bg-secondary text-foreground border border-border" };
  return { label: "At Risk", className: "bg-secondary text-foreground border border-border" };
}

function fmt(val: number | null | undefined, unit: string) {
  if (val == null) return "—";
  return `${val.toLocaleString()} ${unit}`.trim();
}

function vsTarget(actual: number, target: number) {
  if (target <= 0) return "—";
  const pct = Math.round((actual / target) * 100);
  return `${pct}%`;
}

function MiniBar({ actual, target }: { actual: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (actual / target) * 100)) : 0;
  return (
    <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function OpKPIs() {
  const { data, isLoading } = useListSpmoKpis({ type: "operational" });
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: pillarsData } = useListSpmoPillars();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<KpiForm>(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoKpi();
  const updateMutation = useUpdateSpmoKpi();
  const deleteMutation = useDeleteSpmoKpi();

  const initiatives = initiativesData?.initiatives ?? [];
  const pillars = pillarsData?.pillars ?? [];

  const getInitiative = (id: number | null | undefined) =>
    initiatives.find((i) => i.id === id);

  const getPillarColor = (initiativeId: number | null | undefined) => {
    const initiative = getInitiative(initiativeId);
    if (!initiative) return "#6366f1";
    return pillars.find((p) => p.id === initiative.pillarId)?.color ?? "#6366f1";
  };

  const getPillarName = (initiativeId: number | null | undefined) => {
    const initiative = getInitiative(initiativeId);
    if (!initiative) return "";
    return pillars.find((p) => p.id === initiative.pillarId)?.name ?? "";
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });
  };

  const kpis: Kpi[] = (data?.kpis ?? []) as Kpi[];

  function openCreate(presetInitiativeId?: number) {
    setEditId(null);
    setForm({ ...emptyForm(), initiativeId: presetInitiativeId ? String(presetInitiativeId) : "" });
    setModalOpen(true);
  }

  function openEdit(kpi: Kpi) {
    setEditId(kpi.id);
    setForm({
      name: kpi.name,
      description: kpi.description ?? "",
      unit: kpi.unit,
      target: String(kpi.target),
      actual: String(kpi.actual),
      baseline: String(kpi.baseline),
      nextYearTarget: kpi.nextYearTarget != null ? String(kpi.nextYearTarget) : "",
      status: kpi.status,
      initiativeId: kpi.initiativeId ? String(kpi.initiativeId) : "",
    });
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nyt = form.nextYearTarget ? parseFloat(form.nextYearTarget) : undefined;

    if (editId) {
      updateMutation.mutate(
        {
          id: editId,
          data: {
            name: form.name,
            unit: form.unit,
            target: parseFloat(form.target),
            actual: parseFloat(form.actual),
            baseline: parseFloat(form.baseline) || 0,
            nextYearTarget: nyt,
            status: form.status as "on_track" | "at_risk" | "off_track",
            description: form.description || undefined,
            initiativeId: form.initiativeId ? parseInt(form.initiativeId) : undefined,
          },
        },
        {
          onSuccess: () => { toast({ title: "KPI updated" }); setModalOpen(false); invalidate(); },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      const payload: CreateSpmoKpiRequest = {
        type: "operational",
        name: form.name,
        description: form.description || undefined,
        unit: form.unit,
        target: parseFloat(form.target) || 0,
        actual: parseFloat(form.actual) || 0,
        baseline: parseFloat(form.baseline) || 0,
        nextYearTarget: nyt,
        initiativeId: form.initiativeId ? parseInt(form.initiativeId) : undefined,
      };
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast({ title: "KPI created" }); setModalOpen(false); invalidate(); },
        onError: () => toast({ title: "Create failed", variant: "destructive" }),
      });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this KPI?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "KPI deleted" }); invalidate(); },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    });
  }

  const selectedInitiative = form.initiativeId ? getInitiative(parseInt(form.initiativeId)) : null;

  // Group KPIs by initiative
  const kpisByInitiative = new Map<number | null, Kpi[]>();
  for (const kpi of kpis) {
    const key = kpi.initiativeId;
    const list = kpisByInitiative.get(key) ?? [];
    list.push(kpi);
    kpisByInitiative.set(key, list);
  }

  // Sort groups: known initiatives first (in initiatives order), then unlinked
  const groups: Array<{ initiativeId: number | null; kpis: Kpi[] }> = [];
  for (const init of initiatives) {
    const list = kpisByInitiative.get(init.id);
    if (list && list.length > 0) groups.push({ initiativeId: init.id, kpis: list });
  }
  const unlinked = kpisByInitiative.get(null) ?? [];
  if (unlinked.length > 0) groups.push({ initiativeId: null, kpis: unlinked });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="Operational KPIs" description="Grouped by initiative — baseline, targets, actuals and next-year outlook.">
        <button
          onClick={() => openCreate()}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" /> Add KPI
        </button>
      </PageHeader>

      {kpis.length === 0 ? (
        <Card className="text-center py-16 text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No operational KPIs yet.</p>
          <button onClick={() => openCreate()} className="mt-4 text-primary hover:underline text-sm font-medium">Add the first one</button>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ initiativeId, kpis: groupKpis }) => {
            const initiative = getInitiative(initiativeId);
            const color = getPillarColor(initiativeId);
            const pillarName = getPillarName(initiativeId);
            const ownerName = initiative?.ownerName;

            return (
              <div key={initiativeId ?? "unlinked"} className="rounded-2xl border border-border overflow-hidden shadow-sm">
                {/* Initiative header */}
                <div
                  className="px-6 py-4 flex items-center gap-4 bg-card border-b border-border"
                  style={{ borderLeft: `4px solid ${color}` }}
                >
                  <div className="flex-1 min-w-0">
                    {pillarName && (
                      <div className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color }}>
                        {pillarName}
                      </div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-bold text-base">
                        {initiative?.name ?? "Unlinked KPIs"}
                      </h3>
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        {groupKpis.length} KPI{groupKpis.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {ownerName && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <User className="w-3 h-3 shrink-0" />
                        <span>{ownerName}</span>
                        <ChevronRight className="w-3 h-3 opacity-40" />
                        <span className="font-medium text-foreground/70">KPI Owner</span>
                      </div>
                    )}
                  </div>
                  {initiative && (
                    <button
                      onClick={() => openCreate(initiative.id)}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add KPI
                    </button>
                  )}
                </div>

                {/* KPI table */}
                <div className="overflow-x-auto bg-card">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-secondary/40 border-b border-border">
                      <tr>
                        <th className="px-6 py-3 font-semibold">KPI</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Prev Year<br /><span className="normal-case font-normal">(Baseline)</span></th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">This Year<br /><span className="normal-case font-normal">(Target)</span></th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Actual</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">vs Target</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">Assessment</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Next Year<br /><span className="normal-case font-normal">(Target)</span></th>
                        <th className="px-4 py-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {groupKpis.map((kpi) => {
                        const assessment = getAssessment(kpi.actual, kpi.target);
                        return (
                          <tr key={kpi.id} className="hover:bg-secondary/20 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-sm">{kpi.name}</div>
                              {kpi.description && (
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{kpi.description}</div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground whitespace-nowrap">
                              {fmt(kpi.baseline, kpi.unit)}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-sm font-semibold whitespace-nowrap">
                              {fmt(kpi.target, kpi.unit)}
                            </td>
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              <div className="font-mono text-sm font-bold">{fmt(kpi.actual, kpi.unit)}</div>
                              <MiniBar actual={kpi.actual} target={kpi.target} />
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-sm font-semibold whitespace-nowrap" style={{ color }}>
                              {vsTarget(kpi.actual, kpi.target)}
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${assessment.className}`}>
                                {assessment.label}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground whitespace-nowrap">
                              {fmt(kpi.nextYearTarget, kpi.unit)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEdit(kpi)}
                                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(kpi.id)}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Operational KPI" : "New Operational KPI"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="KPI Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Signals Commissioned" />
          </FormField>
          <FormField label="Description">
            <textarea className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What does this KPI measure?" />
          </FormField>
          <FormField label="Initiative">
            <select className={selectClass} value={form.initiativeId} onChange={(e) => setForm({ ...form, initiativeId: e.target.value })}>
              <option value="">— No initiative —</option>
              {initiatives.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </FormField>
          {selectedInitiative?.ownerName && (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">KPI Owner (from initiative):</span>
              <span className="font-semibold">{selectedInitiative.ownerName}</span>
            </div>
          )}
          <FormField label="Unit" required>
            <input className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required placeholder="e.g. sensors, %" />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Prev Year (Baseline)">
              <input className={inputClass} type="number" value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} placeholder="0" step="any" />
            </FormField>
            <FormField label="This Year Target" required>
              <input className={inputClass} type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required placeholder="100" step="any" />
            </FormField>
            <FormField label="Next Year Target">
              <input className={inputClass} type="number" value={form.nextYearTarget} onChange={(e) => setForm({ ...form, nextYearTarget: e.target.value })} placeholder="—" step="any" />
            </FormField>
          </div>
          <FormField label="Actual (Current)" required>
            <input className={inputClass} type="number" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} required placeholder="0" step="any" />
          </FormField>
          <FormActions
            onCancel={() => setModalOpen(false)}
            loading={createMutation.isPending || updateMutation.isPending}
            label={editId ? "Update KPI" : "Create KPI"}
          />
        </form>
      </Modal>
    </div>
  );
}
