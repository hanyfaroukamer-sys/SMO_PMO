import { useState, useRef, useEffect } from "react";
import { UserMentionInput } from "@/components/user-mention-input";
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
  useGetSpmaProjectWeeklyReport,
  useUpsertSpmaProjectWeeklyReport,
  useGetSpmaProjectWeeklyReportHistory,
  useSetBulkSpmoMilestoneWeights,
  type SpmoProjectWithProgress,
  type CreateSpmoProjectRequest,
  type UpdateSpmoProjectRequest,
  type CreateSpmoMilestoneRequest,
  type SpmoEvidence,
  type SpmoMilestoneWithEvidence,
  type SpmoHealthStatus,
  type SpmoStatusResult,
} from "@workspace/api-client-react";
import { useResolveProjectDependencies, useListDependencies, useDeleteDependency } from "@/hooks/use-dependencies";
import { AddDependencyModal } from "@/components/add-dependency-modal";
import { GanttChart } from "@/components/gantt-chart";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronUp, ChevronRight, CheckCircle2, Send, X, XCircle, FileText, FileImage, FileArchive, FileSpreadsheet, Upload, AlertCircle, RotateCcw, LayoutList, GanttChartSquare, Lock, GitMerge, ShieldAlert, Telescope, Download, Calendar } from "lucide-react";
import { exportToXlsx, exportMultiSheetXlsx } from "@/lib/export";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Link } from "wouter";

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
      const urlRes = await fetch("/api/spmo/uploads/request-url", {
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
        <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 border-b border-warning/20 text-warning text-xs font-bold">
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
                    href={`/api/storage/objects${ev.objectPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
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
              fetch(`/api/spmo/milestones/${milestone.id}`, {
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

function calcPlannedProgress(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.max((end.getTime() - start.getTime()) / 86_400_000, 1);
  const elapsedDays = Math.max((today.getTime() - start.getTime()) / 86_400_000, 0);
  return Math.min(Math.round((elapsedDays / totalDays) * 100), 100);
}

type ProjectForm = {
  name: string;
  projectCode: string;
  description: string;
  initiativeId: string;
  departmentId: string;
  ownerId: string;
  ownerName: string;
  weight: string;
  status: string;
  budget: string;
  startDate: string;
  targetDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
};

const emptyProject = (): ProjectForm => ({
  name: "", projectCode: "", description: "", initiativeId: "", departmentId: "", ownerId: "", ownerName: "",
  weight: "50", status: "active", budget: "", startDate: "", targetDate: "", plannedStartDate: "", plannedEndDate: "",
});

function classifyProjectStatus(p: SpmoProjectWithProgress): "on_track" | "at_risk" | "delayed" | "completed" | "not_started" | "on_hold" {
  if (p.status === "on_hold") return "on_hold";
  if (p.status === "completed" || p.status === "cancelled") return "completed";
  const cs = p.computedStatus?.status;
  if (cs === "delayed") return "delayed";
  if (cs === "at_risk") return "at_risk";
  if (cs === "completed") return "completed";
  if ((p.progress ?? 0) === 0) return "not_started";
  return "on_track";
}

export default function Projects() {
  const { data, isLoading } = useListSpmoProjects();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: pillarsData } = useListSpmoPillars();
  const { data: departmentsData } = useListSpmoDepartments();
  const isAdmin = useIsAdmin();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyProject());
  const [siblingWeightEdits, setSiblingWeightEdits] = useState<Record<number, string>>({});
  const [savingSiblingId, setSavingSiblingId] = useState<number | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "gantt">("list");
  const [pillarFilter, setPillarFilter] = useState<number | "all">("all");
  const [departmentFilter, setDepartmentFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "on_track" | "at_risk" | "delayed" | "completed" | "not_started" | "on_hold">("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("");
  const [expandedPillars, setExpandedPillars] = useState<Set<number>>(new Set());
  const [expandedInitiatives, setExpandedInitiatives] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const qc = useQueryClient();
  const [globalAutoWeightLoading, setGlobalAutoWeightLoading] = useState(false);
  const didDeepLink = useRef(false);

  async function handleGlobalAutoWeight() {
    if (!confirm("Reset ALL weights across the entire programme to auto-calculated values?")) return;
    setGlobalAutoWeightLoading(true);
    try {
      const res = await fetch("/api/spmo/admin/auto-weight-all", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Auto-weight complete", description: data.message });
        qc.invalidateQueries();
      } else {
        toast({ variant: "destructive", title: "Failed", description: data.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Network error" });
    } finally {
      setGlobalAutoWeightLoading(false);
    }
  }
  const deepLinkMilestoneId = useRef<number | null>(null);

  useEffect(() => {
    if (didDeepLink.current || !data?.projects?.length || !initiativesData?.initiatives || !pillarsData?.pillars) return;
    const params = new URLSearchParams(window.location.search);
    const rawId = params.get("project");
    if (!rawId) return;
    const targetId = parseInt(rawId, 10);
    if (isNaN(targetId)) return;
    const project = data.projects.find((p) => p.id === targetId);
    if (!project) return;
    didDeepLink.current = true;
    const rawMilestoneId = params.get("milestone");
    if (rawMilestoneId) {
      const mid = parseInt(rawMilestoneId, 10);
      if (!isNaN(mid)) deepLinkMilestoneId.current = mid;
    }
    // Expand the pillar and initiative that contain this project
    const initiative = initiativesData.initiatives.find((i) => i.id === project.initiativeId);
    if (initiative) {
      setExpandedInitiatives((prev) => new Set([...prev, initiative.id]));
      const pillar = pillarsData.pillars.find((p) => p.id === initiative.pillarId);
      if (pillar) setExpandedPillars((prev) => new Set([...prev, pillar.id]));
    }
    setExpandedProject(targetId);
    setTimeout(() => {
      const el = document.getElementById(`project-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }, [data, initiativesData, pillarsData]);

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
    setSiblingWeightEdits({});
    setModalOpen(true);
  }

  function openEdit(project: SpmoProjectWithProgress) {
    setEditId(project.id);
    setForm({
      name: project.name,
      projectCode: project.projectCode ?? "",
      description: project.description ?? "",
      initiativeId: String(project.initiativeId),
      departmentId: project.departmentId != null ? String(project.departmentId) : "",
      ownerId: project.ownerId ?? "",
      ownerName: project.ownerName ?? "",
      weight: String(Math.round((project as any).effectiveWeight ?? project.weight ?? 0)),
      status: project.status,
      budget: String(project.budget ?? ""),
      startDate: project.startDate ?? "",
      targetDate: project.targetDate ?? "",
      plannedStartDate: (project as any).plannedStartDate ?? "",
      plannedEndDate: (project as any).plannedEndDate ?? "",
    });
    // Pre-populate sibling weights with effectiveWeight
    const siblings = (data?.projects ?? []).filter(p => p.initiativeId === project.initiativeId && p.id !== project.id);
    const edits: Record<number, string> = {};
    for (const s of siblings) {
      edits[s.id] = String(Math.round((s as any).effectiveWeight ?? s.weight ?? 0));
    }
    setSiblingWeightEdits(edits);
    setModalOpen(true);
  }

  async function saveSiblingProjectWeight(siblingId: number, val: string) {
    const w = Math.round(parseFloat(val));
    if (isNaN(w) || w < 0 || w > 100) return;
    const originalSibling = (data?.projects ?? []).find(p => p.id === siblingId)?.weight;
    if (w === originalSibling) return;
    setSavingSiblingId(siblingId);
    try {
      if (editId !== null) {
        const mainOriginal = (data?.projects ?? []).find(p => p.id === editId)?.weight;
        const mainNew = Math.round(parseFloat(form.weight) || 0);
        if (mainOriginal !== undefined && mainNew !== mainOriginal) {
          await updateMutation.mutateAsync({ id: editId, data: { weight: mainNew } });
          invalidate();
        }
      }
      await updateMutation.mutateAsync({ id: siblingId, data: { weight: w } });
      setSiblingWeightEdits(prev => { const next = { ...prev }; delete next[siblingId]; return next; });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update sibling weight." });
    } finally {
      setSavingSiblingId(null);
    }
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
    if (projectWeightError) return; // Block submit when weights exceed 100%
    const commonFields = {
      name: form.name,
      projectCode: form.projectCode || null,
      description: form.description || undefined,
      initiativeId: parseInt(form.initiativeId),
      departmentId: form.departmentId ? parseInt(form.departmentId) : null,
      ownerId: form.ownerId || "user",
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
        plannedStartDate: form.plannedStartDate || undefined,
        plannedEndDate: form.plannedEndDate || undefined,
      } as any;
      updateMutation.mutate({ id: editId, data: updatePayload }, {
        onSuccess: () => {
          toast({ title: "Updated" });
          setModalOpen(false);
          invalidate();
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to update." }),
      });
    } else {
      const createPayload: CreateSpmoProjectRequest = {
        ...commonFields,
        startDate: form.startDate,
        targetDate: form.targetDate,
        plannedStartDate: form.plannedStartDate || form.startDate,
        plannedEndDate: form.plannedEndDate || form.targetDate,
      } as any;
      createMutation.mutate({ data: createPayload }, {
        onSuccess: () => {
          toast({ title: "Created", description: `"${form.name}" created.` });
          setModalOpen(false);
          invalidate();
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to create." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const selectedInitiativeId = parseInt(form.initiativeId) || 0;
  const siblingProjects = (data?.projects ?? []).filter(p => p.initiativeId === selectedInitiativeId && p.id !== editId);
  const siblingProjectWeight = siblingProjects.reduce((s, p) => {
    const editVal = siblingWeightEdits[p.id];
    if (editVal !== undefined) return s + (parseFloat(editVal) || 0);
    return s + ((p as any).effectiveWeight ?? p.weight ?? 0);
  }, 0);
  const projectWeightTotal = siblingProjectWeight + (parseFloat(form.weight) || 0);
  const projectWeightError = !!form.initiativeId && projectWeightTotal > 100;
  const projectWeightUnder = !!form.initiativeId && !projectWeightError && projectWeightTotal > 0 && projectWeightTotal < 100;

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const pillars = pillarsData?.pillars ?? [];
  const initiatives = initiativesData?.initiatives ?? [];
  const departments = departmentsData?.departments ?? [];
  const projects = data?.projects ?? [];

  const getPillarColor = (pillarId: number) =>
    pillars.find((p) => p.id === pillarId)?.color ?? "#6366f1";

  const initiativeCodeMap = new Map(initiatives.map((ini, idx) => [ini.id, ini.initiativeCode ?? String(idx + 1).padStart(2, "0")]));

  const togglePillar = (id: number) =>
    setExpandedPillars((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleInitiative = (id: number) =>
    setExpandedInitiatives((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

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
          {isAdmin && (
            <button
              onClick={handleGlobalAutoWeight}
              disabled={globalAutoWeightLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-40"
              title="Reset all weights across entire programme"
            >
              {globalAutoWeightLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Global Auto-Weight
            </button>
          )}
          <button
            onClick={async () => {
              const projectRows = projects.map((p) => ({
                Name: p.name,
                Status: p.healthStatus,
                Progress: Math.round(p.progress) + "%",
                "Budget (SAR)": p.budget ?? 0,
                "Spent (SAR)": p.budgetSpent ?? 0,
                "Start Date": p.startDate ?? "",
                "End Date": p.targetDate ?? "",
                Owner: p.ownerName ?? "",
              }));
              try {
                const res = await fetch("/api/spmo/milestones/all", { credentials: "include" });
                const json = await res.json();
                const items = (json.items ?? []) as Array<{
                  milestone: { name: string; progress: number; status: string; dueDate?: string | null; effortDays?: number | null };
                  project: { name: string };
                  initiative: { name: string };
                  pillar: { name: string };
                }>;
                const milestoneRows = items.map((item) => ({
                  "Milestone Name": item.milestone.name,
                  "Project": item.project.name,
                  "Initiative": item.initiative.name,
                  "Pillar/Enabler": item.pillar.name,
                  "Progress": Math.round(item.milestone.progress) + "%",
                  "Status": item.milestone.status,
                  "Due Date": item.milestone.dueDate ?? "",
                  "Effort (days)": item.milestone.effortDays ?? "",
                }));
                exportMultiSheetXlsx(
                  [
                    { name: "Projects", data: projectRows },
                    { name: "Milestones", data: milestoneRows },
                  ],
                  "projects-milestones-export",
                );
              } catch {
                exportToXlsx(projectRows, "projects-export");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          {isAdmin && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> + Project
            </button>
          )}
        </div>
      </PageHeader>

      {/* Filter bar — shown in both list and Gantt views */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pillar / Enabler</label>
          <select
            className={`${selectClass} py-1.5 text-xs w-44`}
            value={pillarFilter === "all" ? "all" : String(pillarFilter)}
            onChange={(e) => setPillarFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All Pillars & Enablers</option>
            {(pillars as Array<{id: number; name: string}>).map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </div>
        {departments.length > 0 && (
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
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
          <select
            className={`${selectClass} py-1.5 text-xs w-44`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All Statuses</option>
            <option value="on_track">On Track</option>
            <option value="at_risk">Risk of Delay</option>
            <option value="delayed">Delayed</option>
            <option value="completed">Completed</option>
            <option value="not_started">Not Started</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phase</label>
          <select
            className={`${selectClass} py-1.5 text-xs w-44`}
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
          >
            <option value="">All Phases</option>
            <option value="planning">Planning</option>
            <option value="tendering">Tendering</option>
            <option value="execution">Execution</option>
            <option value="closure">Closure</option>
            <option value="completed">Completed</option>
            <option value="not_started">Not Started</option>
          </select>
        </div>
        {viewMode === "gantt" && (
          <span className="ml-auto text-xs text-muted-foreground">
            Showing projects with milestone markers · hover bars/diamonds for details
          </span>
        )}
      </div>

      {/* Gantt view */}
      {viewMode === "gantt" && (
        <GanttChart pillarFilter={pillarFilter} departmentFilter={departmentFilter} />
      )}

      {/* List view — Pillar/Enabler → Initiative → Project hierarchy */}
      {viewMode === "list" && <div className="space-y-5">
        {pillars
          .filter((pillar) => pillarFilter === "all" || pillar.id === pillarFilter)
          .map((pillar) => {
            const isPillarExpanded = expandedPillars.has(pillar.id);
            const pillarColor = pillar.color ?? "#6366f1";
            const pillarInitiatives = initiatives.filter((i) => i.pillarId === pillar.id);

            // Count visible projects in this pillar (respecting dept/status filters)
            const pillarProjectCount = projects.filter((p) => {
              const init = initiatives.find((i) => i.id === p.initiativeId);
              return (
                init?.pillarId === pillar.id &&
                (departmentFilter === "all" || p.departmentId === departmentFilter) &&
                (statusFilter === "all" || classifyProjectStatus(p) === statusFilter) &&
                (!phaseFilter || (p as any).currentPhase === phaseFilter)
              );
            }).length;

            if (pillarProjectCount === 0 && (departmentFilter !== "all" || statusFilter !== "all" || phaseFilter)) return null;

            return (
              <div key={pillar.id} className="rounded-2xl border border-border overflow-hidden shadow-sm">
                {/* Pillar header — clickable */}
                <button
                  onClick={() => togglePillar(pillar.id)}
                  className="w-full px-6 py-4 flex items-center gap-4 bg-card border-b border-border text-left hover:bg-secondary/20 transition-colors focus:outline-none"
                  style={{ borderLeft: `4px solid ${pillarColor}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: pillarColor }}>{(pillar as { pillarType?: string }).pillarType === "enabler" ? "Enabler" : "Pillar"}</div>
                    <h3 className="font-bold text-lg">{pillar.name}</h3>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                      {pillarInitiatives.length} initiative{pillarInitiatives.length !== 1 ? "s" : ""}
                    </span>
                    <ChevronDown
                      className="w-4 h-4 text-muted-foreground transition-transform duration-200"
                      style={{ transform: isPillarExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                    />
                  </div>
                </button>

                {/* Initiatives — shown when pillar expanded */}
                {isPillarExpanded && (
                  <div className="divide-y divide-border/40 bg-secondary/10">
                    {pillarInitiatives.map((initiative) => {
                      const isInitExpanded = expandedInitiatives.has(initiative.id);
                      const initProjects = projects.filter((p) =>
                        p.initiativeId === initiative.id &&
                        (departmentFilter === "all" || p.departmentId === departmentFilter) &&
                        (statusFilter === "all" || classifyProjectStatus(p) === statusFilter) &&
                        (!phaseFilter || (p as any).currentPhase === phaseFilter)
                      );
                      if (initProjects.length === 0 && (departmentFilter !== "all" || statusFilter !== "all" || phaseFilter)) return null;

                      const initProgress = initiative.progress ?? 0;
                      const initPlanned = calcPlannedProgress(initiative.startDate, initiative.targetDate);

                      return (
                        <div key={initiative.id}>
                          {/* Initiative row — clickable */}
                          <button
                            onClick={() => toggleInitiative(initiative.id)}
                            className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-secondary/30 transition-colors text-left focus:outline-none"
                          >
                            <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: pillarColor }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">
                                  Initiative {initiativeCodeMap.get(initiative.id) ?? "??"}: {initiative.name}
                                </span>
                                <ComputedStatusBadge cs={initiative.computedStatus} />
                                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                                  {initProjects.length} project{initProjects.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                              {initPlanned > 0 ? (
                                <div className="mt-1.5 relative h-1 bg-secondary rounded-full overflow-hidden w-full max-w-xs">
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${Math.min(100, initProgress)}%`, backgroundColor: pillarColor }}
                                  />
                                  <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-warning/80"
                                    style={{ left: `${Math.min(100, initPlanned)}%`, transform: "translateX(-50%)" }}
                                  />
                                </div>
                              ) : (
                                <div className="mt-1.5 h-1 bg-secondary rounded-full overflow-hidden w-full max-w-xs">
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${Math.min(100, initProgress)}%`, backgroundColor: pillarColor }}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <div className="text-sm font-bold" style={{ color: pillarColor }}>{Math.round(initProgress)}%</div>
                                {initPlanned > 0 && <div className="text-[10px] text-muted-foreground">plan {initPlanned}%</div>}
                              </div>
                              <ChevronDown
                                className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200"
                                style={{ transform: isInitExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                              />
                            </div>
                          </button>

                          {/* Projects — shown when initiative expanded */}
                          {isInitExpanded && (
                            <div className="divide-y divide-border/50 bg-card border-t border-border/40">
                              {initProjects.length === 0 ? (
                                <div className="px-10 py-4 text-xs text-muted-foreground">No projects match the current filters.</div>
                              ) : initProjects.map((proj) => (
                                <ProjectRow
                                  key={proj.id}
                                  project={proj}
                                  pillarColor={pillarColor}
                                  expanded={expandedProject === proj.id}
                                  onToggle={() => setExpandedProject(expandedProject === proj.id ? null : proj.id)}
                                  onEdit={() => openEdit(proj)}
                                  onDelete={() => handleDelete(proj.id, proj.name)}
                                  onStatusOverride={(newStatus) => {
                                    updateMutation.mutate({ id: proj.id, data: { status: newStatus as "active" | "on_hold" | "completed" | "cancelled" } }, {
                                      onSuccess: () => { toast({ title: newStatus === "on_hold" ? "Project put on hold" : "Project resumed" }); invalidate(); },
                                      onError: () => toast({ variant: "destructive", title: "Failed to update status" }),
                                    });
                                  }}
                                  isAdmin={isAdmin}
                                  targetMilestoneId={expandedProject === proj.id ? deepLinkMilestoneId.current : null}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {pillarInitiatives.length === 0 && (
                      <div className="px-6 py-3 text-xs text-muted-foreground">No initiatives linked to this pillar.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {/* Projects not in any pillar/initiative */}
        {(() => {
          const orphans = projects.filter((p) =>
            !initiatives.some((i) => i.id === p.initiativeId) &&
            (departmentFilter === "all" || p.departmentId === departmentFilter) &&
            (statusFilter === "all" || classifyProjectStatus(p) === statusFilter) &&
            (!phaseFilter || (p as any).currentPhase === phaseFilter)
          );
          return orphans.map((proj) => (
            <Card key={proj.id} noPadding className="overflow-hidden">
              <ProjectRow
                project={proj}
                pillarColor="#6366f1"
                expanded={expandedProject === proj.id}
                onToggle={() => setExpandedProject(expandedProject === proj.id ? null : proj.id)}
                onEdit={() => openEdit(proj)}
                onDelete={() => handleDelete(proj.id, proj.name)}
                onStatusOverride={(newStatus) => {
                  updateMutation.mutate({ id: proj.id, data: { status: newStatus as "active" | "on_hold" | "completed" | "cancelled" } }, {
                    onSuccess: () => { toast({ title: newStatus === "on_hold" ? "Project put on hold" : "Project resumed" }); invalidate(); },
                    onError: () => toast({ variant: "destructive", title: "Failed to update status" }),
                  });
                }}
                isAdmin={isAdmin}
                targetMilestoneId={expandedProject === proj.id ? deepLinkMilestoneId.current : null}
              />
            </Card>
          ));
        })()}

        {projects.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            No projects yet. Click "New Project" to create one.
          </Card>
        )}
      </div>}

      {/* Project Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Project" : "New Project"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <FormField label="Project Name" required>
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Citizen Identity Module" required />
              </FormField>
            </div>
            <FormField label="Project Code">
              <input
                className={inputClass}
                value={form.projectCode}
                onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
                placeholder="e.g. P01"
              />
            </FormField>
          </div>

          <FormField label="Initiative" required>
            <select className={selectClass} value={form.initiativeId} onChange={(e) => setForm({ ...form, initiativeId: e.target.value })} required>
              <option value="">Select an initiative...</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>Initiative {initiativeCodeMap.get(i.id) ?? "??"}: {i.name}</option>
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
              <UserMentionInput
                value={form.ownerName}
                onChange={(name, userId) => setForm({ ...form, ownerName: name, ...(userId ? { ownerId: userId } : {}) })}
                placeholder="Type @ to search users…"
                className={inputClass}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Budget (SAR)">
              <input type="number" className={inputClass} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0" min="0" />
            </FormField>
            <FormField label={`Weight: ${form.weight}%`}>
              <input type="range" min="0" max="100" className="w-full accent-primary mt-2" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
              <div className={`flex items-center justify-between text-[11px] mt-1.5 min-h-[1rem] tabular-nums ${projectWeightError ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                {form.initiativeId ? (
                  <>
                    <span>Others: {Math.round(siblingProjectWeight)}% + This: {parseFloat(form.weight) || 0}%</span>
                    <span className="w-20 text-right shrink-0">{projectWeightError ? `⚠ Total ${Math.round(projectWeightTotal)}%` : `${Math.max(0, Math.round(100 - siblingProjectWeight))}% left`}</span>
                  </>
                ) : <span className="italic">Select an initiative to see weight breakdown</span>}
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Planned Start Date">
              <input type="date" className={inputClass} value={form.plannedStartDate} onChange={(e) => setForm({ ...form, plannedStartDate: e.target.value })} />
            </FormField>
            <FormField label="Planned End Date">
              <input type="date" className={inputClass} value={form.plannedEndDate} onChange={(e) => setForm({ ...form, plannedEndDate: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Actual Start Date">
              <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </FormField>
            <FormField label="Actual End Date">
              <input type="date" className={inputClass} value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </FormField>
          </div>

          {projectWeightError && (
            <p className="text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              ⚠ Project weights in this initiative cannot exceed 100%. Reduce this weight or adjust siblings first.
            </p>
          )}
          {projectWeightUnder && (
            <div className="text-xs bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5 space-y-2">
              <p className="font-semibold text-warning">⚠ Weights sum to {Math.round(projectWeightTotal)}% — must reach exactly 100% before saving.</p>
              <p className="text-muted-foreground">Adjust another project below to fill the remaining <span className="font-bold text-foreground">{100 - Math.round(projectWeightTotal)}%</span>:</p>
              <ul className="divide-y divide-border/40">
                {siblingProjects.map(p => {
                  const localVal = siblingWeightEdits[p.id] ?? String(Math.round((p as any).effectiveWeight ?? p.weight ?? 0));
                  const isSavingThis = savingSiblingId === p.id;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="text-foreground truncate flex-1">{p.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number" min="0" max="100"
                          value={localVal}
                          onChange={e => setSiblingWeightEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onBlur={() => saveSiblingProjectWeight(p.id, localVal)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveSiblingProjectWeight(p.id, localVal); } }}
                          disabled={isSavingThis}
                          className="w-14 text-right px-1.5 py-0.5 bg-background border border-border rounded text-xs font-mono disabled:opacity-50"
                        />
                        <span className="text-muted-foreground">%</span>
                        {isSavingThis && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <FormActions loading={isSaving} disabled={projectWeightError || projectWeightUnder} label={editId ? "Update Project" : "Create Project"} onCancel={() => setModalOpen(false)} />
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
  onStatusOverride,
  isAdmin,
  targetMilestoneId,
}: {
  project: SpmoProjectWithProgress;
  pillarColor: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusOverride: (newStatus: string) => void;
  isAdmin: boolean;
  targetMilestoneId?: number | null;
}) {
  const isOnHold = project.status === "on_hold";

  return (
    <div id={`project-${project.id}`}>
      <div
        className={`flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors ${isOnHold ? "bg-orange-50/40 hover:bg-orange-50/60" : "hover:bg-secondary/20"}`}
        onClick={onToggle}
      >
        <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: isOnHold ? "#f97316" : pillarColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1 mb-1">
            <h4 className="font-bold text-base">
              {project.projectCode && (
                <span className="text-muted-foreground font-mono mr-1.5">{project.projectCode}:</span>
              )}
              {project.name}
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              {isOnHold ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200">
                  ⏸ On Hold
                </span>
              ) : (
                <ComputedStatusBadge cs={project.computedStatus} />
              )}
              {(project as any).currentPhase && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                  (project as any).currentPhase === "execution" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  (project as any).currentPhase === "planning" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  (project as any).currentPhase === "tendering" ? "bg-purple-50 text-purple-700 border-purple-200" :
                  (project as any).currentPhase === "closure" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  (project as any).currentPhase === "completed" ? "bg-green-50 text-green-700 border-green-200" :
                  "bg-gray-50 text-gray-600 border-gray-200"
                }`}>
                  {((project as any).currentPhase ?? "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
              )}
              {(project as any).effectiveWeight > 0 && (
                <span className="text-xs bg-secondary border border-border px-2 py-0.5 rounded text-muted-foreground" title={`Weight source: ${(project as any).weightSource ?? "auto"}`}>
                  {Math.round((project as any).effectiveWeight)}% weight
                </span>
              )}
            </div>
          </div>
          <div className="w-52">
            {(() => {
              const planned = calcPlannedProgress(project.startDate, project.targetDate);
              return (
                <>
                  <div className="flex justify-between text-[10px] mb-0.5 text-muted-foreground">
                    <span>Actual <span className="font-semibold text-foreground">{Math.round(project.progress ?? 0)}%</span></span>
                    {planned > 0 && <span>Plan <span className="font-semibold text-foreground">{planned}%</span></span>}
                  </div>
                  <ProgressBar progress={project.progress ?? 0} planned={planned} showLabel={false} />
                </>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {(project.startDate || project.targetDate) && (
            <div className="hidden lg:block text-right">
              <div className="text-xs text-muted-foreground">Dates</div>
              <div className="text-xs font-mono text-foreground whitespace-nowrap">
                {project.startDate ? new Date(project.startDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}
                {" – "}
                {project.targetDate ? new Date(project.targetDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}
              </div>
            </div>
          )}
          <div className="hidden md:block text-right">
            <div className="text-xs text-muted-foreground">Budget</div>
            <div className="font-bold text-sm font-mono">{formatCurrency(project.budget ?? 0)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Milestones</div>
            <div className="font-bold text-sm">{project.milestoneCount ?? 0}</div>
          </div>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Link
              to={`/projects/${project.id}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 border border-primary/30 transition-colors"
              title="Open project deep dive"
            >
              <Telescope className="w-3.5 h-3.5" />
              Deep Dive
            </Link>
            <Link
              to={`/risks?project=${project.id}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-amber-600 hover:text-amber-700 hover:bg-amber-50 border border-amber-200 transition-colors"
              title="View project risks"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Risks
            </Link>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {isOnHold ? (
                <button
                  onClick={() => onStatusOverride("active")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                  title="Resume project"
                >
                  ▶ Resume
                </button>
              ) : (
                <button
                  onClick={() => onStatusOverride("on_hold")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 border border-orange-200 text-orange-600 text-xs font-semibold hover:bg-orange-200 transition-colors"
                  title="Put on hold"
                >
                  ⏸ Hold
                </button>
              )}
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
        </div>
      </div>

      {expanded && (
        <div className="flex">
          {/* Left: vertical milestone timeline */}
          <VerticalMilestoneTimeline projectId={project.id} pillarColor={pillarColor} />
          {/* Right: full milestone table + weekly report */}
          <div className="flex-1 min-w-0">
            <MilestoneSection projectId={project.id} pillarColor={pillarColor} isAdmin={isAdmin} targetMilestoneId={targetMilestoneId} />
            <WeeklyReportSection projectId={project.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vertical Milestone Timeline ──────────────────────────────────────────────
const VMS_STYLE: Record<string, { dot: string; text: string }> = {
  approved:    { dot: "bg-success border-success",           text: "text-success" },
  submitted:   { dot: "bg-primary border-primary",           text: "text-primary" },
  pending:     { dot: "bg-warning border-warning",           text: "text-warning" },
  in_progress: { dot: "bg-blue-500 border-blue-500",         text: "text-blue-600" },
  not_started: { dot: "bg-muted-foreground/30 border-border", text: "text-muted-foreground" },
  delayed:     { dot: "bg-destructive border-destructive",   text: "text-destructive" },
};

function VerticalMilestoneTimeline({ projectId, pillarColor }: { projectId: number; pillarColor: string }) {
  const { data, isLoading } = useListSpmoMilestones(projectId);
  const milestones = (data?.milestones ?? []).slice().sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
  const today = new Date();

  return (
    <div
      className="shrink-0 border-t border-r border-border bg-secondary/5 flex flex-col"
      style={{ width: 160 }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-secondary/30">
        <Calendar className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Timeline</span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && milestones.length === 0 && (
        <div className="px-3 py-4 text-[10px] text-muted-foreground italic text-center">No milestones</div>
      )}

      {!isLoading && milestones.length > 0 && (
        <div className="relative px-3 py-3 flex-1">
          {/* Vertical rail — connects dot centres */}
          <div
            className="absolute left-[22px] top-[28px] bottom-[28px] w-0.5"
            style={{ backgroundColor: pillarColor + "40" }}
          />

          <div className="space-y-0">
            {milestones.map((m, idx) => {
              const style = VMS_STYLE[m.status ?? "not_started"] ?? VMS_STYLE["not_started"];
              const isOverdue = m.dueDate && new Date(m.dueDate) < today && m.status !== "approved";
              const dateStr = m.dueDate
                ? new Date(m.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
                : null;
              const isLast = idx === milestones.length - 1;

              return (
                <div key={m.id} className={`flex items-start gap-2 relative ${isLast ? "" : "pb-4"}`}>
                  {/* Dot */}
                  <div className="shrink-0 relative z-10 mt-0.5">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${style.dot} ${isOverdue ? "ring-2 ring-destructive/25" : ""}`} />
                  </div>
                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[10px] font-semibold leading-tight line-clamp-2 text-foreground/80"
                      title={m.name}
                    >
                      {m.name}
                    </p>
                    {dateStr && (
                      <p className={`text-[9px] mt-0.5 font-medium ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {dateStr}
                      </p>
                    )}
                    <span className={`text-[8px] font-bold capitalize ${style.text}`}>
                      {(m.status ?? "not_started").replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function computeProportionalWeights(items: { id: number; effortDays: number; startDate?: string | null; dueDate?: string | null }[]): Map<number, number> {
  if (items.length === 0) return new Map();

  // Cascade: effortDays → duration from dates → equal weight
  let values: { id: number; value: number }[];

  const totalEffort = items.reduce((s, m) => s + m.effortDays, 0);
  if (totalEffort > 0) {
    // Use effortDays
    values = items.map((m) => ({ id: m.id, value: m.effortDays }));
  } else {
    // Try duration from dates (dueDate - startDate in days)
    const durations = items.map((m) => {
      if (m.startDate && m.dueDate) {
        const days = Math.max(1, Math.round((new Date(m.dueDate).getTime() - new Date(m.startDate).getTime()) / 86_400_000));
        return { id: m.id, value: days };
      }
      return { id: m.id, value: 0 };
    });
    const totalDuration = durations.reduce((s, d) => s + d.value, 0);
    if (totalDuration > 0) {
      values = durations;
    } else {
      // Equal weight fallback
      const eq = Math.floor(100 / items.length);
      const rem = 100 - eq * items.length;
      const result = new Map<number, number>();
      items.forEach((m, i) => result.set(m.id, i < rem ? eq + 1 : eq));
      return result;
    }
  }

  // Largest-remainder method to distribute integer weights summing to exactly 100
  const total = values.reduce((s, v) => s + v.value, 0);
  const exact = values.map((v) => ({ id: v.id, exact: (v.value / total) * 100 }));
  const floored = exact.map((e) => ({ id: e.id, floor: Math.floor(e.exact), rem: e.exact - Math.floor(e.exact) }));
  let remainder = 100 - floored.reduce((s, e) => s + e.floor, 0);
  floored.sort((a, b) => b.rem - a.rem);
  const resultMap = new Map<number, number>();
  floored.forEach((e, i) => resultMap.set(e.id, e.floor + (i < remainder ? 1 : 0)));
  return resultMap;
}

function MilestoneSection({ projectId, pillarColor, isAdmin, targetMilestoneId }: { projectId: number; pillarColor: string; isAdmin: boolean; targetMilestoneId?: number | null }) {
  const { data, isLoading } = useListSpmoMilestones(projectId);
  const { data: depData } = useResolveProjectDependencies(projectId);
  const { data: allDepsData } = useListDependencies();
  const deleteDep = useDeleteDependency();
  const depResolutions = depData?.resolutions ?? {};
  const allDeps = allDepsData?.dependencies ?? [];
  const { toast } = useToast();
  const qc = useQueryClient();
  const [siblingWeightEdits, setSiblingWeightEdits] = useState<Record<number, string>>({});
  const [savingSiblingId, setSavingSiblingId] = useState<number | null>(null);
  const [applyingAutoWeights, setApplyingAutoWeights] = useState(false);
  const [effortWeightDialog, setEffortWeightDialog] = useState<{ open: boolean; pendingId: number | null; pendingEffort: number | null }>({ open: false, pendingId: null, pendingEffort: null });
  const [addDepForMilestoneId, setAddDepForMilestoneId] = useState<number | null>(null);
  const autoPopulatedRef = useRef(false);
  const didScrollMilestone = useRef(false);

  const createMutation = useCreateSpmoMilestone();
  const updateMutation = useUpdateSpmoMilestone();
  const deleteMutation = useDeleteSpmoMilestone();
  const submitMutation = useSubmitSpmoMilestone();
  const bulkWeightMutation = useSetBulkSpmoMilestoneWeights();

  const milestones = data?.milestones ?? [];
  const totalWeight = milestones.reduce((s: number, m) => s + (m.weight ?? 0), 0);
  const milestoneWeightError = totalWeight > 100;
  const milestoneWeightWarning = !milestoneWeightError && Math.round(totalWeight) !== 100 && milestones.length > 0;
  const autoWeightMap = computeProportionalWeights(milestones.map((m) => ({ id: m.id, effortDays: m.effortDays ?? 0, startDate: m.startDate, dueDate: m.dueDate })));

  // Auto-populate weights on first load when all milestones have 0 weight
  useEffect(() => {
    if (autoPopulatedRef.current) return;
    if (milestones.length === 0) return;
    const allZero = milestones.every((m) => (m.weight ?? 0) === 0);
    if (!allZero) return;
    const hasEffort = milestones.some((m) => (m.effortDays ?? 0) > 0);
    if (!hasEffort) return;
    autoPopulatedRef.current = true;
    const weights = computeProportionalWeights(milestones.map((m) => ({ id: m.id, effortDays: m.effortDays ?? 0, startDate: m.startDate, dueDate: m.dueDate })));
    const payload = milestones.map((m) => ({ id: m.id, weight: weights.get(m.id) ?? 0 }));
    if (Math.abs(payload.reduce((s, w) => s + w.weight, 0) - 100) < 2) {
      bulkWeightMutation.mutate({ projectId, data: { weights: payload } }, { onSuccess: () => invalidate() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones.length, milestones.map((m) => m.id).join(",")]);

  useEffect(() => {
    if (!targetMilestoneId || didScrollMilestone.current || isLoading || milestones.length === 0) return;
    const exists = milestones.some((m) => m.id === targetMilestoneId);
    if (!exists) return;
    didScrollMilestone.current = true;
    setTimeout(() => {
      const el = document.getElementById(`milestone-${targetMilestoneId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-1");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-1"), 3000);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMilestoneId, isLoading, milestones.length]);

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

  async function handleInlineEffortUpdate(id: number, effort: number) {
    await updateMutation.mutateAsync({ id, data: { effortDays: effort } });
    invalidate();
    // Prompt user to auto-update weights based on new effort proportions
    setEffortWeightDialog({ open: true, pendingId: id, pendingEffort: effort });
  }

  async function confirmAutoWeightFromEffort() {
    const { pendingId, pendingEffort } = effortWeightDialog;
    setEffortWeightDialog({ open: false, pendingId: null, pendingEffort: null });
    if (pendingId === null || pendingEffort === null) return;
    const updated = milestones.map((m) => ({ id: m.id, effortDays: m.id === pendingId ? pendingEffort : (m.effortDays ?? 0), startDate: m.startDate, dueDate: m.dueDate }));
    const weights = computeProportionalWeights(updated);
    const payload = updated.map((m) => ({ id: m.id, weight: weights.get(m.id) ?? 0 }));
    try {
      await bulkWeightMutation.mutateAsync({ projectId, data: { weights: payload } });
      invalidate();
      toast({ title: "Weights updated", description: "All weights recalculated from effort days." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ variant: "destructive", title: "Weight update failed", description: msg });
    }
  }

  function handleInlineStartDateUpdate(id: number, startDate: string) {
    updateMutation.mutate({ id, data: { startDate } }, {
      onSuccess: () => invalidate(),
    });
  }

  function handleInlineDueDateUpdate(id: number, dueDate: string) {
    updateMutation.mutate({ id, data: { dueDate } }, {
      onSuccess: () => invalidate(),
    });
  }

  function handleInlineWeightUpdate(id: number, weight: number) {
    updateMutation.mutate({ id, data: { weight } }, {
      onSuccess: () => {
        invalidate();
        setSiblingWeightEdits({});
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Weight update failed";
        toast({ variant: "destructive", title: "Cannot save weight", description: msg });
      },
    });
  }

  async function saveSiblingWeight(id: number) {
    const raw = siblingWeightEdits[id];
    if (raw === undefined) return;
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0 || val > 100) return;
    const current = milestones.find((m) => m.id === id);
    if (current && Math.abs((current.weight ?? 0) - val) < 0.01) return;
    setSavingSiblingId(id);
    try {
      await updateMutation.mutateAsync({ id, data: { weight: val } });
      invalidate();
      setSiblingWeightEdits((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ variant: "destructive", title: "Weight save failed", description: msg });
    } finally {
      setSavingSiblingId(null);
    }
  }

  function handleInlineNameUpdate(id: number, name: string) {
    updateMutation.mutate({ id, data: { name } }, {
      onSuccess: () => invalidate(),
    });
  }

  async function applyAutoWeights() {
    if (milestones.length === 0) return;
    const items = milestones.map((m) => ({ id: m.id, effortDays: m.effortDays ?? 0, startDate: m.startDate, dueDate: m.dueDate }));
    const weights = computeProportionalWeights(items);
    const payload = milestones.map((m) => ({ id: m.id, weight: weights.get(m.id) ?? 0 }));
    setApplyingAutoWeights(true);
    try {
      await bulkWeightMutation.mutateAsync({ projectId, data: { weights: payload } });
      invalidate();
      toast({ title: "Auto-weights applied", description: "All weights recalculated from effort days" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ variant: "destructive", title: "Auto-weight failed", description: msg });
    } finally {
      setApplyingAutoWeights(false);
    }
  }

  const [resettingToDuration, setResettingToDuration] = useState(false);
  async function resetWeightsToDuration() {
    if (milestones.length === 0) return;
    // Compute weights purely from date duration, ignoring effortDays
    const items = milestones.map((m) => {
      let days = 0;
      if (m.startDate && m.dueDate) {
        days = Math.max(1, Math.round((new Date(m.dueDate).getTime() - new Date(m.startDate).getTime()) / 86_400_000));
      }
      return { id: m.id, value: days };
    });
    const totalDays = items.reduce((s, i) => s + i.value, 0);
    if (totalDays === 0) {
      toast({ variant: "destructive", title: "No dates", description: "Milestones need start and due dates to compute duration-based weights." });
      return;
    }
    setResettingToDuration(true);
    try {
      // Compute proportional weights from duration
      const exact = items.map((i) => ({ id: i.id, exact: (i.value / totalDays) * 100 }));
      const floored = exact.map((e) => ({ id: e.id, floor: Math.floor(e.exact), rem: e.exact - Math.floor(e.exact) }));
      let remainder = 100 - floored.reduce((s, e) => s + e.floor, 0);
      floored.sort((a, b) => b.rem - a.rem);
      const weightMap = new Map<number, number>();
      floored.forEach((e, i) => weightMap.set(e.id, e.floor + (i < remainder ? 1 : 0)));

      // First: update effortDays on each milestone (no weight in this call to avoid validation)
      for (const item of items) {
        if (item.value > 0) {
          await updateMutation.mutateAsync({ id: item.id, data: { effortDays: item.value } });
        }
      }
      // Then: bulk-set all weights in one call (atomic, avoids per-milestone sum validation)
      const payload = milestones.map((m) => ({ id: m.id, weight: weightMap.get(m.id) ?? 0 }));
      await bulkWeightMutation.mutateAsync({ projectId, data: { weights: payload } });
      invalidate();
      toast({ title: "Reset to duration", description: "Effort days and weights set from milestone date ranges" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ variant: "destructive", title: "Reset failed", description: msg });
    } finally {
      setResettingToDuration(false);
    }
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

  async function handleAddMilestone() {
    const newEffort = 5;
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    try {
      const created = await createMutation.mutateAsync({
        id: projectId,
        data: { name: "New Milestone", effortDays: newEffort, weight: 0, dueDate },
      });
      const allItems = [
        ...milestones.map((m) => ({ id: m.id, effortDays: m.effortDays ?? 0, startDate: m.startDate, dueDate: m.dueDate })),
        { id: created.id, effortDays: newEffort },
      ];
      const weights = computeProportionalWeights(allItems);
      const payload = allItems.map((item) => ({ id: item.id, weight: weights.get(item.id) ?? 0 }));
      await bulkWeightMutation.mutateAsync({ projectId, data: { weights: payload } });
      invalidate();
      toast({ title: "Milestone added", description: "Weights redistributed based on effort" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add milestone";
      toast({ variant: "destructive", title: "Failed to add milestone", description: msg });
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

  return (
    <>
    {/* Effort → Weight confirmation dialog */}
    <Dialog open={effortWeightDialog.open} onOpenChange={(open) => !open && setEffortWeightDialog({ open: false, pendingId: null, pendingEffort: null })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update milestone weights?</DialogTitle>
          <DialogDescription>
            Effort days changed. Would you like to automatically redistribute all milestone weights proportionally based on the updated effort days?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setEffortWeightDialog({ open: false, pendingId: null, pendingEffort: null })}>
            Keep current weights
          </Button>
          <Button onClick={confirmAutoWeightFromEffort}>
            Yes, update weights
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="border-t border-border bg-secondary/10">
      {/* Column header — mirrors exact widths of the data rows below */}
      <div className="px-6 py-2 flex items-center gap-4 border-b border-border/50 bg-secondary/30">
        <div className="w-1 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Milestone</span>
        </div>
        <div className="w-36 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Progress</span>
        </div>
        <div className="w-20 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Effort</span>
        </div>
        <div className="w-24 shrink-0 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Start Date</span>
        </div>
        <div className="w-24 shrink-0 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Due Date</span>
        </div>
        <div className="w-16 shrink-0 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Wt%</span>
        </div>
        <div className="w-12 shrink-0" />
        {isAdmin && (
          <button
            onClick={handleAddMilestone}
            disabled={createMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {/* Weight summary row */}
      {milestones.length > 0 && (
        <div className={`px-6 py-2 border-b border-border/30 tabular-nums ${milestoneWeightError ? "bg-destructive/5" : milestoneWeightWarning ? "bg-warning/5" : "bg-success/5"}`}>
            <div className={`flex items-center justify-between text-[11px] font-semibold ${milestoneWeightError ? "text-destructive" : milestoneWeightWarning ? "text-warning" : "text-success"}`}>
              <span>
                {milestoneWeightError
                  ? `⚠ Total ${Math.round(totalWeight)}% exceeds 100% — reduce weights`
                  : milestoneWeightWarning
                  ? `△ Total ${Math.round(totalWeight)}% — adjust weights to reach 100%`
                  : `✓ Milestone weights total ${Math.round(totalWeight)}%`}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && (
                  <>
                    <button
                      onClick={applyAutoWeights}
                      disabled={applyingAutoWeights}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border border-current hover:opacity-70 transition-opacity disabled:opacity-40"
                      title="Recalculate weights from effort days (or dates if no effort)"
                    >
                      {applyingAutoWeights
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RotateCcw className="w-3 h-3" />}
                      Auto-weight
                    </button>
                    <button
                      onClick={resetWeightsToDuration}
                      disabled={resettingToDuration}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border border-blue-400 text-blue-600 hover:opacity-70 transition-opacity disabled:opacity-40"
                      title="Reset effort days and weights from milestone date ranges (overrides effort days)"
                    >
                      {resettingToDuration
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Calendar className="w-3 h-3" />}
                      Duration
                    </button>
                  </>
                )}
                <span className="w-16 text-right">{Math.max(0, Math.round(100 - totalWeight))}% left</span>
              </div>
            </div>
            {isAdmin && (milestoneWeightError || milestoneWeightWarning) && (
              <div className="mt-2 space-y-1.5">
                {milestones.map((sib) => {
                  const autoW = autoWeightMap.get(sib.id) ?? 0;
                  return (
                    <div key={sib.id} className="flex items-center gap-3">
                      <span className="flex-1 text-[11px] text-foreground truncate">{sib.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">auto: {autoW}%</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          className="w-14 text-xs border border-border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums text-right"
                          value={siblingWeightEdits[sib.id] ?? String(Math.round(sib.weight ?? 0))}
                          onChange={(e) => setSiblingWeightEdits((prev) => ({ ...prev, [sib.id]: e.target.value }))}
                          onBlur={() => saveSiblingWeight(sib.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          disabled={savingSiblingId === sib.id}
                        />
                        <span className="text-[11px] text-muted-foreground">%</span>
                        {savingSiblingId === sib.id && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      )}

      {isLoading ? (
        <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div>
          {(milestones as SpmoMilestoneWithEvidence[]).map((m) => {
            const isApproved = m.status === "approved";
            const evidenceList = (m.evidence ?? []) as SpmoEvidence[];
            const hasEvidence = evidenceList.length > 0;
            const canSubmit = (m.progress ?? 0) >= 100 && hasEvidence;
            const evidenceOpen = true; // always show evidence panel
            const depRes = depResolutions[m.id];
            const isBlocked = depRes?.status === "blocked";
            const blockerCount = depRes?.blockers?.filter((b) => !b.satisfied).length ?? 0;
            const hasDeps = (depRes?.blockers?.length ?? 0) > 0;
            const milestoneDeps = allDeps.filter(
              (d) =>
                (d.sourceType === "milestone" && d.sourceId === m.id) ||
                (d.targetType === "milestone" && d.targetId === m.id),
            );

            return (
              <div key={m.id} id={`milestone-${m.id}`} className={`group border-b border-border/30 last:border-b-0 transition-all ${isBlocked ? "bg-destructive/5" : ""}`}>
                <div className="px-6 py-3 flex items-center gap-4">
                  <div
                    className="w-1 h-10 rounded-full shrink-0 opacity-60"
                    style={{ backgroundColor: isBlocked ? "#ef4444" : pillarColor }}
                  />

                  {/* Name + status badges */}
                  <div className="flex-1 min-w-0">
                    {isApproved ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        <span className="text-sm font-semibold text-success">{m.name}</span>
                      </div>
                    ) : isBlocked ? (
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-destructive shrink-0" />
                        <span className="text-sm font-semibold text-destructive">{m.name}</span>
                      </div>
                    ) : isAdmin ? (
                      <div className="flex items-center gap-2">
                        {hasDeps && <GitMerge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <InlineEdit
                          value={m.name}
                          onSave={(v) => handleInlineNameUpdate(m.id, v)}
                          className="text-sm font-semibold"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {hasDeps && <GitMerge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className="text-sm font-semibold">{m.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <StatusBadge status={m.status} />
                      <HealthBadge status={m.healthStatus} />
                      {isBlocked && blockerCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5">
                          <Lock className="w-3 h-3" /> {blockerCount} blocker{blockerCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {(m.progress ?? 0) >= 100 && !hasEvidence && !isApproved && !isBlocked && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5">
                          <AlertCircle className="w-3 h-3" /> Evidence required
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="w-36 shrink-0">
                    {isApproved ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-success/20 rounded-full overflow-hidden">
                          <div className="h-full bg-success rounded-full" style={{ width: "100%" }} />
                        </div>
                        <span className="text-xs font-bold text-success">100%</span>
                      </div>
                    ) : isBlocked ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-destructive/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-destructive/40 rounded-full transition-all"
                            style={{ width: `${m.progress ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-destructive tabular-nums">{m.progress ?? 0}%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${m.progress ?? 0}%`, backgroundColor: pillarColor }}
                          />
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={m.progress ?? 0}
                            onChange={(e) => {
                              const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              handleInlineProgressUpdate(m.id, v);
                            }}
                            className="w-10 text-xs font-bold text-right border border-border rounded px-1 py-0.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Effort */}
                  <div className="w-20 shrink-0">
                    {isApproved || !isAdmin ? (
                      <span className="text-sm text-muted-foreground">{m.effortDays ?? 0}d</span>
                    ) : (
                      <InlineNumberEdit
                        value={m.effortDays ?? 0}
                        onSave={(v) => handleInlineEffortUpdate(m.id, v)}
                        suffix="d"
                        min={0}
                      />
                    )}
                  </div>

                  {/* Start Date — editable */}
                  <div className="w-24 shrink-0 text-center">
                    {isApproved || !isAdmin ? (
                      <span className="text-xs text-muted-foreground">
                        {m.startDate ? format(new Date(m.startDate + "T00:00:00"), "MMM d, yyyy") : "—"}
                      </span>
                    ) : (
                      <InlineDateEdit
                        value={m.startDate ?? ""}
                        onSave={(v) => handleInlineStartDateUpdate(m.id, v)}
                        placeholder="Set start"
                      />
                    )}
                  </div>

                  {/* Due Date — editable */}
                  <div className="w-24 shrink-0 text-center">
                    {isApproved || !isAdmin ? (
                      <span className="text-xs text-muted-foreground">
                        {m.dueDate ? format(new Date(m.dueDate + "T00:00:00"), "MMM d, yyyy") : "—"}
                      </span>
                    ) : (
                      <InlineDateEdit
                        value={m.dueDate ?? ""}
                        onSave={(v) => handleInlineDueDateUpdate(m.id, v)}
                      />
                    )}
                  </div>

                  {/* Weight — editable inline with auto-weight hint */}
                  <div className="w-16 text-center shrink-0">
                    {isApproved || !isAdmin ? (
                      <span className="text-xs font-bold tabular-nums">{Math.round(m.weight ?? 0)}%</span>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <InlineNumberEdit
                          value={Math.round(m.weight ?? 0)}
                          onSave={(v) => handleInlineWeightUpdate(m.id, v)}
                          suffix="%"
                          min={0}
                        />
                        {Math.abs((m.weight ?? 0) - (autoWeightMap.get(m.id) ?? 0)) >= 2 && (
                          <span className="text-[9px] text-muted-foreground tabular-nums leading-none">
                            auto: {autoWeightMap.get(m.id)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Evidence count badge */}
                  <div
                    className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 shrink-0 ${
                      hasEvidence ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    }`}
                    title={`${evidenceList.length} evidence file${evidenceList.length !== 1 ? "s" : ""}`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="font-semibold">{evidenceList.length}</span>
                  </div>

                  {/* Submit for Approval – visible only when progress=100% AND evidence>0 */}
                  {!isApproved && m.status !== "submitted" && canSubmit && (
                    <button
                      onClick={() => handleSubmitForApproval(m.id, m.name)}
                      disabled={submitMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0 bg-primary text-primary-foreground border-primary hover:bg-primary/90 disabled:opacity-60"
                      title="Submit for approval"
                    >
                      <Send className="w-3 h-3" /> Submit for Approval
                    </button>
                  )}

                  {/* Delete + Link Dep (admin only) */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setAddDepForMilestoneId(m.id)}
                        className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                        title="Add dependency"
                      >
                        <GitMerge className="w-4 h-4" />
                      </button>
                      {!isApproved && (
                        <button
                          onClick={() => handleDelete(m.id, m.name)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/15 transition-colors"
                          title="Delete milestone"
                        >
                          <X className="w-3.5 h-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Evidence Panel */}
                {evidenceOpen && (
                  <EvidencePanel milestone={m} onInvalidate={invalidate} />
                )}

                {/* Dependency Management — show when deps exist or admin hovers */}
                {milestoneDeps.length > 0 && (
                  <div className="px-6 pb-3 pt-1">
                    <div className="rounded-lg border border-border/60 bg-secondary/20 divide-y divide-border/40">
                      <div className="px-3 py-1.5 flex items-center gap-1.5">
                        <GitMerge className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dependencies</span>
                      </div>
                      {milestoneDeps.map((dep) => {
                        const isIncoming = dep.targetType === "milestone" && dep.targetId === m.id;
                        return (
                          <div key={dep.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${isIncoming ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                              {isIncoming ? "BLOCKED BY" : "BLOCKS"}
                            </span>
                            <span className="flex-1 text-foreground truncate">
                              {isIncoming ? dep.sourceName : dep.targetName}
                              <span className="text-muted-foreground ml-1">
                                ({isIncoming ? dep.sourceProjectName : dep.targetProjectName})
                              </span>
                            </span>
                            {dep.lagDays > 0 && (
                              <span className="text-muted-foreground shrink-0">+{dep.lagDays}d lag</span>
                            )}
                            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${dep.isHard ? "border-destructive/30 text-destructive bg-destructive/5" : "border-border text-muted-foreground"}`}>
                              {dep.isHard ? "HARD" : "SOFT"}
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  if (!confirm("Remove this dependency?")) return;
                                  deleteDep.mutate(dep.id, {
                                    onSuccess: () => {
                                      toast({ title: "Dependency removed" });
                                      qc.invalidateQueries({ queryKey: ["/api/spmo/dependencies"] });
                                      qc.invalidateQueries({ queryKey: [`/api/spmo/dependencies/resolve-project`, projectId] });
                                    },
                                    onError: () => toast({ variant: "destructive", title: "Failed to remove dependency" }),
                                  });
                                }}
                                className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Remove dependency"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {milestones.length === 0 && (
            <div className="px-6 py-6 text-center text-sm text-muted-foreground">
              No milestones yet.{" "}
              {isAdmin && (
                <button onClick={handleAddMilestone} className="text-primary hover:underline font-medium">
                  Add one
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    {addDepForMilestoneId !== null && (
      <AddDependencyModal onClose={() => setAddDepForMilestoneId(null)} />
    )}
    </>
  );
}

function WeeklyReportSection({ projectId }: { projectId: number }) {
  const { data, isLoading } = useGetSpmaProjectWeeklyReport(projectId);
  const { data: historyData } = useGetSpmaProjectWeeklyReportHistory(projectId);
  const upsert = useUpsertSpmaProjectWeeklyReport();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ achievements: "", nextSteps: "" });
  const formRef = useRef(form);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => { formRef.current = form; }, [form]);

  useEffect(() => {
    if (data && !loaded) {
      const initial = { achievements: data.keyAchievements ?? "", nextSteps: data.nextSteps ?? "" };
      setForm(initial);
      formRef.current = initial;
      setLoaded(true);
    }
  }, [data, loaded]);

  const pastReports = (historyData?.reports ?? []).filter(
    (r) => r.weekStart !== data?.weekStart
  );

  async function save() {
    const latest = formRef.current;
    setSaving(true);
    try {
      await upsert.mutateAsync({
        id: projectId,
        data: { keyAchievements: latest.achievements, nextSteps: latest.nextSteps },
      });
      qc.invalidateQueries({ queryKey: [`/api/spmo/projects/${projectId}/weekly-report`] });
      qc.invalidateQueries({ queryKey: [`/api/spmo/projects/${projectId}/weekly-report/history`] });
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Could not save weekly report." });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return null;

  return (
    <div className="border-t border-border bg-background/60 px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Weekly Report</span>
        {data?.weekStart && (
          <span className="text-[10px] text-muted-foreground">
            (week of {new Date(data.weekStart + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})
          </span>
        )}
        {saving && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        {data?.updatedByName && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            Last updated by {data.updatedByName}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Key Achievements</label>
          <textarea
            className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none min-h-[72px]"
            placeholder="What was accomplished this week?"
            value={form.achievements}
            onChange={(e) => setForm((f) => ({ ...f, achievements: e.target.value }))}
            onBlur={save}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Next Steps</label>
          <textarea
            className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none min-h-[72px]"
            placeholder="What will be done next week?"
            value={form.nextSteps}
            onChange={(e) => setForm((f) => ({ ...f, nextSteps: e.target.value }))}
            onBlur={save}
          />
        </div>
      </div>

      {pastReports.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${historyOpen ? "rotate-90" : ""}`} />
            Previous weeks ({pastReports.length})
          </button>

          {historyOpen && (
            <div className="mt-2 space-y-3">
              {pastReports.map((r) => (
                <div key={r.id} className="rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Week of {new Date(r.weekStart + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {r.updatedByName && (
                      <span className="ml-2 font-normal normal-case tracking-normal">· {r.updatedByName}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-semibold text-foreground mb-1">Key Achievements</div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {r.keyAchievements || <span className="italic">None recorded</span>}
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-foreground mb-1">Next Steps</div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {r.nextSteps || <span className="italic">None recorded</span>}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const HEALTH_BADGE_MAP: Record<SpmoHealthStatus, { label: string; className: string }> = {
  completed:   { label: "Completed",   className: "bg-success/10 text-success border border-success/30" },
  on_track:    { label: "On Track",    className: "bg-primary/10 text-primary border border-primary/30" },
  at_risk:     { label: "At Risk",     className: "bg-warning/10 text-warning border border-warning/30" },
  delayed:     { label: "Delayed",     className: "bg-destructive/10 text-destructive border border-destructive/30" },
  not_started: { label: "Not Started", className: "bg-muted text-muted-foreground border border-border" },
};

function HealthBadge({ status }: { status: SpmoHealthStatus | undefined }) {
  if (!status) return null;
  const { label, className } = HEALTH_BADGE_MAP[status];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${className}`}>{label}</span>
  );
}

function ComputedStatusBadge({ cs }: { cs: SpmoStatusResult | undefined }) {
  if (!cs) return null;
  const { label, className } = HEALTH_BADGE_MAP[cs.status];
  return (
    <div className="relative group inline-flex flex-col gap-0.5">
      <div className="inline-flex items-center gap-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${className}`}>{label}</span>
        <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover:block pointer-events-none">
          <div className="bg-popover border border-border rounded-lg shadow-xl px-3 py-2 text-xs text-foreground w-72 whitespace-normal leading-relaxed">
            <div className="font-semibold mb-1">{label}</div>
            <div className="text-muted-foreground">{cs.reason}</div>
            {cs.burnGap !== 0 && (
              <div className={`mt-1 ${cs.burnGap > 0 ? "text-warning" : "text-success"}`}>
                Budget burn gap: {cs.burnGap > 0 ? "+" : ""}{cs.burnGap}pts
              </div>
            )}
          </div>
        </div>
      </div>
      {cs.delayedChildren && cs.delayedChildren.length > 0 && (
        <div className="text-[10px] text-destructive/80 leading-tight">
          ⚠ Delayed: {cs.delayedChildren.join(", ")}
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
      className={`${className} cursor-pointer inline-flex items-center gap-1 group/ie`}
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Tap to edit"
    >
      <span className="group-hover/ie:underline">{value}</span>
      <Pencil className="w-3 h-3 text-muted-foreground/50 group-hover/ie:text-primary transition-colors shrink-0" />
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

function InlineDateEdit({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        className={`${inputClass} py-0.5 px-1 text-xs w-full`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft && draft !== value) onSave(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  const display = value
    ? format(new Date(value + "T00:00:00"), "MMM d, yyyy")
    : (placeholder ?? "Set date");

  return (
    <span
      className={`text-xs cursor-pointer hover:underline ${value ? "text-muted-foreground" : "text-primary"}`}
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit due date"
    >
      {display}
    </span>
  );
}
