import { useState, useRef } from "react";
import {
  useListSpmoProjects,
  useListSpmoInitiatives,
  useListSpmoPillars,
  useListSpmoDepartments,
  useCreateSpmoProject,
  useUpdateSpmoProject,
  useDeleteSpmoProject,
  useListSpmoMilestones,
  useCreateSpmoMilestone,
  useUpdateSpmoMilestone,
  useDeleteSpmoMilestone,
  useSubmitSpmoMilestone,
  useAddSpmoEvidence,
  useApproveSpmoMilestone,
  useRejectSpmoMilestone,
  useGetCurrentAuthUser,
  type SpmoProjectWithProgress,
  type CreateSpmoProjectRequest,
  type UpdateSpmoProjectRequest,
  type CreateSpmoMilestoneRequest,
  type SpmoEvidence,
  type SpmoMilestoneWithEvidence,
} from "@workspace/api-client-react";
import { GanttChart } from "@/components/gantt-chart";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2, Send, X, XCircle, FileText, FileImage, FileArchive, FileSpreadsheet, Upload, AlertCircle, RotateCcw, LayoutList, GanttChartSquare } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function fileIcon(contentType: string | null | undefined) {
  if (!contentType) return FileText;
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.includes("zip") || contentType.includes("archive")) return FileArchive;
  if (contentType.includes("sheet") || contentType.includes("csv") || contentType.includes("excel")) return FileSpreadsheet;
  return FileText;
}

function EvidencePanel({
  milestone,
  onInvalidate,
}: {
  milestone: SpmoMilestoneWithEvidence;
  onInvalidate: () => void;
}) {
  const { data: authData } = useGetCurrentAuthUser();
  const user = authData?.user;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const addEvidence = useAddSpmoEvidence();
  const approveMutation = useApproveSpmoMilestone();
  const rejectMutation = useRejectSpmoMilestone();

  const evidence = (milestone.evidence ?? []) as SpmoEvidence[];
  const isApproved = milestone.status === "approved";
  const isRejected = milestone.status === "rejected";
  const isSubmitted = milestone.status === "submitted";
  const canApproveReject = user?.role === "admin" || user?.role === "approver";
  type MilestoneWithApproval = SpmoMilestoneWithEvidence & { approvedByName?: string | null };
  const m = milestone as MilestoneWithApproval;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await fetch("/spmo/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId: milestone.id }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = (await urlRes.json()) as { uploadURL: string; objectPath: string };

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      addEvidence.mutate(
        { id: milestone.id, data: { fileName: file.name, contentType: file.type, objectPath } },
        {
          onSuccess: () => {
            toast({ title: "Evidence uploaded", description: file.name });
            onInvalidate();
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
          },
          onError: () => {
            toast({ variant: "destructive", title: "Failed to register evidence" });
            setUploading(false);
          },
        }
      );
    } catch (err) {
      toast({ variant: "destructive", title: "Upload failed", description: err instanceof Error ? err.message : "Unknown error" });
      setUploading(false);
    }
  }

  function handleApprove() {
    approveMutation.mutate({ id: milestone.id, data: {} }, {
      onSuccess: () => { toast({ title: "Milestone approved" }); onInvalidate(); },
      onError: () => toast({ variant: "destructive", title: "Approval failed" }),
    });
  }

  function handleReject() {
    if (!rejectReason.trim()) return;
    rejectMutation.mutate({ id: milestone.id, data: { reason: rejectReason.trim() } }, {
      onSuccess: () => {
        toast({ title: "Milestone rejected" });
        setShowRejectInput(false);
        setRejectReason("");
        onInvalidate();
      },
      onError: () => toast({ variant: "destructive", title: "Rejection failed" }),
    });
  }

  return (
    <div className="mx-4 mb-3 rounded-xl border border-border overflow-hidden">
      {/* Status banner */}
      {isApproved && (
        <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border-b border-success/20 text-success text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Approved{m.approvedByName ? ` by ${m.approvedByName}` : ""}
          {m.approvedAt && (
            <span className="font-normal text-success/60 ml-1">
              · {format(new Date(m.approvedAt), "MMM d, yyyy")}
            </span>
          )}
        </div>
      )}
      {isRejected && (
        <div className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs font-bold">
          <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            <div>Rejected — upload corrected evidence and re-submit</div>
            {m.rejectionReason && <div className="font-normal text-destructive/70 mt-0.5">Reason: {m.rejectionReason}</div>}
          </div>
        </div>
      )}
      {isSubmitted && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20 text-primary text-xs font-bold">
          <Send className="w-3.5 h-3.5" /> Submitted for Approval — Awaiting review
        </div>
      )}

      {/* Evidence list */}
      <div className="p-3 bg-secondary/10">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Evidence Files ({evidence.length})
        </div>
        {evidence.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 py-1">
            <AlertCircle className="w-3.5 h-3.5" /> No evidence attached
          </div>
        ) : (
          <div className="space-y-1">
            {evidence.map((ev) => {
              const Icon = fileIcon(ev.contentType);
              return (
                <div key={ev.id} className="flex items-center gap-2 p-2 bg-card rounded-lg border border-border text-xs hover:border-primary/30 transition-colors">
                  <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="flex-1 truncate font-medium">{ev.fileName}</span>
                  {ev.aiValidated && (
                    <span className="text-[9px] bg-success/10 text-success px-1 py-0.5 rounded font-bold border border-success/20">AI ✓ {ev.aiScore ?? "—"}</span>
                  )}
                  <a
                    href={`/spmo/api/storage/objects${ev.objectPath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline font-semibold shrink-0 text-[10px]"
                  >
                    View
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload zone (only if not approved) */}
      {!isApproved && (
        <div className="px-3 pb-2">
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-primary/40 rounded-lg py-2.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Uploading…" : "Upload Evidence File"}
          </button>
        </div>
      )}

      {/* Approve / Reject controls (approver/admin only, on submitted milestones) */}
      {canApproveReject && isSubmitted && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setShowRejectInput(!showRejectInput)}
              disabled={rejectMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs font-semibold hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={approveMutation.isPending || evidence.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-success text-white text-xs font-semibold hover:bg-success/90 transition-colors disabled:opacity-50"
              title={evidence.length === 0 ? "Evidence required" : "Approve milestone"}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          </div>
          {showRejectInput && (
            <div className="flex gap-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection…"
                className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="px-3 py-1.5 rounded-lg bg-destructive text-white text-xs font-semibold disabled:opacity-50"
              >
                {rejectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reset button for rejected milestones (approver/admin) */}
      {canApproveReject && isRejected && (
        <div className="px-3 pb-3">
          <button
            onClick={() => {
              fetch(`/spmo/api/spmo/milestones/${milestone.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "in_progress" }),
              }).then(() => {
                toast({ title: "Milestone reset to In Progress" });
                onInvalidate();
              });
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to In Progress
          </button>
        </div>
      )}
    </div>
  );
}

