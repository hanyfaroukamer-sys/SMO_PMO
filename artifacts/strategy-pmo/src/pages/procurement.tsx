import { useState } from "react";
import {
  useListSpmoProjects,
  useListSpmoProcurement,
  useCreateSpmoProcurement,
  useUpdateSpmoProcurement,
  useDeleteSpmoProcurement,
  type SpmoProcurementRecord,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, ShoppingCart, Plus, Pencil, Trash2, Building2, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PROCUREMENT_STAGES = [
  { value: "rfp_draft", label: "RFP Draft" },
  { value: "rfp_issued", label: "RFP Issued" },
  { value: "evaluation", label: "Evaluation" },
  { value: "awarded", label: "Awarded" },
  { value: "completed", label: "Completed" },
] as const;

type ProcurementStage = (typeof PROCUREMENT_STAGES)[number]["value"];

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

const STAGE_COLORS: Record<string, string> = {
  rfp_draft: "bg-slate-100 text-slate-700 border-slate-200",
  rfp_issued: "bg-blue-100 text-blue-700 border-blue-200",
  evaluation: "bg-amber-100 text-amber-700 border-amber-200",
  awarded: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STAGE_PIPELINE = ["rfp_draft", "rfp_issued", "evaluation", "awarded", "completed"];

function StagePill({ stage }: { stage: string }) {
  const label = PROCUREMENT_STAGES.find((s) => s.value === stage)?.label ?? stage;
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STAGE_COLORS[stage] ?? "bg-secondary text-foreground border-border"}`}>
      {label}
    </span>
  );
}

export default function Procurement() {
  const { data: projectsData } = useListSpmoProjects();
  const { data: procurementData, isLoading } = useListSpmoProcurement();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProcurementForm>(emptyForm());
  const [filterStage, setFilterStage] = useState<string>("all");

  const createMutation = useCreateSpmoProcurement();
  const updateMutation = useUpdateSpmoProcurement();
  const deleteMutation = useDeleteSpmoProcurement();

  const projects = projectsData?.projects ?? [];
  const allRecords: SpmoProcurementRecord[] = procurementData?.procurement ?? [];
  const records = filterStage === "all" ? allRecords : allRecords.filter((r) => r.stage === filterStage);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/procurement"] });
  };

  function getProjectName(id: number) {
    return projects.find((p) => p.id === id)?.name ?? `Project #${id}`;
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

    if (editId) {
      updateMutation.mutate(
        { id: editId, data: base },
        {
          onSuccess: () => { toast({ title: "Record updated" }); setModalOpen(false); invalidate(); },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: { projectId: parseInt(form.projectId), ...base } },
        {
          onSuccess: () => { toast({ title: "Record created" }); setModalOpen(false); invalidate(); },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        }
      );
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this procurement record?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Record deleted" }); invalidate(); },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  const stageCounts = STAGE_PIPELINE.reduce(
    (acc, s) => ({ ...acc, [s]: allRecords.filter((r) => r.stage === s).length }),
    {} as Record<string, number>
  );
  const totalValue = allRecords.reduce((s, r) => s + (r.contractValue ?? 0), 0);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader title="Procurement Pipeline" description="Track procurement stages, contracts, and vendor awards across all projects">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" /> New Record
        </button>
      </PageHeader>

      {/* Pipeline Overview */}
      <div className="grid grid-cols-5 gap-3">
        {PROCUREMENT_STAGES.map((stage) => (
          <button
            key={stage.value}
            onClick={() => setFilterStage(filterStage === stage.value ? "all" : stage.value)}
            className={`rounded-xl border p-4 text-center transition-all hover:shadow-md ${
              filterStage === stage.value ? "ring-2 ring-primary shadow-md" : ""
            } ${STAGE_COLORS[stage.value]}`}
          >
            <div className="text-2xl font-display font-bold">{stageCounts[stage.value] ?? 0}</div>
            <div className="text-xs font-medium mt-1">{stage.label}</div>
          </button>
        ))}
      </div>

      {/* Total Contract Value */}
      {totalValue > 0 && (
        <Card className="flex items-center gap-4 bg-gradient-to-r from-primary/5 to-card">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground font-medium">Total Contract Value (Awarded + Completed)</div>
            <div className="text-2xl font-display font-bold text-foreground">
              SAR {(totalValue / 1_000_000).toFixed(1)}M
            </div>
          </div>
        </Card>
      )}

      {/* Records List */}
      {records.length === 0 ? (
        <Card className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">
            {filterStage === "all"
              ? "No procurement records yet."
              : `No records in ${PROCUREMENT_STAGES.find((s) => s.value === filterStage)?.label} stage.`}
          </p>
          {filterStage === "all" && (
            <button onClick={openCreate} className="mt-4 text-primary hover:underline text-sm font-medium">
              Add the first record
            </button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((rec) => (
            <Card key={rec.id} className="hover:border-primary/30 transition-colors group">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <h3 className="font-semibold text-base">{rec.title}</h3>
                    <StagePill stage={rec.stage} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/70">{getProjectName(rec.projectId)}</span>
                    {rec.vendor && (
                      <span>Vendor: <strong className="text-foreground">{rec.vendor}</strong></span>
                    )}
                    {rec.contractValue && (
                      <span>Contract: <strong className="text-foreground">SAR {(rec.contractValue / 1_000_000).toFixed(1)}M</strong></span>
                    )}
                    {rec.awardDate && <span>Awarded: {new Date(rec.awardDate).toLocaleDateString()}</span>}
                    {rec.completionDate && <span>Due: {new Date(rec.completionDate).toLocaleDateString()}</span>}
                  </div>
                  {rec.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rec.notes}</p>}
                </div>

                {/* Pipeline progress */}
                <div className="hidden lg:flex items-center gap-1 shrink-0">
                  {STAGE_PIPELINE.map((s, i) => {
                    const isActive = s === rec.stage;
                    const isPast = STAGE_PIPELINE.indexOf(rec.stage) > i;
                    return (
                      <div key={s} className="flex items-center gap-1">
                        <div
                          className={`rounded-full transition-all ${
                            isActive
                              ? "w-3 h-3 bg-primary shadow-sm shadow-primary/40"
                              : isPast
                              ? "w-2 h-2 bg-primary/40"
                              : "w-2 h-2 bg-secondary border border-border"
                          }`}
                        />
                        {i < STAGE_PIPELINE.length - 1 && (
                          <div className={`w-4 h-0.5 ${isPast ? "bg-primary/40" : "bg-border"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => openEdit(rec)}
                    className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(rec.id)}
                    className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
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
                {PROCUREMENT_STAGES.map((s) => (
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
            <FormField label="Contract Value (SAR)">
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
