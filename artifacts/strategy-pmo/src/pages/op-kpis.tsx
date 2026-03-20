import { useState } from "react";
import {
  useListSpmoKpis,
  useListSpmoProjects,
  useCreateSpmoKpi,
  useUpdateSpmoKpi,
  useDeleteSpmoKpi,
  type CreateSpmoKpiRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Activity, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
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
  const { data: projectsData } = useListSpmoProjects();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<KpiForm>(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoKpi();
  const updateMutation = useUpdateSpmoKpi();
  const deleteMutation = useDeleteSpmoKpi();

  const projects = projectsData?.projects ?? [];

  const getProjectName = (id: number | null | undefined) =>
    projects.find((p) => p.id === id)?.name ?? "";

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
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="Operational KPIs" description="Project-level performance indicators tracking delivery outputs.">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Op. KPI
        </button>
      </PageHeader>

      {kpis.length > 0 && (
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5 bg-success/10 text-success px-3 py-1.5 rounded-full font-semibold">
            <span className="w-2 h-2 rounded-full bg-success" /> {onTrack} On Track
          </span>
          <span className="flex items-center gap-1.5 bg-warning/10 text-warning px-3 py-1.5 rounded-full font-semibold">
            <span className="w-2 h-2 rounded-full bg-warning" /> {atRisk} At Risk
          </span>
          <span className="flex items-center gap-1.5 bg-destructive/10 text-destructive px-3 py-1.5 rounded-full font-semibold">
            <span className="w-2 h-2 rounded-full bg-destructive" /> {offTrack} Off Track
          </span>
        </div>
      )}

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
            const isWarning = pct < 60;
            const color = isWarning ? "#d97706" : kpi.status === "on_track" ? "#059669" : kpi.status === "at_risk" ? "#d97706" : "#dc2626";
            const projectName = getProjectName(kpi.projectId);

            return (
              <Card
                key={kpi.id}
                className={`relative overflow-hidden group cursor-pointer hover:shadow-md transition-all pl-5 ${isWarning ? "border-warning/50 bg-warning/5" : ""}`}
                noPadding={false}
                onClick={() => openEdit(kpi)}
              >
                <div
                  className="absolute left-0 top-0 h-full w-1.5 rounded-l-xl"
                  style={{ backgroundColor: color }}
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
                  <GaugeCircle progress={pct} color={color} />
                  <div className="flex-1 min-w-0 pt-1">
                    {projectName && (
                      <div className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color }}>
                        {projectName}
                      </div>
                    )}
                    <h3 className="font-bold text-sm leading-tight pr-14">{kpi.name}</h3>
                    {kpi.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{kpi.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-bold text-foreground">{kpi.actual}</span> / {kpi.target} {kpi.unit}
                      </span>
                      <StatusBadge status={kpi.status} />
                      <TrendIcon actual={kpi.actual} target={kpi.target} />
                    </div>
                    {isWarning && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-warning font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Below target threshold
                      </div>
                    )}
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
          <FormField label="Project">
            <select className={selectClass} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">— No project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
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
