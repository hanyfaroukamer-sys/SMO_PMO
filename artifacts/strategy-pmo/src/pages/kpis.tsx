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
import { Loader2, TrendingUp, Target as TargetIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const KPI_STATUSES = ["on_track", "at_risk", "off_track"] as const;
const KPI_TYPES = ["strategic", "operational"] as const;

type KpiForm = {
  name: string;
  description: string;
  type: string;
  unit: string;
  target: string;
  actual: string;
  baseline: string;
  status: string;
};

const emptyForm = (): KpiForm => ({
  name: "", description: "", type: "strategic", unit: "%",
  target: "100", actual: "0", baseline: "0", status: "on_track",
});

export default function KPIs() {
  const [kpiType, setKpiType] = useState<"strategic" | "operational">("strategic");
  const { data, isLoading } = useListSpmoKpis({ type: kpiType });
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

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyForm(), type: kpiType });
    setModalOpen(true);
  }

  function openEdit(kpi: NonNullable<typeof data>["kpis"][number]) {
    setEditId(kpi.id);
    setForm({
      name: kpi.name,
      description: kpi.description ?? "",
      type: kpi.type,
      unit: kpi.unit ?? "%",
      target: String(kpi.target),
      actual: String(kpi.actual),
      baseline: String(kpi.baseline ?? 0),
      status: kpi.status,
    });
    setModalOpen(true);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete KPI "${name}"?`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted" });
        invalidate();
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: {
        name: form.name,
        description: form.description || undefined,
        unit: form.unit,
        target: parseFloat(form.target) || 0,
        actual: parseFloat(form.actual) || 0,
        baseline: parseFloat(form.baseline) || 0,
        status: form.status as "on_track" | "at_risk" | "off_track",
      }}, {
        onSuccess: () => {
          toast({ title: "KPI Updated" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update KPI." }),
      });
    } else {
      const createPayload: CreateSpmoKpiRequest = {
        name: form.name,
        description: form.description || undefined,
        type: form.type as "strategic" | "operational",
        unit: form.unit,
        target: parseFloat(form.target) || 0,
        actual: parseFloat(form.actual) || 0,
        baseline: parseFloat(form.baseline) || 0,
      };
      createMutation.mutate({ data: createPayload }, {
        onSuccess: () => {
          toast({ title: "KPI Created", description: `"${form.name}" added.` });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to create KPI." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Key Performance Indicators" description="Track strategic and operational metrics.">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add KPI
        </button>
      </PageHeader>

      <div className="flex space-x-1 bg-secondary/50 p-1 rounded-xl w-fit border border-border">
        {KPI_TYPES.map((t) => (
          <button
            key={t}
            className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${kpiType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setKpiType(t)}
          >
            {t === "strategic" ? "Strategic KPIs" : "Operational KPIs"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {data?.kpis.map((kpi) => {
            const progress = kpi.target > 0 ? Math.min(100, (kpi.actual / kpi.target) * 100) : 0;
            return (
              <Card key={kpi.id} className="relative overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 p-4 flex items-center gap-1">
                  <button
                    onClick={() => openEdit(kpi)}
                    className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(kpi.id, kpi.name)}
                    className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <StatusBadge status={kpi.status} />
                </div>

                <div className="mb-6 mt-2">
                  <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-4">
                    {kpi.type === "strategic" ? <TrendingUp className="w-5 h-5" /> : <TargetIcon className="w-5 h-5" />}
                  </div>
                  <h3 className="font-bold text-lg leading-tight pr-20">{kpi.name}</h3>
                  {kpi.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kpi.description}</p>
                  )}
                </div>

                <div className="mt-auto">
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-3xl font-display font-bold tracking-tight">{kpi.actual}</span>
                    <span className="text-muted-foreground font-medium pb-1">/ {kpi.target} {kpi.unit}</span>
                  </div>

                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/50">
                    <div
                      className={`h-full ${kpi.status === "on_track" ? "bg-success" : kpi.status === "at_risk" ? "bg-warning" : "bg-destructive"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-muted-foreground mt-1">{progress.toFixed(0)}%</div>
                </div>
              </Card>
            );
          })}
          {data?.kpis.length === 0 && (
            <div className="col-span-full p-12 text-center text-muted-foreground bg-card border border-dashed border-border rounded-xl">
              No {kpiType} KPIs defined yet. Click "Add KPI" to create one.
            </div>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit KPI" : "New KPI"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="KPI Name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Digital Services Adoption Rate"
              required
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={inputClass}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this KPI measure?"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <select className={selectClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="strategic">Strategic</option>
                <option value="operational">Operational</option>
              </select>
            </FormField>
            <FormField label="Status">
              <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {KPI_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Target" required>
              <input
                type="number"
                className={inputClass}
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                placeholder="100"
                step="any"
                required
              />
            </FormField>
            <FormField label="Actual">
              <input
                type="number"
                className={inputClass}
                value={form.actual}
                onChange={(e) => setForm({ ...form, actual: e.target.value })}
                placeholder="0"
                step="any"
              />
            </FormField>
            <FormField label="Unit">
              <input
                className={inputClass}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="%"
              />
            </FormField>
          </div>

          <FormField label="Baseline">
            <input
              type="number"
              className={inputClass}
              value={form.baseline}
              onChange={(e) => setForm({ ...form, baseline: e.target.value })}
              placeholder="0"
              step="any"
            />
          </FormField>

          <FormActions loading={isSaving} label={editId ? "Update KPI" : "Create KPI"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
