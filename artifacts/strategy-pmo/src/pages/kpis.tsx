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
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
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
  pillarId: string;
};

const emptyForm = (): KpiForm => ({
  name: "", description: "", unit: "%",
  target: "100", actual: "0", baseline: "0", status: "on_track", pillarId: "",
});

function GaugeCircle({ progress, color }: { progress: number; color: string }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-secondary" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        className="transition-all duration-700"
      />
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

  const getPillarById = (id: number | null | undefined) =>
    pillars.find((p) => p.id === id);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });
  };

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
      status: kpi.status,
      pillarId: kpi.pillarId ? String(kpi.pillarId) : "",
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
        type: "strategic",
        unit: form.unit,
        target: parseFloat(form.target) || 0,
        actual: parseFloat(form.actual) || 0,
        baseline: parseFloat(form.baseline) || 0,
        pillarId: form.pillarId ? parseInt(form.pillarId) : undefined,
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
  const kpis = data?.kpis ?? [];

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Strategic KPIs" description="Track strategic metrics linked to national transformation pillars.">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add KPI
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kpis.map((kpi) => {
            const progress = kpi.target > 0 ? Math.min(100, (kpi.actual / kpi.target) * 100) : 0;
            const pillar = getPillarById(kpi.pillarId);
            const color = pillar?.color ?? "#2563eb";
            const pillarName = pillar?.name ?? "";

            return (
              <Card
                key={kpi.id}
                className="relative overflow-hidden group hover:shadow-md transition-shadow cursor-pointer pl-5"
                noPadding={false}
                onClick={() => openEdit(kpi)}
              >
                <div
                  className="absolute left-0 top-0 h-full w-1.5 rounded-l-xl"
                  style={{ backgroundColor: color }}
                />
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => openEdit(kpi)}
                    className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(kpi.id, kpi.name); }}
                    className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-start gap-4">
                  <GaugeCircle progress={progress} color={color} />
                  <div className="flex-1 min-w-0 pt-1">
                    {pillarName && (
                      <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color }}>
                        {pillarName}
                      </div>
                    )}
                    <h3 className="font-bold text-sm leading-tight pr-12">{kpi.name}</h3>
                    {kpi.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kpi.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-bold text-foreground">{kpi.actual}</span> / {kpi.target} {kpi.unit}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{kpi.status.replace(/_/g, " ")}</span>
                    </div>
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

          <FormField label="Status">
            <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {KPI_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Target" required>
              <input type="number" className={inputClass} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="100" step="any" required />
            </FormField>
            <FormField label="Actual">
              <input type="number" className={inputClass} value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} placeholder="0" step="any" />
            </FormField>
            <FormField label="Unit">
              <input className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%" />
            </FormField>
          </div>

          <FormField label="Baseline">
            <input type="number" className={inputClass} value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} placeholder="0" step="any" />
          </FormField>

          <FormActions loading={isSaving} label={editId ? "Update KPI" : "Create KPI"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