const PROJECT_STATUSES = ["active", "on_hold", "completed", "cancelled"] as const;
const MILESTONE_STATUSES = ["pending", "in_progress", "submitted", "approved", "rejected"] as const;

type ProjectForm = {
  name: string;
  description: string;
  initiativeId: string;
  departmentId: string;
  ownerName: string;
  weight: string;
  status: string;
  budget: string;
  startDate: string;
  targetDate: string;
};

const emptyProject = (): ProjectForm => ({
  name: "", description: "", initiativeId: "", departmentId: "", ownerName: "",
  weight: "50", status: "active", budget: "", startDate: "", targetDate: "",
});

export default function Projects() {
  const { data, isLoading } = useListSpmoProjects();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: pillarsData } = useListSpmoPillars();
  const { data: departmentsData } = useListSpmoDepartments();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyProject());
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "gantt">("list");
  const [pillarFilter, setPillarFilter] = useState<number | "all">("all");
  const [departmentFilter, setDepartmentFilter] = useState<number | "all">("all");
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

  function openEdit(project: SpmoProjectWithProgress) {
    setEditId(project.id);
    setForm({
      name: project.name,
      description: project.description ?? "",
      initiativeId: String(project.initiativeId),
      departmentId: project.departmentId != null ? String(project.departmentId) : "",
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
    const commonFields = {
      name: form.name,
      description: form.description || undefined,
      initiativeId: parseInt(form.initiativeId),
      departmentId: form.departmentId ? parseInt(form.departmentId) : null,
      ownerId: "user",
      ownerName: form.ownerName || undefined,
      weight: parseFloat(form.weight) || 0,
      status: form.status as "active" | "on_hold" | "completed" | "cancelled",
      budget: form.budget ? parseFloat(form.budget) : 0,
    };

    if (editId !== null) {
      const updatePayload: UpdateSpmoProjectRequest = {
        ...commonFields,
        startDate: form.startDate || undefined,
        targetDate: form.targetDate || undefined,
      };
      updateMutation.mutate({ id: editId, data: updatePayload }, {
        onSuccess: () => {
          toast({ title: "Updated" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update." }),
      });
    } else {
      const createPayload: CreateSpmoProjectRequest = {
        ...commonFields,
        startDate: form.startDate,
        targetDate: form.targetDate,
      };
      createMutation.mutate({ data: createPayload }, {
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

  const pillars = pillarsData?.pillars ?? [];
  const initiatives = initiativesData?.initiatives ?? [];
  const departments = departmentsData?.departments ?? [];
  const projects = data?.projects ?? [];

  const getPillarColor = (pillarId: number) =>
    pillars.find((p) => p.id === pillarId)?.color ?? "#6366f1";

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Projects & Milestones" description="Grouped by initiative — track delivery, budgets, and milestones.">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-secondary overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <LayoutList className="w-3.5 h-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode("gantt")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "gantt" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Gantt chart"
            >
              <GanttChartSquare className="w-3.5 h-3.5" /> Gantt
            </button>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> + Project
          </button>
        </div>
      </PageHeader>

      {/* Gantt filter bar */}
      {viewMode === "gantt" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pillar</label>
            <select
              className={`${selectClass} py-1.5 text-xs w-44`}
              value={pillarFilter === "all" ? "all" : String(pillarFilter)}
              onChange={(e) => setPillarFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All Pillars</option>
              {(pillars as Array<{id: number; name: string}>).map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</label>
            <select
              className={`${selectClass} py-1.5 text-xs w-44`}
              value={departmentFilter === "all" ? "all" : String(departmentFilter)}
              onChange={(e) => setDepartmentFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All Departments</option>
              {(departments as Array<{id: number; name: string}>).map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            Showing projects with milestone markers · hover bars/diamonds for details
          </span>
        </div>
      )}

      {/* Gantt view */}
      {viewMode === "gantt" && (
        <GanttChart pillarFilter={pillarFilter} departmentFilter={departmentFilter} />
      )}

      {/* List view — Grouped by Initiative */}
      {viewMode === "list" && <div className="space-y-8">
        {initiatives.map((initiative) => {
          const pillarColor = getPillarColor(initiative.pillarId);
          const pillarName = pillars.find((p) => p.id === initiative.pillarId)?.name ?? "";
          const initProjects = projects.filter((p) => p.initiativeId === initiative.id);
          if (initProjects.length === 0) return null;

          const initProgress = initiative.progress ?? 0;

          return (
            <div key={initiative.id} className="rounded-2xl border border-border overflow-hidden shadow-sm">
              {/* Coloured left border (as top stripe in header) */}
              <div
                className="px-6 py-4 flex items-center gap-4 bg-card border-b border-border"
                style={{ borderLeft: `4px solid ${pillarColor}` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: pillarColor }}>
                    {pillarName}
                  </div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg">{initiative.name}</h3>
                    <StatusBadge status={initiative.status} />
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                      {initProjects.length} project{initProjects.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-32">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-bold" style={{ color: pillarColor }}>{Math.round(initProgress)}%</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, initProgress)}%`, backgroundColor: pillarColor }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Projects */}
              <div className="divide-y divide-border/50 bg-secondary/10">
                {initProjects.map((proj) => (
                  <ProjectRow
                    key={proj.id}
                    project={proj}
                    pillarColor={pillarColor}
                    expanded={expandedProject === proj.id}
                    onToggle={() => setExpandedProject(expandedProject === proj.id ? null : proj.id)}
                    onEdit={() => openEdit(proj)}
                    onDelete={() => handleDelete(proj.id, proj.name)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Projects not in any matched initiative */}
        {projects.filter((p) => !initiatives.some((i) => i.id === p.initiativeId)).map((proj) => (
          <Card key={proj.id} noPadding className="overflow-hidden">
            <ProjectRow
              project={proj}
              pillarColor="#6366f1"
              expanded={expandedProject === proj.id}
              onToggle={() => setExpandedProject(expandedProject === proj.id ? null : proj.id)}
              onEdit={() => openEdit(proj)}
              onDelete={() => handleDelete(proj.id, proj.name)}
            />
          </Card>
        ))}

        {projects.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            No projects yet. Click "New Project" to create one.
          </Card>
        )}
      </div>}

      {/* Project Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Project" : "New Project"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Project Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Citizen Identity Module" required />
          </FormField>

          <FormField label="Initiative" required>
            <select className={selectClass} value={form.initiativeId} onChange={(e) => setForm({ ...form, initiativeId: e.target.value })} required>
              <option value="">Select an initiative...</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </FormField>

          {departments.length > 0 && (
            <FormField label="Department">
              <select
                className={selectClass}
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>
          )}

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
            <FormField label="Budget (SAR)">
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

function ProjectRow({
  project,
  pillarColor,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  project: SpmoProjectWithProgress;
  pillarColor: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={onToggle}
      >
        <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: pillarColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h4 className="font-bold text-base">{project.name}</h4>
            <StatusBadge status={project.status} />
            {project.weight > 0 && (
              <span className="text-xs bg-secondary border border-border px-2 py-0.5 rounded text-muted-foreground">
                {project.weight}% weight
              </span>
            )}
          </div>
          <div className="w-48">
            <ProgressBar progress={project.progress ?? 0} />
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden md:block text-right">
            <div className="text-xs text-muted-foreground">Budget</div>
            <div className="font-bold text-sm font-mono">{formatCurrency(project.budget ?? 0)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Milestones</div>
            <div className="font-bold text-sm">{project.milestoneCount ?? 0}</div>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
        </div>
      </div>

      {expanded && <MilestoneSection projectId={project.id} pillarColor={pillarColor} />}
    </div>
  );
}

function MilestoneSection({ projectId, pillarColor }: { projectId: number; pillarColor: string }) {
  const { data, isLoading } = useListSpmoMilestones(projectId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedEvidence, setExpandedEvidence] = useState<number | null>(null);

  const createMutation = useCreateSpmoMilestone();
  const updateMutation = useUpdateSpmoMilestone();
  const deleteMutation = useDeleteSpmoMilestone();
  const submitMutation = useSubmitSpmoMilestone();

  const milestones = data?.milestones ?? [];
  const totalEffort = milestones.reduce((s, m) => s + (m.effortDays ?? 0), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/spmo/projects/${projectId}/milestones`] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/programme"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/pending-approvals"] });
  };

  function handleInlineProgressUpdate(id: number, progress: number) {
    updateMutation.mutate({ id, data: { progress } }, {
      onSuccess: () => invalidate(),
    });
  }

  function handleInlineEffortUpdate(id: number, effort: number, name: string) {
    updateMutation.mutate({ id, data: { effortDays: effort } }, {
      onSuccess: () => invalidate(),
    });
  }

  function handleInlineNameUpdate(id: number, name: string) {
    updateMutation.mutate({ id, data: { name } }, {
      onSuccess: () => invalidate(),
    });
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

  function handleAddMilestone() {
    const createPayload: CreateSpmoMilestoneRequest = {
      name: "New Milestone",
      effortDays: 5,
      weight: 5,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };
    createMutation.mutate({ id: projectId, data: createPayload }, {
      onSuccess: () => {
        toast({ title: "Milestone added" });
        invalidate();
      },
      onError: () => toast({ variant: "destructive", title: "Failed to add milestone" }),
    });
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

  return (
    <div className="border-t border-border bg-secondary/10">
      <div className="px-6 py-3 flex items-center justify-between border-b border-border/50 bg-secondary/30">
        <div className="flex items-center gap-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Milestones</h4>
          <span className="text-xs text-muted-foreground">MILESTONE</span>
          <span className="text-xs text-muted-foreground ml-4">PROGRESS</span>
          <span className="text-xs text-muted-foreground ml-4">EFFORT (days)</span>
          <span className="text-xs text-muted-foreground ml-4">WT%</span>
        </div>
        <button
          onClick={handleAddMilestone}
          disabled={createMutation.isPending}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div>
          {(milestones as SpmoMilestoneWithEvidence[]).map((m) => {
            const autoWeight = totalEffort > 0 ? Math.round((m.effortDays ?? 0) / totalEffort * 100) : 0;
            const isApproved = m.status === "approved";
            const evidenceList = (m.evidence ?? []) as SpmoEvidence[];
            const hasEvidence = evidenceList.length > 0;
            const canSubmit = (m.progress ?? 0) >= 100 && hasEvidence;
            const evidenceOpen = expandedEvidence === m.id;

            return (
              <div key={m.id} className="group border-b border-border/30 last:border-b-0">
                <div className="px-6 py-3 flex items-center gap-4">
                  <div
                    className="w-1 h-10 rounded-full shrink-0 opacity-60"
                    style={{ backgroundColor: pillarColor }}
                  />

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    {isApproved ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        <span className="text-sm font-semibold text-success">{m.name}</span>
                      </div>
                    ) : (
                      <InlineEdit
                        value={m.name}
                        onSave={(v) => handleInlineNameUpdate(m.id, v)}
                        className="text-sm font-semibold"
                      />
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <StatusBadge status={m.status} />
                      {m.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          Due {format(new Date(m.dueDate), "MMM d")}
                        </span>
                      )}
                      {(m.progress ?? 0) >= 100 && !hasEvidence && !isApproved && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5">
                          <AlertCircle className="w-3 h-3" /> Evidence required to submit
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="w-40 shrink-0">
                    {isApproved ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-success/20 rounded-full overflow-hidden">
                          <div className="h-full bg-success rounded-full" style={{ width: "100%" }} />
                        </div>
                        <span className="text-xs font-bold text-success w-8 text-right">100%</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={m.progress ?? 0}
                            className="flex-1 accent-primary h-1"
                            style={{ accentColor: pillarColor }}
                            onChange={(e) => handleInlineProgressUpdate(m.id, parseInt(e.target.value))}
                            disabled={isApproved}
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={m.progress ?? 0}
                            disabled={isApproved}
                            onChange={(e) => {
                              const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              handleInlineProgressUpdate(m.id, v);
                            }}
                            className="w-12 text-xs font-bold text-right border border-border rounded px-1 py-0.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Effort */}
                  <div className="w-20 shrink-0">
                    {isApproved ? (
                      <span className="text-sm text-muted-foreground">{m.effortDays ?? 0}d</span>
                    ) : (
                      <InlineNumberEdit
                        value={m.effortDays ?? 0}
                        onSave={(v) => handleInlineEffortUpdate(m.id, v, m.name)}
                        suffix="d"
                        min={0}
                      />
                    )}
                  </div>

                  {/* Auto-weight */}
                  <div className="w-12 text-center shrink-0">
                    <span className="text-xs font-bold text-muted-foreground">{autoWeight}%</span>
                  </div>

                  {/* Evidence badge + toggle */}
                  <button
                    onClick={() => setExpandedEvidence(evidenceOpen ? null : m.id)}
                    className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 transition-colors shrink-0 ${
                      evidenceOpen ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                    title="Evidence"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="font-semibold">{evidenceList.length}</span>
                  </button>

                  {/* Submit for Approval – visible button */}
                  {!isApproved && m.status !== "submitted" && (
                    <button
                      onClick={() => handleSubmitForApproval(m.id, m.name)}
                      disabled={submitMutation.isPending || !canSubmit}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0
                        enabled:bg-primary enabled:text-primary-foreground enabled:border-primary enabled:hover:bg-primary/90
                        disabled:bg-secondary disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed"
                      title={canSubmit ? "Submit for approval" : "Progress must be 100% and at least one evidence file attached"}
                    >
                      <Send className="w-3 h-3" /> Submit
                    </button>
                  )}

                  {/* Delete (hover) */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isApproved && (
                      <button
                        onClick={() => handleDelete(m.id, m.name)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Evidence Panel */}
                {evidenceOpen && (
                  <EvidencePanel milestone={m} onInvalidate={invalidate} />
                )}
              </div>
            );
          })}

          {milestones.length === 0 && (
            <div className="px-6 py-6 text-center text-sm text-muted-foreground">
              No milestones yet.{" "}
              <button onClick={handleAddMilestone} className="text-primary hover:underline font-medium">
                Add one
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InlineEdit({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        className={`${inputClass} py-0.5 px-1 text-sm w-full`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft !== value) onSave(draft.trim());
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span
      className={`${className} cursor-pointer hover:underline`}
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
    >
      {value}
    </span>
  );
}

function InlineNumberEdit({
  value,
  onSave,
  suffix = "",
  min = 0,
}: {
  value: number;
  onSave: (v: number) => void;
  suffix?: string;
  min?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={min}
        className={`${inputClass} py-0.5 px-1 text-sm w-full`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (!isNaN(n) && n !== value) onSave(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span
      className="text-sm cursor-pointer hover:underline font-mono"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title="Click to edit"
    >
      {value}{suffix}
    </span>
  );
}
