import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  useGetSpmoProject,
  useGetSpmaProjectWeeklyReport,
  useGetSpmaProjectWeeklyReportHistory,
  useUpsertSpmaProjectWeeklyReport,
  useListSpmoRisks,
  useListSpmoPillars,
  useListSpmoInitiatives,
  useGetCurrentAuthUser,
  useApproveSpmoMilestone,
  useRejectSpmoMilestone,
  useCreateSpmoMilestone,
  useUpdateSpmoMilestone,
  useDeleteSpmoMilestone,
  useAddSpmoEvidence,
  useRunSpmoAiValidateEvidence,
  useListSpmoChangeRequests,
  useCreateSpmoChangeRequest,
  useUpdateSpmoChangeRequest,
  useDeleteSpmoChangeRequest,
  useListSpmoRaci,
  useUpsertSpmoRaci,
  useDeleteSpmoRaci,
  useListSpmoActions,
  useCreateSpmoAction,
  useUpdateSpmoAction,
  useDeleteSpmoAction,
  useListSpmoDocuments,
  useCreateSpmoDocument,
  useDeleteSpmoDocument,
  type SpmoMilestoneWithEvidence,
  type SpmoEvidence,
  type SpmoHealthStatus,
  type SpmoChangeRequest,
  type SpmoRaci,
  type SpmoAction,
  type SpmoDocument,
} from "@workspace/api-client-react";
import { Card, ProgressBar, StatusBadge, PageHeader } from "@/components/ui-elements";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2, ArrowLeft, CheckCircle2, XCircle, FileText, FileImage,
  FileArchive, FileSpreadsheet, Upload, AlertCircle, Clock, Target,
  Calendar, DollarSign, User, Building2, Layers, ChevronRight,
  Sparkles, TrendingUp, ShieldAlert, Activity, ClipboardList, Pencil, Save, X, Plus, ExternalLink,
  GitPullRequest, Grid3X3, ListTodo, FolderOpen, Trash2, ChevronDown, Lock,
} from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fileIcon(contentType: string | null | undefined) {
  if (!contentType) return FileText;
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.includes("zip") || contentType.includes("archive")) return FileArchive;
  if (contentType.includes("sheet") || contentType.includes("excel") || contentType.includes("csv")) return FileSpreadsheet;
  return FileText;
}

