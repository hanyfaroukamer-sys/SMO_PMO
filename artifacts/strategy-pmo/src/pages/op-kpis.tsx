import { useState } from "react";
import {
  useListSpmoKpis,
  useCreateSpmoKpi,
  useUpdateSpmoKpi,
  useDeleteSpmoKpi,
  type CreateSpmoKpiRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Activity, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const KPI_STATUSES = ["on_track", "at_risk", "off_track"] as const;

type KpiForm = {
  name: string;
  description: string;
  unit: string;
  target: string;
  actual: string;
  baseline: string;
  status: string;
  projectId: string;
};

const emptyForm = (): KpiForm => ({
  name: "", description: "", unit: "", target: "100", actual: "0", baseline: "0",
  status: "on_track", projectId: "",
});

function TrendIcon({ actual, target }: { actual: number; target: number }) {
  const pct = target > 0 ? (actual / target) * 100 : 0;
  if (pct >= 85) return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (pct >= 60) return <Minus className="w-4 h-4 text-yellow-500" />;
  return <TrendingDown className="w-4 h-4 text-red-500" />;
}

export default function OpKPIs() {
  const { data, isLoading } = useListSpmoKpis({ type: "operational" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<KpiForm>(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoKpi();
  const updateMutation = useUpdateSpmoKpi();
  const deleteMutation = useDeleteSpmoKpi();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });
  };

  const kpis = data?.kpis ?? [];

  const onTrack = kpis.filter((k) => k.status === "on_track").length;
  const atRisk = kpis.filter((k) => k.status === "at_risk").length;
  const offTrack = kpis.filter((k) => k.status === "off_track").length;

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(kpi: (typeof kpis)[0]) {
    setEditId(kpi.id);
    setForm({
      name: kpi.name,
      description: kpi.description ?? "",
      unit: kpi.unit,
      target: String(kpi.target),
      actual: String(kpi.actual),
      baseline: String(kpi.baseline),
      status: kpi.status,
      projectId: kpi.projectId ? String(kpi.projectId) : "",
    });
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreateSpmoKpiRequest = {
      type: "operational",
      name: form.name,
      description: form.description || undefined,
      unit: form.unit,
      target: parseFloat(form.target) || 0,
      actual: parseFloat(form.actual) || 0,
      baseline: parseFloat(form.baseline) || 0,
      projectId: form.projectId ? parseInt(form.projectId) : undefined,
    };

    if (editId) {
      updateMutation.mutate(
        { id: editId, data: { name: form.name, unit: form.unit, target: parseFloat(form.target), actual: parseFloat(form.actual), status: form.status as "on_track" | "at_risk" | "off_track", description: form.description || undefined } },
        {
          onSuccess: () => { toast({ title: "KPI updated" }); setModalOpen(false); invalidate(); },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
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

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader title="Operational KPIs" description="Project-level performance indicators tracking delivery outputs">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" /> Add KPI
        </button>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-display font-bold text-green-500">{onTrack}</div>
          <div className="text-sm text-muted-foreground font-medium mt-1">On Track</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-display font-bold text-yellow-500">{atRisk}</div>
          <div className="text-sm text-muted-foreground font-medium mt-1">At Risk</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-display font-bold text-red-500">{offTrack}</div>
          <div className="text-sm text-muted-foreground font-medium mt-1">Off Track</div>
        </Card>
      </div>

      {/* KPIs Grid */}
      {kpis.length === 0 ? (
        <Card className="text-center py-16 text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No operational KPIs yet.</p>
          <button onClick={openCreate} className="mt-4 text-primary hover:underline text-sm font-medium">Add the first one</button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {kpis.map((kpi) => {
            const pct = kpi.target > 0 ? Math.min(100, (kpi.actual / kpi.target) * 100) : 0;
            return (
              <Card key={kpi.id} className="hover:border-primary/30 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="font-semibold text-base leading-snug text-foreground">{kpi.name}</h3>
                    {kpi.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kpi.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEdit(kpi)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(kpi.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <StatusBadge status={kpi.status} />
                  <TrendIcon actual={kpi.actual} target={kpi.target} />
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-semibold text-foreground">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: kpi.status === "on_track" ? "#22c55e" : kpi.status === "at_risk" ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                </div>

                {/* Values */}
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/50">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Actual</div>
                    <div className="text-lg font-bold text-foreground">
                      {kpi.actual.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Target</div>
                    <div className="text-lg font-bold text-foreground">
                      {kpi.target.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Baseline</div>
                    <div className="text-lg font-bold text-foreground">
                      {kpi.baseline.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
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
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Unit" required>
              <input className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required placeholder="e.g. sensors, %" />
            </FormField>
            <FormField label="Baseline">
              <input className={inputClass} type="number" value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Target" required>
              <input className={inputClass} type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required />
            </FormField>
            <FormField label="Actual" required>
              <input className={inputClass} type="number" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} required />
            </FormField>
          </div>
          {editId && (
            <FormField label="Status">
              <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {KPI_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </FormField>
          )}
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
