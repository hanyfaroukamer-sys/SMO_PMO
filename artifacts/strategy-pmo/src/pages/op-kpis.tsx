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
import { Loader2, Activity, Plus, Pencil, Trash2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type KpiForm = {
  name: string;
  description: string;
  unit: string;
  target: string;
  actual: string;
  baseline: string;
  status: string;
  initiativeId: string;
};

const emptyForm = (): KpiForm => ({
  name: "", description: "", unit: "", target: "100", actual: "0", baseline: "0",
  status: "on_track", initiativeId: "",
});

function GaugeCircle({ progress, color }: { progress: number; color: string }) {
  const r = 24;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <svg width="60" height="60" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-secondary" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 30 30)"
        className="transition-all duration-700"
      />
      <text x="30" y="34" textAnchor="middle" fontSize="10" fontWeight="bold" fill={color}>
        {Math.round(progress)}%
      </text>
    </svg>
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

  const getInitiativeColor = (initiativeId: number | null | undefined) => {
    const initiative = getInitiative(initiativeId);
    if (!initiative) return "#6366f1";
    return pillars.find((p) => p.id === initiative.pillarId)?.color ?? "#6366f1";
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/kpis"] });
  };

  const kpis = data?.kpis ?? [];

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
      initiativeId: kpi.initiativeId ? String(kpi.initiativeId) : "",
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
      initiativeId: form.initiativeId ? parseInt(form.initiativeId) : undefined,
    };

    if (editId) {
      updateMutation.mutate(
        {
          id: editId,
          data: {
            name: form.name,
            unit: form.unit,
            target: parseFloat(form.target),
            actual: parseFloat(form.actual),
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

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="Operational KPIs" description="Initiative-level performance indicators tracking delivery outputs.">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Op. KPI
        </button>
      </PageHeader>

      {kpis.length === 0 ? (
        <Card className="text-center py-16 text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No operational KPIs yet.</p>
          <button onClick={openCreate} className="mt-4 text-primary hover:underline text-sm font-medium">Add the first one</button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {kpis.map((kpi) => {
            const pct = kpi.target > 0 ? Math.min(100, (kpi.actual / kpi.target) * 100) : 0;
            const initiative = getInitiative(kpi.initiativeId);
            const ownerName = kpi.ownerName ?? initiative?.ownerName ?? null;
            const ribbonColor = getInitiativeColor(kpi.initiativeId);

            return (
              <Card
                key={kpi.id}
                className="relative overflow-hidden group cursor-pointer hover:shadow-md transition-all pl-5"
                noPadding={false}
                onClick={() => openEdit(kpi)}
              >
                <div
                  className="absolute left-0 top-0 h-full w-1.5 rounded-l-xl"
                  style={{ backgroundColor: ribbonColor }}
                />

                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(kpi)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(kpi.id); }} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-start gap-4">
                  <GaugeCircle progress={pct} color={ribbonColor} />
                  <div className="flex-1 min-w-0 pt-1">
                    {initiative && (
                      <div className="text-xs font-bold uppercase tracking-wider mb-0.5 truncate" style={{ color: ribbonColor }}>
                        {initiative.name}
                      </div>
                    )}
                    <h3 className="font-bold text-sm leading-tight pr-14">{kpi.name}</h3>
                    {kpi.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{kpi.description}</p>
                    )}
                    <div className="mt-1.5 space-y-1">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-bold text-foreground">{kpi.actual}</span> / {kpi.target} {kpi.unit}
                      </span>
                      {ownerName && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="w-3 h-3 shrink-0" />
                          <span className="truncate">{ownerName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
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
