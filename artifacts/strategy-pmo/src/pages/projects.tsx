import { useState } from "react";
import {
  useListSpmoProjects,
  useListSpmoInitiatives,
  useCreateSpmoProject,
  useUpdateSpmoProject,
  useDeleteSpmoProject,
  useListSpmoMilestones,
  useCreateSpmoMilestone,
  useUpdateSpmoMilestone,
  useDeleteSpmoMilestone,
  useSubmitSpmoMilestone,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2, Send } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PROJECT_STATUSES = ["active", "on_hold", "completed", "cancelled"] as const;
const MILESTONE_STATUSES = ["not_started", "in_progress", "submitted", "approved", "rejected"] as const;

type ProjectForm = {
  name: string;
  description: string;
  initiativeId: string;
  ownerName: string;
  weight: string;
  status: string;
  budget: string;
  startDate: string;
  targetDate: string;
};

type MilestoneForm = {
  name: string;
  description: string;
  weight: string;
  progress: string;
  status: string;
  dueDate: string;
};

const emptyProject = (): ProjectForm => ({
  name: "", description: "", initiativeId: "", ownerName: "",
  weight: "50", status: "active", budget: "", startDate: "", targetDate: "",
});

const emptyMilestone = (): MilestoneForm => ({
  name: "", description: "", weight: "25", progress: "0",
  status: "not_started", dueDate: "",
});