const HEALTH_CONFIG: Record<SpmoHealthStatus, { label: string; color: string; bg: string; border: string }> = {
  on_track:  { label: "On Track",  color: "text-success",     bg: "bg-success/10",     border: "border-success/20" },
  at_risk:   { label: "At Risk",   color: "text-warning",     bg: "bg-warning/10",     border: "border-warning/20" },
  delayed:   { label: "Delayed",   color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
  completed: { label: "Completed", color: "text-success",     bg: "bg-success/10",     border: "border-success/20" },
};

function HealthBadge({ status }: { status: SpmoHealthStatus | null | undefined }) {
  if (!status) return null;
  const c = HEALTH_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${c.color} ${c.bg} ${c.border}`}>
      {c.label}
    </span>
  );
}

type TabKey = "overview" | "milestones" | "weekly-report" | "risks" | "changes" | "raci" | "actions" | "documents";

// ─── Evidence inline panel ─────────────────────────────────────────────────────

function EvidenceSection({
  milestone,
  canApprove,
  onInvalidate,
}: {
  milestone: SpmoMilestoneWithEvidence;
  canApprove: boolean;
  onInvalidate: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const aiMutation = useRunSpmoAiValidateEvidence();
  const approveMutation = useApproveSpmoMilestone();
  const rejectMutation = useRejectSpmoMilestone();
  const addEvidence = useAddSpmoEvidence();

  const evidenceList = (milestone.evidence ?? []) as SpmoEvidence[];
  const isSubmitted = milestone.status === "submitted";
  const isApproved = milestone.status === "approved";

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId: milestone.id }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = (await urlRes.json()) as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error("Upload failed");
      await addEvidence.mutateAsync({ id: milestone.id, data: { objectPath, fileName: file.name, contentType: file.type } });
      toast({ title: "Evidence uploaded" });
      onInvalidate();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleApprove = async () => {
    await approveMutation.mutateAsync({ id: milestone.id, data: {} });
    toast({ title: "Milestone approved" });
    onInvalidate();
  };

  const handleReject = async () => {
    await rejectMutation.mutateAsync({ id: milestone.id, data: { reason: rejectReason || undefined } });
    toast({ title: "Milestone rejected" });
    setRejecting(false);
    setRejectReason("");
    onInvalidate();
  };

  return (
    <div className="mt-3 border-t border-border/40 pt-3 space-y-2">
      {/* Evidence files */}
      {evidenceList.length > 0 && (
        <div className="space-y-1.5">
          {evidenceList.map((ev) => {
            const Icon = fileIcon(ev.contentType);
            return (
              <div key={ev.id} className="flex items-center gap-2 p-2 bg-secondary/40 border border-border/50 rounded-lg text-xs group hover:border-primary/30 transition-colors">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{ev.fileName}</div>
                  {ev.uploadedByName && <div className="text-[10px] text-muted-foreground">{ev.uploadedByName} · {fmt(ev.createdAt)}</div>}
                </div>
                {ev.aiValidated && (
                  <span className="text-[9px] bg-success/10 text-success px-1.5 py-0.5 rounded font-bold border border-success/20 shrink-0">AI ✓ {ev.aiScore ?? "—"}</span>
                )}
                <a
                  href={`/api/storage/objects${ev.objectPath}`}
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

      {evidenceList.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <FileText className="w-3.5 h-3.5" />
          No evidence uploaded yet
        </div>
      )}

      {/* Upload + AI Validate */}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || isApproved}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border hover:bg-secondary/80 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload Evidence
        </button>

        {evidenceList.length > 0 && (
          <button
            onClick={() => aiMutation.mutate({ data: { milestoneId: milestone.id } })}
            disabled={aiMutation.isPending || isApproved}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            {aiMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
            AI Validate
          </button>
        )}

        {/* Approve / Reject (admin/approver only) */}
        {canApprove && isSubmitted && (
          <>
            <button
              onClick={handleApprove}
              disabled={approveMutation.isPending || evidenceList.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-success text-white hover:-translate-y-0.5 transition-transform shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={rejectMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </>
        )}

        {isApproved && (
          <div className="flex items-center gap-1.5 text-success text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </div>
        )}
      </div>

      {/* Rejection reason input */}
      {rejecting && (
        <div className="flex gap-2 mt-2">
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)"
            className="flex-1 text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button onClick={handleReject} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive text-white hover:opacity-90">Confirm</button>
          <button onClick={() => setRejecting(false)} className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary">Cancel</button>
        </div>
      )}

      {/* AI validation result */}
      {aiMutation.data && (
        <div className="p-2.5 bg-primary/5 border border-primary/15 rounded-lg text-xs space-y-1 mt-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-semibold text-primary">AI Validation</span>
            <span className={`ml-auto font-bold text-sm ${aiMutation.data.overallScore >= 70 ? "text-success" : aiMutation.data.overallScore >= 50 ? "text-warning" : "text-destructive"}`}>
              {Math.round(aiMutation.data.overallScore / 10)}/10
            </span>
          </div>
          <p className="text-foreground/75 leading-relaxed">{aiMutation.data.reasoning}</p>
        </div>
      )}
    </div>
  );
}

// ─── Milestones tab (list + add form) ──────────────────────────────────────────

function MilestonesTab({
  projectId,
  milestones,
  milestoneApproved,
  pendingApprovals,
  canApprove,
  canEdit,
  onInvalidate,
}: {
  projectId: number;
  milestones: SpmoMilestoneWithEvidence[];
  milestoneApproved: number;
  pendingApprovals: number;
  canApprove: boolean;
  canEdit: boolean;
  onInvalidate: () => void;
}) {
  const createMilestone = useCreateSpmoMilestone();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", weight: "", effortDays: "", dueDate: "", description: "" });

  const inputCls = "w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50";

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await createMilestone.mutateAsync({
      id: projectId,
      data: {
        name: form.name.trim(),
        weight: form.weight !== "" ? Number(form.weight) : 0,
        effortDays: form.effortDays !== "" ? Number(form.effortDays) : 0,
        dueDate: form.dueDate || new Date().toISOString().slice(0, 10),
        description: form.description || undefined,
      },
    });
    toast({ title: "Milestone created" });
    onInvalidate();
    setForm({ name: "", weight: "", effortDays: "", dueDate: "", description: "" });
    setShowAdd(false);
  };

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-medium">
          {milestones.length} milestone{milestones.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> {milestoneApproved} approved</span>
            {pendingApprovals > 0 && (
              <span className="flex items-center gap-1 text-warning font-semibold"><AlertCircle className="w-3.5 h-3.5" /> {pendingApprovals} pending</span>
            )}
          </div>
          {canEdit && !showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Milestone
            </button>
          )}
        </div>
      </div>

      {/* Add milestone form */}
      {showAdd && (
        <Card className="p-4 border-primary/30 ring-1 ring-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">New Milestone</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Name *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Milestone name" />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-0.5">Weight (%)</label>
              <input type="number" min={0} max={100} className={inputCls} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-0.5">Effort (days)</label>
              <input type="number" min={0} className={inputCls} value={form.effortDays} onChange={(e) => setForm((f) => ({ ...f, effortDays: e.target.value }))} placeholder="—" />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Due Date</label>
              <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Description</label>
              <textarea rows={2} className={`${inputCls} resize-none`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description…" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleCreate}
              disabled={createMilestone.isPending || !form.name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3 h-3" />
              {createMilestone.isPending ? "Creating…" : "Create Milestone"}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-secondary transition-colors">
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {milestones.length === 0 && !showAdd && (
        <Card className="text-center py-16">
          <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="font-bold">No milestones yet</h3>
          {canEdit ? (
            <button onClick={() => setShowAdd(true)} className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mx-auto">
              <Plus className="w-4 h-4" /> Add First Milestone
            </button>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">No milestones have been added yet.</p>
          )}
        </Card>
      )}

      {/* List */}
      {milestones.map((m) => (
        <MilestoneRow key={m.id} milestone={m} canApprove={canApprove} canEdit={canEdit} onInvalidate={onInvalidate} />
      ))}
    </div>
  );
}

// ─── Milestone row ─────────────────────────────────────────────────────────────

function MilestoneRow({
  milestone,
  canApprove,
  canEdit,
  onInvalidate,
}: {
  milestone: SpmoMilestoneWithEvidence;
  canApprove: boolean;
  canEdit: boolean;
  onInvalidate: () => void;
}) {
  const updateMilestone = useUpdateSpmoMilestone();
  const deleteMilestone = useDeleteSpmoMilestone();
  const { toast } = useToast();

  const [progressEditing, setProgressEditing] = useState(false);
  const [progress, setProgress] = useState(milestone.progress ?? 0);

  const [detailEditing, setDetailEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState({
    name: milestone.name,
    weight: milestone.weight ?? 0,
    description: milestone.description ?? "",
    dueDate: milestone.dueDate ? milestone.dueDate.toString().slice(0, 10) : "",
    effortDays: milestone.effortDays ?? "",
  });

  const isApproved = milestone.status === "approved";
  const isRejected = milestone.status === "rejected";
  const isSubmitted = milestone.status === "submitted";
  const isPhaseGate = !!(milestone as { phaseGate?: string | null }).phaseGate;

  const saveProgress = async () => {
    await updateMilestone.mutateAsync({ id: milestone.id, data: { progress } });
    toast({ title: "Progress updated" });
    onInvalidate();
    setProgressEditing(false);
  };

  const openDetailEdit = () => {
    setDraft({
      name: milestone.name,
      weight: milestone.weight ?? 0,
      description: milestone.description ?? "",
      dueDate: milestone.dueDate ? milestone.dueDate.toString().slice(0, 10) : "",
      effortDays: milestone.effortDays ?? "",
    });
    setDetailEditing(true);
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const saveDetails = async () => {
    if (!draft.name.trim()) return;
    setSaveError(null);
    try {
      await updateMilestone.mutateAsync({
        id: milestone.id,
        data: {
          name: draft.name.trim(),
          weight: Number(draft.weight) || 0,
          description: draft.description || undefined,
          dueDate: draft.dueDate || undefined,
          effortDays: draft.effortDays !== "" ? Number(draft.effortDays) : undefined,
        },
      });
      toast({ title: "Milestone updated" });
      onInvalidate();
      setDetailEditing(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to save. Check the weight — total cannot exceed 100%.";
      setSaveError(msg);
    }
  };

  const handleDelete = async () => {
    await deleteMilestone.mutateAsync({ id: milestone.id });
    toast({ title: "Milestone deleted" });
    onInvalidate();
    setConfirmDelete(false);
  };

  const inputCls = "w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className={`rounded-xl border ${isPhaseGate ? "border-blue-300 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800" : isApproved ? "border-success/30 bg-success/5" : isRejected ? "border-destructive/30 bg-destructive/5" : isSubmitted ? "border-primary/30 bg-primary/5" : "border-border bg-background"} p-4 transition-colors`}>

      {/* ── Detail edit form ── */}
      {detailEditing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Pencil className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Edit Milestone</span>
            {isPhaseGate && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700">
                <Lock className="w-2.5 h-2.5" /> PHASE GATE
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Name *</label>
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Milestone name"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-0.5">Weight (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                className={inputCls}
                value={draft.weight}
                onChange={(e) => setDraft((d) => ({ ...d, weight: +e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-0.5">Effort (days)</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={draft.effortDays}
                onChange={(e) => setDraft((d) => ({ ...d, effortDays: e.target.value }))}
                placeholder="—"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Due Date</label>
              <input
                type="date"
                className={inputCls}
                value={draft.dueDate}
                onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Description</label>
              <textarea
                rows={2}
                className={`${inputCls} resize-none`}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Optional description…"
              />
            </div>
          </div>
          {saveError && (
            <div className="flex items-start gap-1.5 p-2 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={saveDetails}
              disabled={updateMilestone.isPending || !draft.name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3 h-3" />
              {updateMilestone.isPending ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={() => { setDetailEditing(false); setSaveError(null); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-sm">{milestone.name}</span>
                {isPhaseGate && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700">
                    <Lock className="w-2.5 h-2.5" />
                    PHASE GATE
                  </span>
                )}
                <StatusBadge status={milestone.status} />
                <HealthBadge status={milestone.healthStatus} />
              </div>
              {milestone.description && (
                <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{milestone.description}</p>
              )}

              {/* Progress */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 max-w-[200px]">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                    <span>Progress</span>
                    <span className="font-semibold text-foreground">{milestone.progress ?? 0}%</span>
                  </div>
                  <ProgressBar progress={milestone.progress ?? 0} showLabel={false} />
                </div>
                {!isApproved && (
                  progressEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progress}
                        onChange={(e) => setProgress(Math.min(100, Math.max(0, +e.target.value)))}
                        className="w-16 text-xs border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button onClick={saveProgress} disabled={updateMilestone.isPending} className="text-[10px] font-semibold text-success hover:underline">
                        {updateMilestone.isPending ? "…" : "Save"}
                      </button>
                      <button onClick={() => setProgressEditing(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setProgressEditing(true)} className="text-[10px] font-semibold text-primary hover:underline">
                      Update %
                    </button>
                  )
                )}
              </div>

              {/* Meta */}
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                {milestone.dueDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due {fmt(milestone.dueDate)}
                  </div>
                )}
                {milestone.effortDays && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {milestone.effortDays}d effort
                  </div>
                )}
                {milestone.weight > 0 && (
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {milestone.weight}% weight
                  </div>
                )}
              </div>

              {/* Rejection reason */}
              {isRejected && milestone.rejectionReason && (
                <div className="flex items-start gap-1.5 mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{milestone.rejectionReason}</span>
                </div>
              )}

              <EvidenceSection milestone={milestone} canApprove={canApprove} onInvalidate={onInvalidate} />
            </div>

            {/* Action buttons */}
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={openDetailEdit}
                  title="Edit milestone"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!isPhaseGate && (
                  confirmDelete ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleDelete}
                        disabled={deleteMilestone.isPending}
                        className="px-2 py-1 rounded text-[10px] font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                      >
                        {deleteMilestone.isPending ? "…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-2 py-1 rounded text-[10px] border border-border hover:bg-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      title="Delete milestone"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type Props = {
  params: { id: string };
};

export default function ProjectDetail({ params }: Props) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const param = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    const valid: TabKey[] = ["overview", "milestones", "weekly-report", "risks", "changes", "raci", "actions", "documents"];
    return param && valid.includes(param) ? param : "overview";
  });
  const [editingReport, setEditingReport] = useState(false);
  const [reportDraft, setReportDraft] = useState({ keyAchievements: "", nextSteps: "" });
  const projectId = parseInt(params?.id ?? "0");

  const { data: authData } = useGetCurrentAuthUser();
  const userRole = authData?.user?.role;
  const canApprove = userRole === "admin" || userRole === "approver";
  const canEditReport = userRole === "admin" || userRole === "project-manager";
  const isAdmin = userRole === "admin";

  const { data: project, isLoading } = useGetSpmoProject(projectId);
  const { data: pillarsData } = useListSpmoPillars();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: weeklyReport, queryKey: weeklyReportKey } = useGetSpmaProjectWeeklyReport(projectId);
  const { data: reportHistory, queryKey: reportHistoryKey } = useGetSpmaProjectWeeklyReportHistory(projectId);
  const { data: risksData } = useListSpmoRisks();
  const upsertReport = useUpsertSpmaProjectWeeklyReport();

  const { data: changeRequestsData, queryKey: crQK } = useListSpmoChangeRequests(projectId);
  const createCR = useCreateSpmoChangeRequest();
  const updateCR = useUpdateSpmoChangeRequest();
  const deleteCR = useDeleteSpmoChangeRequest();

  const { data: raciData, queryKey: raciQK } = useListSpmoRaci(projectId);
  const upsertRaci = useUpsertSpmoRaci();
  const deleteRaci = useDeleteSpmoRaci();

  const { data: actionsData, queryKey: actionsQK } = useListSpmoActions(projectId);
  const createAction = useCreateSpmoAction();
  const updateAction = useUpdateSpmoAction();
  const deleteAction = useDeleteSpmoAction();

  const { data: documentsData, queryKey: docsQK } = useListSpmoDocuments(projectId);

  const { toast } = useToast();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/spmo/projects/${projectId}`] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
  };

  const invalidateReport = () => {
    qc.invalidateQueries({ queryKey: weeklyReportKey });
    qc.invalidateQueries({ queryKey: reportHistoryKey });
  };

  const startEditing = () => {
    setReportDraft({
      keyAchievements: weeklyReport?.keyAchievements ?? "",
      nextSteps: weeklyReport?.nextSteps ?? "",
    });
    setEditingReport(true);
  };

  const cancelEditing = () => {
    setEditingReport(false);
    setReportDraft({ keyAchievements: "", nextSteps: "" });
  };

  const saveReport = async () => {
    await upsertReport.mutateAsync({
      id: projectId,
      data: {
        keyAchievements: reportDraft.keyAchievements || undefined,
        nextSteps: reportDraft.nextSteps || undefined,
      },
    });
    toast({ title: "Weekly report saved" });
    invalidateReport();
    cancelEditing();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-bold mb-2">Project not found</h2>
        <button onClick={() => navigate("/projects")} className="text-primary hover:underline text-sm">
          ← Back to Projects
        </button>
      </div>
    );
  }

  const pillars = pillarsData?.pillars ?? [];
  const initiatives = initiativesData?.initiatives ?? [];
  const initiative = initiatives.find((i) => i.id === project.initiativeId);
  const pillar = pillars.find((p) => p.id === initiative?.pillarId);
  const pillarColor = pillar?.color ?? "#3b82f6";

  const projectRisks = (risksData?.risks ?? []).filter((r) => r.projectId === projectId);
  const milestones = (project.milestones ?? []) as SpmoMilestoneWithEvidence[];

  const budgetPct = project.budget > 0 ? Math.round((project.budgetSpent / project.budget) * 100) : 0;
  const milestoneApproved = project.approvedMilestones ?? 0;
  const milestoneTotal = project.milestoneCount ?? 0;

  const changeRequests = (changeRequestsData?.changeRequests ?? []) as SpmoChangeRequest[];
  const raciRows = (raciData?.raci ?? []) as SpmoRaci[];
  const actionItems = (actionsData?.actions ?? []) as SpmoAction[];
  const documents = (documentsData?.documents ?? []) as SpmoDocument[];
  const openActions = actionItems.filter((a) => a.status === "open" || a.status === "in_progress").length;

  const TABS: { key: TabKey; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "overview",      label: "Overview",       icon: Target },
    { key: "milestones",    label: "Milestones",     icon: ClipboardList, count: milestoneTotal },
    { key: "weekly-report", label: "Weekly Report",  icon: Activity },
    { key: "risks",         label: "Risks",          icon: ShieldAlert,   count: projectRisks.length },
    { key: "changes",       label: "Change Control", icon: GitPullRequest, count: changeRequests.length },
    { key: "raci",          label: "RACI",           icon: Grid3X3 },
    { key: "actions",       label: "Actions",        icon: ListTodo,      count: openActions || undefined },
    { key: "documents",     label: "Documents",      icon: FolderOpen,    count: documents.length || undefined },
  ];

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Back + Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Projects
        </button>
        {pillar && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span style={{ color: pillarColor }} className="font-medium">{pillar.name}</span>
          </>
        )}
        {initiative && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>{initiative.name}</span>
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-semibold truncate max-w-[200px]">{project.name}</span>
      </div>

      {/* Page Header */}
      <div
        className="rounded-2xl border border-border p-6 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${pillarColor}18 0%, transparent 60%)` }}
      >
        <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: pillarColor }} />
        <div className="ml-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {project.projectCode && (
                  <span className="font-mono text-sm text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded">
                    {project.projectCode}
                  </span>
                )}
                <StatusBadge status={project.status} />
                <HealthBadge status={project.healthStatus} />
              </div>
              <h1 className="text-2xl font-display font-bold leading-tight">{project.name}</h1>
              {project.ownerName && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                  <User className="w-3.5 h-3.5" />
                  {project.ownerName}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-6 shrink-0">
              <div className="text-center">
                <div className="text-2xl font-display font-bold text-primary">{Math.round(project.progress ?? 0)}%</div>
                <div className="text-xs text-muted-foreground">Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-display font-bold">{milestoneApproved}/{milestoneTotal}</div>
                <div className="text-xs text-muted-foreground">Approved</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-display font-bold text-destructive">{budgetPct}%</div>
                <div className="text-xs text-muted-foreground">Budget Used</div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <ProgressBar progress={project.progress ?? 0} showLabel={false} />
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Key metrics grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Start Date</span>
              </div>
              <div className="font-semibold text-sm">{fmt(project.startDate)}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-destructive/60" />
                <span className="text-xs text-muted-foreground font-medium">Target Date</span>
              </div>
              <div className="font-semibold text-sm">{fmt(project.targetDate)}</div>
            </Card>
            <Card className="p-4 col-span-1 lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Budget Allocation</span>
              </div>
              <div className="font-bold text-base font-mono mb-2">{formatCurrency(project.budget)} SAR total</div>
              {((project as { budgetCapex?: number }).budgetCapex ?? 0) > 0 || ((project as { budgetOpex?: number }).budgetOpex ?? 0) > 0 ? (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase">CAPEX</div>
                    <div className="font-bold text-sm font-mono">{formatCurrency((project as { budgetCapex?: number }).budgetCapex ?? 0)}</div>
                    <div className="text-[10px] text-muted-foreground">{project.budget > 0 ? Math.round(((project as { budgetCapex?: number }).budgetCapex ?? 0) / project.budget * 100) : 0}% of total</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase">OPEX</div>
                    <div className="font-bold text-sm font-mono">{formatCurrency((project as { budgetOpex?: number }).budgetOpex ?? 0)}</div>
                    <div className="text-[10px] text-muted-foreground">{project.budget > 0 ? Math.round(((project as { budgetOpex?: number }).budgetOpex ?? 0) / project.budget * 100) : 0}% of total</div>
                  </div>
                </div>
              ) : null}
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-warning/70" />
                <span className="text-xs text-muted-foreground font-medium">Budget Spent</span>
              </div>
              <div className="font-bold text-sm font-mono">{formatCurrency(project.budgetSpent)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{budgetPct}% of allocation</div>
            </Card>
          </div>

          {/* Description + Pillar/Initiative info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 lg:col-span-2">
              <h3 className="font-semibold text-sm mb-3">Project Description</h3>
              {project.description ? (
                <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No description provided.</p>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-3">Classification</h3>
              <div className="space-y-3">
                {pillar && (
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pillarColor }} />
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pillar</div>
                      <div className="text-sm font-semibold">{pillar.name}</div>
                    </div>
                  </div>
                )}
                {initiative && (
                  <div className="flex items-center gap-2">
                    <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Initiative</div>
                      <div className="text-sm font-semibold">{initiative.name}</div>
                    </div>
                  </div>
                )}
                {project.ownerName && (
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Project Owner</div>
                      <div className="text-sm font-semibold">{project.ownerName}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3 h-3 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight</div>
                    <div className="text-sm font-semibold">{project.weight}%</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Milestone summary */}
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Milestone Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(["pending", "in_progress", "submitted", "approved"] as const).map((status) => {
                const count = milestones.filter((m) => m.status === status).length;
                const labels: Record<string, string> = {
                  pending: "Not Started", in_progress: "In Progress",
                  submitted: "Pending Approval", approved: "Approved",
                };
                const colors: Record<string, string> = {
                  pending: "text-muted-foreground", in_progress: "text-primary",
                  submitted: "text-warning", approved: "text-success",
                };
                return (
                  <div key={status} className="text-center">
                    <div className={`text-2xl font-display font-bold ${colors[status]}`}>{count}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{labels[status]}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Computed status */}
          {project.computedStatus && (
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-3">Health Insight</h3>
              <div className="flex items-start gap-3">
                <HealthBadge status={project.computedStatus.status} />
                <div className="text-sm text-muted-foreground flex-1 leading-relaxed">{project.computedStatus.reason}</div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">SPI</div>
                  <div className={`text-sm font-bold ${project.computedStatus.spi >= 1 ? "text-success" : project.computedStatus.spi >= 0.85 ? "text-warning" : "text-destructive"}`}>
                    {project.computedStatus.spi.toFixed(2)}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── MILESTONES ── */}
      {activeTab === "milestones" && (
        <MilestonesTab
          projectId={projectId}
          milestones={milestones}
          milestoneApproved={milestoneApproved}
          pendingApprovals={project.pendingApprovals}
          canApprove={canApprove}
          canEdit={isAdmin || canEditReport}
          onInvalidate={invalidate}
        />
      )}

      {/* ── WEEKLY REPORT ── */}
      {activeTab === "weekly-report" && (
        <div className="space-y-4">
          {/* Current week */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Current Week Report</h3>
              {weeklyReport?.weekStart && !editingReport && (
                <span className="text-xs text-muted-foreground">Week of {fmt(weeklyReport.weekStart)}</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {canEditReport && !editingReport && (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border hover:bg-secondary/80 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {weeklyReport?.keyAchievements || weeklyReport?.nextSteps ? "Edit Report" : "Add Report"}
                  </button>
                )}
              </div>
            </div>

            {editingReport ? (
              /* ── EDIT MODE ── */
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                    Key Achievements This Week
                  </label>
                  <textarea
                    value={reportDraft.keyAchievements}
                    onChange={(e) => setReportDraft((d) => ({ ...d, keyAchievements: e.target.value }))}
                    placeholder="Describe what was accomplished this week…"
                    rows={5}
                    className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none leading-relaxed placeholder:text-muted-foreground/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                    Next Steps &amp; Planned Actions
                  </label>
                  <textarea
                    value={reportDraft.nextSteps}
                    onChange={(e) => setReportDraft((d) => ({ ...d, nextSteps: e.target.value }))}
                    placeholder="Describe planned actions for next week…"
                    rows={5}
                    className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none leading-relaxed placeholder:text-muted-foreground/50 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <button
                    onClick={saveReport}
                    disabled={upsertReport.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-primary/80 text-white shadow-sm hover:-translate-y-0.5 transition-transform disabled:opacity-50"
                  >
                    {upsertReport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Report
                  </button>
                  <button
                    onClick={cancelEditing}
                    disabled={upsertReport.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── VIEW MODE ── */
              <>
                {weeklyReport?.keyAchievements || weeklyReport?.nextSteps ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="bg-success/5 border border-success/15 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        <span className="text-xs font-semibold text-success uppercase tracking-wider">Key Achievements</span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{weeklyReport.keyAchievements ?? "—"}</p>
                    </div>
                    <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Target className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">Next Steps</span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{weeklyReport.nextSteps ?? "—"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No weekly report submitted for this period.</p>
                    {canEditReport && (
                      <button
                        onClick={startEditing}
                        className="mt-3 text-sm font-semibold text-primary hover:underline"
                      >
                        Add this week's report →
                      </button>
                    )}
                  </div>
                )}
                {weeklyReport?.updatedByName && (
                  <div className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border flex items-center gap-1.5">
                    <User className="w-3 h-3" />
                    Updated by <span className="font-medium">{weeklyReport.updatedByName}</span>
                    {weeklyReport.updatedAt && <span>· {fmt(weeklyReport.updatedAt)}</span>}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* History */}
          {(reportHistory?.reports?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground">Previous Reports</h3>
              {(reportHistory?.reports ?? []).slice(0, 8).map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold">Week of {fmt(r.weekStart)}</span>
                    {r.updatedByName && <span className="text-xs text-muted-foreground">{r.updatedByName}</span>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {r.keyAchievements && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Achievements</div>
                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">{r.keyAchievements}</p>
                      </div>
                    )}
                    {r.nextSteps && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Next Steps</div>
                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">{r.nextSteps}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RISKS ── */}
      {activeTab === "risks" && (
        <div className="space-y-3">
          {/* Header bar with action button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {projectRisks.length === 0
                ? "No risks logged for this project."
                : `${projectRisks.length} risk${projectRisks.length !== 1 ? "s" : ""} linked to this project.`}
            </p>
            <Link
              to={`/risks?project=${projectId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add / Manage Risks
              <ExternalLink className="w-3 h-3 opacity-60" />
            </Link>
          </div>

          {projectRisks.length === 0 ? (
            <Card className="text-center py-14">
              <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <h3 className="font-bold">No risks logged yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Log risks to track threats and mitigations for this project.</p>
              <Link
                to={`/risks?project=${projectId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-600 text-white hover:-translate-y-0.5 transition-transform shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Log a Risk
              </Link>
            </Card>
          ) : (
            <>
              {projectRisks.map((risk) => {
                const scoreColor = risk.riskScore >= 9 ? "text-destructive" : risk.riskScore >= 5 ? "text-warning" : "text-success";
                const scoreBg = risk.riskScore >= 9 ? "bg-destructive/10 border-destructive/20" : risk.riskScore >= 5 ? "bg-warning/10 border-warning/20" : "bg-success/10 border-success/20";
                return (
                  <Card key={risk.id} className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-display font-bold border ${scoreColor} ${scoreBg} shrink-0`}>
                        {risk.riskScore}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <h4 className="font-semibold text-sm">{risk.title}</h4>
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground font-medium capitalize">{risk.status}</span>
                          {risk.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground font-medium">{risk.category}</span>
                          )}
                        </div>
                        {risk.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{risk.description}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span>Probability: <span className="font-semibold capitalize text-foreground">{risk.probability}</span></span>
                          <span>Impact: <span className="font-semibold capitalize text-foreground">{risk.impact}</span></span>
                          {risk.owner && <span>Owner: <span className="font-semibold text-foreground">{risk.owner}</span></span>}
                        </div>
                      </div>
                      <Link
                        to={`/risks?project=${projectId}`}
                        className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Edit in Risk Register"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </Card>
                );
              })}

              {/* Footer link */}
              <div className="flex justify-center pt-1">
                <Link
                  to={`/risks?project=${projectId}`}
                  className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 hover:text-amber-700 hover:underline transition-colors"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Open full Risk Register for this project
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CHANGE CONTROL ── */}
      {activeTab === "changes" && (
        <ChangeControlTab
          projectId={projectId}
          changeRequests={changeRequests}
          isAdmin={isAdmin}
          canEdit={canEditReport}
          currentUser={authData?.user}
          onCreate={(data) => createCR.mutateAsync({ ...data, projectId } as SpmoChangeRequest, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: crQK }); },
          })}
          onUpdate={(id, data) => updateCR.mutateAsync({ id, ...data } as { id: number } & Partial<SpmoChangeRequest>, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: crQK }); },
          })}
          onDelete={(id) => deleteCR.mutateAsync(id, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: crQK }); },
          })}
        />
      )}

      {/* ── RACI ── */}
      {activeTab === "raci" && (
        <RaciTab
          projectId={projectId}
          milestones={milestones}
          raciRows={raciRows}
          canEdit={isAdmin || canEditReport}
          onUpsert={(data) => upsertRaci.mutateAsync(data as SpmoRaci, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: raciQK }); },
          })}
          onDelete={(id) => deleteRaci.mutateAsync(id, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: raciQK }); },
          })}
        />
      )}

      {/* ── ACTION ITEMS ── */}
      {activeTab === "actions" && (
        <ActionsTab
          projectId={projectId}
          milestones={milestones}
          actions={actionItems}
          canEdit={canEditReport || isAdmin}
          currentUser={authData?.user}
          onCreate={(data) => createAction.mutateAsync({ ...data, projectId } as SpmoAction, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: actionsQK }); },
          })}
          onUpdate={(id, data) => updateAction.mutateAsync({ id, ...data } as { id: number } & Partial<SpmoAction>, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: actionsQK }); },
          })}
          onDelete={(id) => deleteAction.mutateAsync(id, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: actionsQK }); },
          })}
        />
      )}

      {/* ── DOCUMENTS ── */}
      {activeTab === "documents" && (
        <DocumentsTab
          projectId={projectId}
          documents={documents}
          canEdit={isAdmin || canEditReport}
          currentUser={authData?.user}
          onInvalidate={() => qc.invalidateQueries({ queryKey: docsQK })}
        />
      )}
    </div>
  );
}

