import { useState, useRef } from "react";
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
  useUpdateSpmoMilestone,
  useAddSpmoEvidence,
  useRunSpmoAiValidateEvidence,
  type SpmoMilestoneWithEvidence,
  type SpmoEvidence,
  type SpmoHealthStatus,
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

type TabKey = "overview" | "milestones" | "weekly-report" | "risks";

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

// ─── Milestone row ─────────────────────────────────────────────────────────────

function MilestoneRow({
  milestone,
  canApprove,
  onInvalidate,
}: {
  milestone: SpmoMilestoneWithEvidence;
  canApprove: boolean;
  onInvalidate: () => void;
}) {
  const qc = useQueryClient();
  const updateMilestone = useUpdateSpmoMilestone();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(milestone.progress ?? 0);

  const isApproved = milestone.status === "approved";
  const isRejected = milestone.status === "rejected";
  const isSubmitted = milestone.status === "submitted";

  const saveProgress = async () => {
    await updateMilestone.mutateAsync({ id: milestone.id, data: { progress } });
    toast({ title: "Progress updated" });
    onInvalidate();
    setEditing(false);
  };

  return (
    <div className={`rounded-xl border ${isApproved ? "border-success/30 bg-success/5" : isRejected ? "border-destructive/30 bg-destructive/5" : isSubmitted ? "border-primary/30 bg-primary/5" : "border-border bg-background"} p-4 transition-colors`}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{milestone.name}</span>
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
              editing ? (
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
                  <button onClick={() => setEditing(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="text-[10px] font-semibold text-primary hover:underline">
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
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type Props = {
  params: { id: string };
};

export default function ProjectDetail({ params }: Props) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editingReport, setEditingReport] = useState(false);
  const [reportDraft, setReportDraft] = useState({ keyAchievements: "", nextSteps: "" });
  const projectId = parseInt(params?.id ?? "0");

  const { data: authData } = useGetCurrentAuthUser();
  const userRole = authData?.user?.role;
  const canApprove = userRole === "admin" || userRole === "approver";
  const canEditReport = userRole === "admin" || userRole === "project-manager";

  const { data: project, isLoading } = useGetSpmoProject(projectId);
  const { data: pillarsData } = useListSpmoPillars();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: weeklyReport, queryKey: weeklyReportKey } = useGetSpmaProjectWeeklyReport(projectId);
  const { data: reportHistory, queryKey: reportHistoryKey } = useGetSpmaProjectWeeklyReportHistory(projectId);
  const { data: risksData } = useListSpmoRisks();
  const upsertReport = useUpsertSpmaProjectWeeklyReport();

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

  const TABS: { key: TabKey; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "overview",      label: "Overview",       icon: Target },
    { key: "milestones",    label: "Milestones",     icon: ClipboardList, count: milestoneTotal },
    { key: "weekly-report", label: "Weekly Report",  icon: Activity },
    { key: "risks",         label: "Risks",          icon: ShieldAlert,   count: projectRisks.length },
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
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Budget Allocated</span>
              </div>
              <div className="font-bold text-sm font-mono">{formatCurrency(project.budget)}</div>
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
        <div className="space-y-3">
          {milestones.length === 0 ? (
            <Card className="text-center py-16">
              <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <h3 className="font-bold">No milestones yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Add milestones from the Projects page to get started.</p>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground font-medium">{milestones.length} milestone{milestones.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> {milestoneApproved} approved</span>
                  {project.pendingApprovals > 0 && (
                    <span className="flex items-center gap-1 text-warning font-semibold"><AlertCircle className="w-3.5 h-3.5" /> {project.pendingApprovals} pending</span>
                  )}
                </div>
              </div>
              {milestones.map((m) => (
                <MilestoneRow key={m.id} milestone={m} canApprove={canApprove} onInvalidate={invalidate} />
              ))}
            </>
          )}
        </div>
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
    </div>
  );
}
