import { useState } from "react";
import {
  useListSpmoProjects,
  useListSpmoInitiatives,
  useListSpmoProcurement,
  useCreateSpmoProcurement,
  useUpdateSpmoProcurement,
  useDeleteSpmoProcurement,
  useGetSpmoConfig,
  type SpmoProcurementRecord,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2, Building2, DollarSign, FileText, Send, Search, Award, CheckCircle2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-is-admin";

const STAGES = [
  { value: "rfp_draft",   label: "RFP Draft",   color: "#64748b", bg: "bg-slate-50",   header: "bg-slate-100" },
  { value: "rfp_issued",  label: "RFP Issued",  color: "#2563eb", bg: "bg-blue-50",    header: "bg-blue-100" },
  { value: "evaluation",  label: "Evaluation",  color: "#d97706", bg: "bg-amber-50",   header: "bg-amber-100" },
  { value: "awarded",     label: "Awarded",     color: "#16a34a", bg: "bg-green-50",   header: "bg-green-100" },
  { value: "completed",   label: "Completed",   color: "#7c3aed", bg: "bg-violet-50",  header: "bg-violet-100" },
] as const;

type ProcurementStage = (typeof STAGES)[number]["value"];

type ProcurementForm = {
  projectId: string;
  title: string;
  stage: string;
  vendor: string;
  contractValue: string;
  notes: string;
  awardDate: string;
  completionDate: string;
};

const emptyForm = (): ProcurementForm => ({
  projectId: "", title: "", stage: "rfp_draft", vendor: "",
  contractValue: "", notes: "", awardDate: "", completionDate: "",
});

export default function Procurement() {
  const isAdmin = useIsAdmin();
  const { data: projectsData } = useListSpmoProjects();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: procurementData, isLoading } = useListSpmoProcurement();
  const { data: configData } = useGetSpmoConfig();
  const currency = configData?.reportingCurrency ?? "SAR";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProcurementForm>(emptyForm());
  const createMutation = useCreateSpmoProcurement();
  const updateMutation = useUpdateSpmoProcurement();
  const deleteMutation = useDeleteSpmoProcurement();

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to view procurement records.</p>
      </div>
    );
  }

  const projects = projectsData?.projects ?? [];
  const initiatives = initiativesData?.initiatives ?? [];
  const allRecords: SpmoProcurementRecord[] = procurementData?.procurement ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/spmo/procurement"] });

  function getProjectName(id: number) {
    return projects.find((p) => p.id === id)?.name ?? `Project #${id}`;
  }

  function getInitiativeName(projectId: number): string | undefined {
    const proj = projects.find((p) => p.id === projectId);
    const initId = proj?.initiativeId;
    if (!initId) return undefined;
    return initiatives.find((i) => i.id === initId)?.name;
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(rec: SpmoProcurementRecord) {
    setEditId(rec.id);
    setForm({
      projectId: String(rec.projectId),
      title: rec.title,
      stage: rec.stage,
      vendor: rec.vendor ?? "",
      contractValue: rec.contractValue ? String(rec.contractValue) : "",
      notes: rec.notes ?? "",
      awardDate: rec.awardDate ?? "",
      completionDate: rec.completionDate ?? "",
    });
    setModalOpen(true);
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this procurement record?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Deleted" }); invalidate(); },
    });
  }

  function handleStageChange(id: number, newStage: ProcurementStage) {
    updateMutation.mutate({ id, data: { stage: newStage } }, {
      onSuccess: () => invalidate(),
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId || !form.title) return;

    const stage = form.stage as ProcurementStage;
    const base = {
      title: form.title,
      stage,
      vendor: form.vendor || undefined,
      contractValue: form.contractValue ? parseFloat(form.contractValue) : undefined,
      notes: form.notes || undefined,
      awardDate: form.awardDate || undefined,
      completionDate: form.completionDate || undefined,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: base }, {
        onSuccess: () => { toast({ title: "Updated" }); setModalOpen(false); invalidate(); },
        onError: () => toast({ variant: "destructive", title: "Update failed" }),
      });
    } else {
      createMutation.mutate({ data: { ...base, projectId: parseInt(form.projectId) } }, {
        onSuccess: () => { toast({ title: "Created" }); setModalOpen(false); invalidate(); },
        onError: () => toast({ variant: "destructive", title: "Create failed" }),
      });
    }
  }

  const totalValue = allRecords.reduce((s, r) => s + (r.contractValue ?? 0), 0);

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader
        title="Procurement Pipeline"
        description={`${allRecords.length} records · ${formatCurrency(totalValue, currency)} total contract value`}
      >
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" /> Add Record
        </button>
      </PageHeader>

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {STAGES.map((stage) => {
          const stageRecords = allRecords.filter((r) => r.stage === stage.value);
          const stageValue = stageRecords.reduce((s, r) => s + (r.contractValue ?? 0), 0);
          const Icon = stage.value === "rfp_draft" ? FileText
            : stage.value === "rfp_issued" ? Send
            : stage.value === "evaluation" ? Search
            : stage.value === "awarded" ? Award
            : CheckCircle2;
          return (
            <Card key={stage.value}>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stage.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color: stage.color }} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{stage.label}</span>
              </div>
              <div className="text-2xl font-display font-bold" style={{ color: stage.color }}>{stageRecords.length}</div>
              {stageValue > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">{formatCurrency(stageValue, currency)}</div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 5-Column Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
        {STAGES.map((stage) => {
          const stageRecords = allRecords.filter((r) => r.stage === stage.value);
          const stageValue = stageRecords.reduce((s, r) => s + (r.contractValue ?? 0), 0);

          return (
            <div key={stage.value} className="flex flex-col rounded-xl overflow-hidden border border-border shadow-sm bg-card">
              {/* Column header */}
              <div className={`px-3 py-3 ${stage.header} border-b border-border`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="font-bold text-sm" style={{ color: stage.color }}>{stage.label}</span>
                  </div>
                  <span className="bg-white/70 text-xs font-bold px-1.5 py-0.5 rounded-full border border-border/50 text-muted-foreground">
                    {stageRecords.length}
                  </span>
                </div>
                {stageValue > 0 && (
                  <div className="text-xs text-muted-foreground mt-1 pl-4 font-medium">
                    {formatCurrency(stageValue, currency)}
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                {stageRecords.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-8 text-xs text-muted-foreground/40 italic">
                    No projects
                  </div>
                )}
                {stageRecords.map((rec) => (
                  <KanbanCard
                    key={rec.id}
                    rec={rec}
                    stageColor={stage.color}
                    projectName={getProjectName(rec.projectId)}
                    initiativeName={getInitiativeName(rec.projectId)}
                    stages={STAGES}
                    onEdit={() => openEdit(rec)}
                    onDelete={() => handleDelete(rec.id)}
                    onStageChange={(s) => handleStageChange(rec.id, s)}
                    currency={currency}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Procurement Record" : "New Procurement Record"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Project" required>
            <select
              className={selectClass}
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              required
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Title" required>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="e.g. EV Fleet Procurement — Phase 2"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Stage">
              <select
                className={selectClass}
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Vendor">
              <input
                className={inputClass}
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                placeholder="Vendor name"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label={`Contract Value (${currency})`}>
              <input
                className={inputClass}
                type="number"
                value={form.contractValue}
                onChange={(e) => setForm({ ...form, contractValue: e.target.value })}
                placeholder="0"
              />
            </FormField>
            <FormField label="Award Date">
              <input
                className={inputClass}
                type="date"
                value={form.awardDate}
                onChange={(e) => setForm({ ...form, awardDate: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Completion Date">
            <input
              className={inputClass}
              type="date"
              value={form.completionDate}
              onChange={(e) => setForm({ ...form, completionDate: e.target.value })}
            />
          </FormField>

          <FormField label="Notes">
            <textarea
              className={inputClass}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Key notes, conditions, or status updates…"
            />
          </FormField>

          <FormActions
            onCancel={() => setModalOpen(false)}
            loading={createMutation.isPending || updateMutation.isPending}
            label={editId ? "Update Record" : "Create Record"}
          />
        </form>
      </Modal>
    </div>
  );
}

function KanbanCard({
  rec, stageColor, projectName, initiativeName, stages, onEdit, onDelete, onStageChange, currency = "SAR",
}: {
  rec: SpmoProcurementRecord;
  stageColor: string;
  projectName: string;
  initiativeName?: string;
  stages: typeof STAGES;
  onEdit: () => void;
  onDelete: () => void;
  currency?: string;
  onStageChange: (stage: ProcurementStage) => void;
}) {
  return (
    <div
      className="bg-background border border-border rounded-lg p-3 group hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
      style={{ borderLeft: `3px solid ${stageColor}` }}
      onClick={onEdit}
    >
      <div className="font-semibold text-sm leading-snug mb-1 pr-10 relative">
        {rec.title}
        <div
          className="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            onClick={onEdit}
            title="Edit"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Initiative → Project breadcrumb */}
      <div className="text-[10px] text-muted-foreground truncate mb-1.5 flex items-center gap-1">
        {initiativeName && (
          <>
            <span className="truncate">{initiativeName}</span>
            <span>›</span>
          </>
        )}
        <span className="font-medium text-foreground/70 truncate">{projectName}</span>
      </div>

      {rec.vendor && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{rec.vendor}</span>
        </div>
      )}
      {rec.contractValue !== null && rec.contractValue !== undefined && rec.contractValue > 0 && (
        <div className="flex items-center gap-1 text-xs font-semibold text-foreground mb-1.5">
          <DollarSign className="w-3 h-3 shrink-0" />
          {formatCurrency(rec.contractValue, currency)}
        </div>
      )}

      {/* Stage dropdown on card */}
      <select
        className="mt-1 w-full text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        value={rec.stage}
        onChange={(e) => onStageChange(e.target.value as ProcurementStage)}
        onClick={(e) => e.stopPropagation()}
      >
        {stages.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