export default function Projects() {
  const { data, isLoading } = useListSpmoProjects();
  const { data: initiativesData } = useListSpmoInitiatives();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyProject());
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoProject();
  const updateMutation = useUpdateSpmoProject();
  const deleteMutation = useDeleteSpmoProject();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/programme"] });
  };

  function openCreate() {
    setEditId(null);
    setForm(emptyProject());
    setModalOpen(true);
  }

  function openEdit(project: NonNullable<typeof data>["projects"][number]) {
    setEditId(project.id);
    setForm({
      name: project.name,
      description: project.description ?? "",
      initiativeId: String(project.initiativeId),
      ownerName: project.ownerName ?? "",
      weight: String(project.weight),
      status: project.status,
      budget: String(project.budget ?? ""),
      startDate: project.startDate ?? "",
      targetDate: project.targetDate ?? "",
    });
    setModalOpen(true);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted", description: `"${name}" removed.` });
        invalidate();
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || null,
      initiativeId: parseInt(form.initiativeId),
      ownerId: "user",
      ownerName: form.ownerName || null,
      weight: parseFloat(form.weight) || 0,
      status: form.status,
      budget: form.budget ? parseFloat(form.budget) : 0,
      startDate: form.startDate || null,
      targetDate: form.targetDate || null,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Updated" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update." }),
      });
    } else {
      createMutation.mutate({ data: payload as never }, {
        onSuccess: () => {
          toast({ title: "Created", description: `"${form.name}" created.` });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to create." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Projects" description="Track project delivery, budgets, and milestones.">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </PageHeader>

      <div className="space-y-4">
        {data?.projects.map((proj) => (
          <ProjectRow
            key={proj.id}
            project={proj}
            expanded={expandedProject === proj.id}
            onToggle={() => setExpandedProject(expandedProject === proj.id ? null : proj.id)}
            onEdit={() => openEdit(proj)}
            onDelete={() => handleDelete(proj.id, proj.name)}
          />
        ))}
        {data?.projects.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            No projects yet. Click "New Project" to create one.
          </Card>
        )}
      </div>

      {/* Project Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Project" : "New Project"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Project Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Citizen Identity Module" required />
          </FormField>

          <FormField label="Initiative" required>
            <select className={selectClass} value={form.initiativeId} onChange={(e) => setForm({ ...form, initiativeId: e.target.value })} required>
              <option value="">Select an initiative...</option>
              {initiativesData?.initiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Description">
            <textarea className={inputClass} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Owner Name">
              <input className={inputClass} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="e.g. Rania Ibrahim" />
            </FormField>
            <FormField label="Status">
              <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Budget (USD)">
              <input type="number" className={inputClass} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0" min="0" />
            </FormField>
            <FormField label={`Weight (${form.weight}%)`}>
              <input type="range" min="0" max="100" className="w-full accent-primary mt-2" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date">
              <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </FormField>
            <FormField label="Target Date">
              <input type="date" className={inputClass} value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </FormField>
          </div>

          <FormActions loading={isSaving} label={editId ? "Update Project" : "Create Project"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}

// ─── Project Row with expandable milestone list ───────────────────────────────

function ProjectRow({
  project,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  project: NonNullable<ReturnType<typeof useListSpmoProjects>["data"]>["projects"][number];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card noPadding className="overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-4 p-5 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <StatusBadge status={project.status} />
            <h3 className="font-bold text-lg truncate">{project.name}</h3>
          </div>
          <p className="text-sm text-muted-foreground truncate">{project.description}</p>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="hidden md:block w-40">
            <ProgressBar progress={project.progress ?? 0} />
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground font-medium">Budget</div>
            <div className="font-bold text-sm">{formatCurrency(project.budget ?? 0)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground font-medium">Milestones</div>
            <div className="font-bold text-sm">{project.milestoneCount ?? 0}</div>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
        </div>
      </div>

      {/* Milestones section */}
      {expanded && <MilestoneSection projectId={project.id} />}
    </Card>
  );
}

// ─── Milestone Section ─────────────────────────────────────────────────────────

function MilestoneSection({ projectId }: { projectId: number }) {
  const { data, isLoading } = useListSpmoMilestones(projectId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MilestoneForm>(emptyMilestone());
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoMilestone();
  const updateMutation = useUpdateSpmoMilestone();
  const deleteMutation = useDeleteSpmoMilestone();
  const submitMutation = useSubmitSpmoMilestone();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/spmo/projects/${projectId}/milestones`] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/programme"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/pending-approvals"] });
  };

  function openCreate() {
    setEditId(null);
    setForm(emptyMilestone());
    setModalOpen(true);
  }

  function openEdit(m: NonNullable<typeof data>["milestones"][number]) {
    setEditId(m.id);
    setForm({
      name: m.name,
      description: m.description ?? "",
      weight: String(m.weight),
      progress: String(m.progress),
      status: m.status,
      dueDate: m.dueDate ?? "",
    });
    setModalOpen(true);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete milestone "${name}"?`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted" });
        invalidate();
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || null,
      weight: parseFloat(form.weight) || 0,
      progress: parseInt(form.progress) || 0,
      status: form.status,
      dueDate: form.dueDate || null,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Updated", description: `"${form.name}" updated.` });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update." }),
      });
    } else {
      createMutation.mutate({ id: projectId, data: payload as never }, {
        onSuccess: () => {
          toast({ title: "Created", description: `"${form.name}" added.` });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to create." }),
      });
    }
  }

  function handleSubmitForApproval(id: number, name: string) {
    submitMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Submitted", description: `"${name}" submitted for approval.` });
        invalidate();
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Ensure evidence is attached first.";
        toast({ variant: "destructive", title: "Cannot Submit", description: msg });
      },
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const statusColor: Record<string, string> = {
    approved: "text-green-600",
    submitted: "text-blue-600",
    in_progress: "text-amber-600",
    rejected: "text-red-600",
    not_started: "text-muted-foreground",
  };

  return (
    <div className="border-t border-border bg-secondary/20">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Milestones</h4>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Add Milestone
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="divide-y divide-border/50">
          {data?.milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-4 px-5 py-3 hover:bg-secondary/30 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${statusColor[m.status] ?? ""}`}>{m.name}</span>
                  <StatusBadge status={m.status} />
                </div>
                {m.dueDate && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Due: {format(new Date(m.dueDate), "MMM d, yyyy")}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="w-32">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-bold">{m.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(m.progress, 100)}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {(m.status === "not_started" || m.status === "in_progress" || m.status === "rejected") && (
                    <button
                      onClick={() => handleSubmitForApproval(m.id, m.name)}
                      disabled={submitMutation.isPending}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors"
                      title="Submit for approval"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  {m.status === "approved" && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(m.id, m.name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {data?.milestones.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No milestones yet.</div>
          )}
        </div>
      )}

      {/* Milestone form modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Milestone" : "New Milestone"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Milestone Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Biometric Pilot (500 users)" required />
          </FormField>

          <FormField label="Description">
            <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does completion of this milestone mean?" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">
              <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {MILESTONE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </FormField>
            <FormField label="Due Date">
              <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </FormField>
          </div>

          <FormField label={`Progress: ${form.progress}%`}>
            <input
              type="range"
              min="0"
              max="100"
              className="w-full accent-primary"
              value={form.progress}
              onChange={(e) => setForm({ ...form, progress: e.target.value })}
            />
            <div className="h-2 bg-border rounded-full overflow-hidden mt-2">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${form.progress}%` }} />
            </div>
          </FormField>

          <FormField label={`Weight (${form.weight}%)`}>
            <input type="range" min="0" max="100" className="w-full accent-primary" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
          </FormField>

          <FormActions loading={isSaving} label={editId ? "Update Milestone" : "Create Milestone"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