// ─── Change Control Tab ────────────────────────────────────────────────────────

const CR_TYPE_LABELS: Record<string, string> = {
  scope: "Scope", budget: "Budget", timeline: "Timeline", resource: "Resource", other: "Other",
};
const CR_STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground bg-secondary border-border",
  submitted: "text-blue-700 bg-blue-50 border-blue-200",
  under_review: "text-yellow-700 bg-yellow-50 border-yellow-200",
  approved: "text-green-700 bg-green-50 border-green-200",
  rejected: "text-red-700 bg-red-50 border-red-200",
  withdrawn: "text-gray-600 bg-gray-50 border-gray-200",
};
const CR_STATUSES = ["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"] as const;

type CRFormData = { title: string; changeType: string; description: string; impact: string; budgetImpact: string; timelineImpact: string; status: string };
const emptyCRForm = (): CRFormData => ({ title: "", changeType: "other", description: "", impact: "", budgetImpact: "", timelineImpact: "", status: "draft" });

function CRInlineForm({
  initial, onSave, onCancel, saving,
}: {
  initial: CRFormData;
  onSave: (data: CRFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CRFormData>(initial);
  const f = <K extends keyof CRFormData>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((v) => ({ ...v, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <div className="col-span-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Title *</label>
        <input autoFocus value={form.title} onChange={f("title")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Brief description of the change" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Type</label>
        <select value={form.changeType} onChange={f("changeType")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
          {Object.entries(CR_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Status</label>
        <select value={form.status} onChange={f("status")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
          {CR_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Budget Impact (SAR)</label>
        <input type="number" value={form.budgetImpact} onChange={f("budgetImpact")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. 500000" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Timeline Impact (days)</label>
        <input type="number" value={form.timelineImpact} onChange={f("timelineImpact")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. 14" />
      </div>
      <div className="col-span-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Description</label>
        <textarea value={form.description} onChange={f("description")} rows={2} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" placeholder="What is changing and why?" />
      </div>
      <div className="col-span-2 flex gap-2">
        <button onClick={() => onSave(form)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50 hover:-translate-y-0.5 transition-transform">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
        <button onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
      </div>
    </div>
  );
}

function ChangeControlTab({
  projectId, changeRequests, isAdmin, canEdit, currentUser, onCreate, onUpdate, onDelete,
}: {
  projectId: number;
  changeRequests: SpmoChangeRequest[];
  isAdmin: boolean;
  canEdit: boolean;
  currentUser: { id: string; firstName?: string | null; lastName?: string | null } | undefined | null;
  onCreate: (data: Partial<SpmoChangeRequest>) => Promise<unknown>;
  onUpdate: (id: number, data: Partial<SpmoChangeRequest>) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (form: CRFormData) => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await onCreate({
        title: form.title,
        changeType: form.changeType as SpmoChangeRequest["changeType"],
        status: form.status as SpmoChangeRequest["status"],
        description: form.description || undefined,
        impact: form.impact || undefined,
        budgetImpact: form.budgetImpact ? parseFloat(form.budgetImpact) : undefined,
        timelineImpact: form.timelineImpact ? parseInt(form.timelineImpact) : undefined,
      });
      toast({ title: "Change request created" });
      setEditingId(null);
    } finally { setSaving(false); }
  };

  const handleUpdate = async (cr: SpmoChangeRequest, form: CRFormData) => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await onUpdate(cr.id, {
        title: form.title,
        changeType: form.changeType as SpmoChangeRequest["changeType"],
        status: form.status as SpmoChangeRequest["status"],
        description: form.description || undefined,
        budgetImpact: form.budgetImpact ? parseFloat(form.budgetImpact) : undefined,
        timelineImpact: form.timelineImpact ? parseInt(form.timelineImpact) : undefined,
      });
      toast({ title: "Updated" });
      setEditingId(null);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{changeRequests.length} change request{changeRequests.length !== 1 ? "s" : ""}</p>
        {canEdit && editingId !== "new" && (
          <button
            onClick={() => setEditingId("new")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Request
          </button>
        )}
      </div>

      {changeRequests.length === 0 && editingId !== "new" && (
        <Card className="text-center py-12">
          <GitPullRequest className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="font-bold">No change requests</h3>
          <p className="text-sm text-muted-foreground mt-1">Log change requests to track scope, budget, and timeline changes.</p>
          {canEdit && (
            <button onClick={() => setEditingId("new")} className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mx-auto">
              <Plus className="w-4 h-4" /> Add First Request
            </button>
          )}
        </Card>
      )}

      {changeRequests.map((cr) => (
        <Card key={cr.id} className={`p-4 transition-all ${editingId === cr.id ? "ring-2 ring-primary/30 border-primary/30" : "hover:shadow-md"}`}>
          {editingId === cr.id ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-primary">Editing request</span>
                <button onClick={() => setEditingId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
              <CRInlineForm
                initial={{ title: cr.title, changeType: cr.changeType, description: cr.description ?? "", impact: cr.impact ?? "", budgetImpact: cr.budgetImpact != null ? String(cr.budgetImpact) : "", timelineImpact: cr.timelineImpact != null ? String(cr.timelineImpact) : "", status: cr.status }}
                onSave={(form) => handleUpdate(cr, form)}
                onCancel={() => setEditingId(null)}
                saving={saving}
              />
            </>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm">{cr.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${CR_STATUS_COLORS[cr.status] ?? ""}`}>{cr.status.replace(/_/g, " ")}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground font-medium">{CR_TYPE_LABELS[cr.changeType]}</span>
                </div>
                {cr.description && <p className="text-xs text-muted-foreground">{cr.description}</p>}
                <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-muted-foreground">
                  {cr.budgetImpact != null && <span>Budget: <span className={`font-semibold ${cr.budgetImpact > 0 ? "text-destructive" : "text-success"}`}>{cr.budgetImpact > 0 ? "+" : ""}{formatCurrency(cr.budgetImpact)}</span></span>}
                  {cr.timelineImpact != null && <span>Timeline: <span className={`font-semibold ${cr.timelineImpact > 0 ? "text-warning" : "text-success"}`}>{cr.timelineImpact > 0 ? "+" : ""}{cr.timelineImpact}d</span></span>}
                  <span>By: {cr.requestedByName}</span>
                  <span>{new Date(cr.requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canEdit && (
                  <button onClick={() => setEditingId(cr.id)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => onDelete(cr.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {editingId === "new" && canEdit && (
        <Card className="p-4 border-primary/30 ring-2 ring-primary/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-primary">New Change Request</span>
            <button onClick={() => setEditingId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
          <CRInlineForm initial={emptyCRForm()} onSave={handleCreate} onCancel={() => setEditingId(null)} saving={saving} />
        </Card>
      )}
    </div>
  );
}

// ─── RACI Tab ─────────────────────────────────────────────────────────────────

const RACI_COLORS: Record<string, string> = {
  responsible: "bg-blue-100 text-blue-700 border-blue-200",
  accountable: "bg-purple-100 text-purple-700 border-purple-200",
  consulted: "bg-amber-100 text-amber-700 border-amber-200",
  informed: "bg-gray-100 text-gray-600 border-gray-200",
};
const RACI_LETTERS: Record<string, string> = { responsible: "R", accountable: "A", consulted: "C", informed: "I" };
const RACI_ROLES = ["responsible", "accountable", "consulted", "informed"] as const;
const RACI_TOOLTIPS: Record<string, string> = {
  responsible: "Responsible — does the work",
  accountable: "Accountable — owns the outcome",
  consulted: "Consulted — provides input",
  informed: "Informed — kept in the loop",
};

function RaciCellPopover({
  cell, canEdit, onSelect, onClear,
}: {
  cell: SpmoRaci | undefined;
  canEdit: boolean;
  onSelect: (role: SpmoRaci["role"]) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const currentRole = cell?.role;

  return (
    <div ref={ref} className="relative flex items-center justify-center">
      <button
        onClick={() => canEdit && setOpen((v) => !v)}
        title={currentRole ? RACI_TOOLTIPS[currentRole] : canEdit ? "Click to assign role" : "—"}
        className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all ${
          currentRole
            ? `${RACI_COLORS[currentRole]} shadow-sm`
            : "border-dashed border-border/60 text-muted-foreground/30 hover:border-primary/40 hover:text-primary/40"
        } ${canEdit ? "cursor-pointer hover:scale-105" : "cursor-default"}`}
      >
        {currentRole ? RACI_LETTERS[currentRole] : "·"}
      </button>

      {open && canEdit && (
        <div className="absolute z-50 top-10 left-1/2 -translate-x-1/2 bg-white border border-border rounded-xl shadow-xl p-2 flex flex-col gap-1 min-w-[140px]">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase px-1 pb-1 border-b border-border">Assign role</p>
          {RACI_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => { onSelect(role); setOpen(false); }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-80 ${currentRole === role ? RACI_COLORS[role] + " ring-1 ring-inset ring-current" : "hover:bg-muted"}`}
            >
              <span className={`w-5 h-5 rounded font-bold border flex items-center justify-center text-[10px] ${RACI_COLORS[role]}`}>{RACI_LETTERS[role]}</span>
              <span className="capitalize font-normal">{role}</span>
            </button>
          ))}
          {currentRole && (
            <button
              onClick={() => { onClear(); setOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors mt-0.5 border-t border-border pt-1.5"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RaciTab({
  projectId, milestones, raciRows, canEdit, onUpsert, onDelete,
}: {
  projectId: number;
  milestones: SpmoMilestoneWithEvidence[];
  raciRows: SpmoRaci[];
  canEdit: boolean;
  onUpsert: (data: Partial<SpmoRaci>) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const [newPersonName, setNewPersonName] = useState("");

  const people = Array.from(new Set(raciRows.map((r) => r.userId))).map((uid) => ({
    userId: uid,
    userName: raciRows.find((r) => r.userId === uid)?.userName ?? uid,
  }));

  const handleAddPerson = () => {
    if (!newPersonName.trim()) return;
    const userId = `person_${newPersonName.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const firstMs = milestones[0];
    if (firstMs) {
      onUpsert({ projectId, milestoneId: firstMs.id, userId, userName: newPersonName.trim(), role: "informed" });
    }
    setNewPersonName("");
  };

  const getCell = (msId: number, userId: string) =>
    raciRows.find((r) => r.milestoneId === msId && r.userId === userId);

  const handleSelect = (msId: number, userId: string, userName: string, role: SpmoRaci["role"]) => {
    onUpsert({ projectId, milestoneId: msId, userId, userName, role });
  };

  const handleClear = (cell: SpmoRaci) => onDelete(cell.id);

  if (milestones.length === 0) return (
    <Card className="text-center py-14">
      <Grid3X3 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
      <h3 className="font-bold">No milestones yet</h3>
      <p className="text-sm text-muted-foreground mt-1">Add milestones first to build the RACI matrix.</p>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {RACI_ROLES.map((role) => (
            <span key={role} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold ${RACI_COLORS[role]}`}>
              <span className="font-bold">{RACI_LETTERS[role]}</span>
              <span className="font-normal opacity-80 capitalize">{role}</span>
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddPerson()}
              placeholder="Add team member…"
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
            />
            <button
              onClick={handleAddPerson}
              disabled={!newPersonName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        )}
      </div>

      {people.length === 0 ? (
        <Card className="text-center py-10">
          <Grid3X3 className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">Type a name above and press <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-xs">Enter</kbd> to add the first team member.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Milestone</th>
                {people.map((p) => (
                  <th key={p.userId} className="px-3 py-2.5 text-center font-semibold text-sm min-w-[90px]">{p.userName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {milestones.map((ms, i) => {
                const hasMissingA = !raciRows.find((r) => r.milestoneId === ms.id && r.role === "accountable");
                return (
                  <tr key={ms.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-muted/20"} ${hasMissingA && people.length > 0 ? "border-l-2 border-l-amber-400" : ""}`}>
                    <td className="px-4 py-3 font-medium text-sm">
                      <div className="flex items-center gap-2">
                        {ms.name}
                        {hasMissingA && people.length > 0 && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-bold">No A</span>
                        )}
                      </div>
                    </td>
                    {people.map((p) => {
                      const cell = getCell(ms.id, p.userId);
                      return (
                        <td key={p.userId} className="px-3 py-2 text-center">
                          <RaciCellPopover
                            cell={cell}
                            canEdit={canEdit}
                            onSelect={(role) => handleSelect(ms.id, p.userId, p.userName!, role)}
                            onClear={() => cell && handleClear(cell)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {people.length > 0 && milestones.some((ms) => !raciRows.find((r) => r.milestoneId === ms.id && r.role === "accountable")) && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> Some milestones are missing an Accountable (A) person.
        </p>
      )}
    </div>
  );
}

// ─── Actions Tab ───────────────────────────────────────────────────────────────

const ACTION_PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-500 bg-gray-50 border-gray-200",
  medium: "text-blue-600 bg-blue-50 border-blue-200",
  high: "text-amber-600 bg-amber-50 border-amber-200",
  urgent: "text-red-600 bg-red-50 border-red-200",
};
const ACTION_STATUS_COLORS: Record<string, string> = {
  open: "text-foreground bg-background border-border",
  in_progress: "text-blue-700 bg-blue-50 border-blue-200",
  done: "text-green-700 bg-green-50 border-green-200",
  cancelled: "text-gray-500 bg-gray-50 border-gray-200",
};

type ActionEditState = { title: string; assigneeName: string; dueDate: string; priority: string; status: string; milestoneId: string };

function ActionRow({
  action, milestones, canEdit, onUpdate, onDelete,
}: {
  action: SpmoAction;
  milestones: SpmoMilestoneWithEvidence[];
  canEdit: boolean;
  onUpdate: (id: number, data: Partial<SpmoAction>) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ActionEditState>({
    title: action.title,
    assigneeName: action.assigneeName ?? "",
    dueDate: action.dueDate ?? "",
    priority: action.priority,
    status: action.status,
    milestoneId: action.milestoneId ? String(action.milestoneId) : "",
  });
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = action.dueDate && action.dueDate < today && action.status !== "done" && action.status !== "cancelled";
  const f = <K extends keyof ActionEditState>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((v) => ({ ...v, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(action.id, {
        title: form.title,
        assigneeName: form.assigneeName || undefined,
        dueDate: form.dueDate || undefined,
        priority: form.priority as SpmoAction["priority"],
        status: form.status as SpmoAction["status"],
        milestoneId: form.milestoneId ? parseInt(form.milestoneId) : undefined,
      });
      setEditing(false);
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <Card className="p-4 ring-2 ring-primary/20 border-primary/30 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Title</label>
            <input autoFocus value={form.title} onChange={f("title")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Assignee</label>
            <input value={form.assigneeName} onChange={f("assigneeName")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Name" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Due Date</label>
            <input type="date" value={form.dueDate} onChange={f("dueDate")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Priority</label>
            <select value={form.priority} onChange={f("priority")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
              {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Status</label>
            <select value={form.status} onChange={f("status")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
              {["open", "in_progress", "done", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Milestone</label>
            <select value={form.milestoneId} onChange={f("milestoneId")} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">None</option>
              {milestones.map((ms) => <option key={ms.id} value={ms.id}>{ms.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50 hover:-translate-y-0.5 transition-transform">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
          <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-3 flex items-center gap-3 group transition-all hover:shadow-md ${action.status === "done" ? "opacity-60" : ""}`}>
      <select
        value={action.status}
        onChange={(e) => canEdit && onUpdate(action.id, { status: e.target.value as SpmoAction["status"] })}
        disabled={!canEdit}
        className={`text-[10px] font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none shrink-0 ${ACTION_STATUS_COLORS[action.status]}`}
        title="Change status"
      >
        {["open", "in_progress", "done", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
      </select>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${action.status === "done" ? "line-through text-muted-foreground" : ""}`}>{action.title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${ACTION_PRIORITY_COLORS[action.priority]}`}>{action.priority}</span>
        </div>
        <div className="flex flex-wrap gap-3 mt-0.5 text-[11px] text-muted-foreground">
          {action.assigneeName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{action.assigneeName}</span>}
          {action.dueDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive font-semibold" : ""}`}>
              <Calendar className="w-3 h-3" />{isOverdue ? "⚠ " : ""}{new Date(action.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(action.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </Card>
  );
}

function QuickAddAction({
  projectId, milestones, onCreate,
}: {
  projectId: number;
  milestones: SpmoMilestoneWithEvidence[];
  onCreate: (data: Partial<SpmoAction>) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        title: title.trim(),
        assigneeName: assigneeName || undefined,
        dueDate: dueDate || undefined,
        priority: priority as SpmoAction["priority"],
      });
      setTitle("");
      setAssigneeName("");
      setDueDate("");
      setPriority("medium");
      setExpanded(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="border border-dashed border-border rounded-xl p-3 bg-muted/20 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (e.target.value) setExpanded(true); }}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSubmit(); if (e.key === "Escape") { setExpanded(false); setTitle(""); } }}
          placeholder="Add an action item… (press Enter to save)"
          className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/60"
        />
        {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <input
            value={assigneeName}
            onChange={(e) => setAssigneeName(e.target.value)}
            placeholder="Assignee"
            className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function ActionsTab({
  projectId, milestones, actions, canEdit, currentUser, onCreate, onUpdate, onDelete,
}: {
  projectId: number;
  milestones: SpmoMilestoneWithEvidence[];
  actions: SpmoAction[];
  canEdit: boolean;
  currentUser: { id: string; firstName?: string | null; lastName?: string | null } | undefined | null;
  onCreate: (data: Partial<SpmoAction>) => Promise<unknown>;
  onUpdate: (id: number, data: Partial<SpmoAction>) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const openCount = actions.filter((a) => a.status !== "done" && a.status !== "cancelled").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-1">
        <p className="text-sm text-muted-foreground">
          {openCount} open action{openCount !== 1 ? "s" : ""}
          {actions.length > openCount && <span className="ml-1.5 text-xs">· {actions.length - openCount} closed</span>}
        </p>
        <p className="text-xs text-muted-foreground">Hover a row to edit · Change status inline</p>
      </div>

      {actions.length === 0 && (
        <Card className="text-center py-10">
          <ListTodo className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">No action items yet. Use the box below to add one.</p>
        </Card>
      )}

      {actions.map((action) => (
        <ActionRow
          key={action.id}
          action={action}
          milestones={milestones}
          canEdit={canEdit}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}

      {canEdit && (
        <QuickAddAction projectId={projectId} milestones={milestones} onCreate={onCreate} />
      )}
    </div>
  );
}

// ─── Documents Tab ─────────────────────────────────────────────────────────────

const DOC_CATEGORY_LABELS: Record<string, string> = {
  business_case: "Business Case", charter: "Charter", plan: "Plan",
  report: "Report", template: "Template", contract: "Contract", other: "Other",
};

function DocumentsTab({
  projectId, documents, canEdit, currentUser, onInvalidate,
}: {
  projectId: number;
  documents: SpmoDocument[];
  canEdit: boolean;
  currentUser: { id: string; firstName?: string | null; lastName?: string | null } | undefined | null;
  onInvalidate: () => void;
}) {
  const { toast } = useToast();
  const createDoc = useCreateSpmoDocument();
  const deleteDoc = useDeleteSpmoDocument();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", category: "other", description: "", tags: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (!file) { toast({ title: "Please select a file", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const objectPath = `documents/${projectId}/${Date.now()}_${file.name}`;
      await createDoc.mutateAsync({
        projectId,
        title: form.title,
        category: form.category as SpmoDocument["category"],
        description: form.description || undefined,
        fileName: file.name,
        contentType: file.type,
        objectPath,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      } as SpmoDocument);
      toast({ title: "Document added" });
      onInvalidate();
      setFile(null);
      setForm({ title: "", category: "other", description: "", tags: "" });
      setShowForm(false);
    } catch {
      toast({ title: "Failed to save document", variant: "destructive" });
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
        {canEdit && (
          <button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Document
          </button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 space-y-3 border-primary/20">
          <h4 className="text-sm font-semibold">Add Document</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Document title" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Tags (comma-separated)</label>
              <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Q1, finance" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">File</label>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-dashed border-border hover:border-primary transition-colors text-muted-foreground hover:text-foreground">
                <Upload className="w-4 h-4" />
                {file ? file.name : "Choose file…"}
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleUpload} disabled={uploading} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:-translate-y-0.5 transition-transform disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </Card>
      )}

      {documents.length === 0 && !showForm ? (
        <Card className="text-center py-14">
          <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="font-bold">No documents yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Upload project documents like charters, plans, and reports.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{doc.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground font-medium">{DOC_CATEGORY_LABELS[doc.category]}</span>
                  <span className="text-[10px] text-muted-foreground">v{doc.version}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-0.5 text-[11px] text-muted-foreground">
                  <span>{doc.fileName}</span>
                  {doc.uploadedByName && <span>By: {doc.uploadedByName}</span>}
                  <span>{new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {doc.tags.map((tag) => <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tag}</span>)}
                  </div>
                )}
              </div>
              {canEdit && (
                <button onClick={async () => { await deleteDoc.mutateAsync(doc.id); onInvalidate(); }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
