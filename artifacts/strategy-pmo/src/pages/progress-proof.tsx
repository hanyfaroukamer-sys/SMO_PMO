import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  useListSpmoAllMilestones,
  useListSpmoPendingApprovals,
  useRunSpmoAiValidateEvidence,
  useApproveSpmoMilestone,
  useRejectSpmoMilestone,
  useAddSpmoEvidence,
  useGetCurrentAuthUser,
  type SpmoPendingApprovalItem,
  type SpmoEvidence,
  type SpmoMilestoneWithEvidence,
} from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import {
  Loader2, CheckCircle2, XCircle, FileText, Sparkles, ChevronRight, ChevronDown,
  Target, Clock, AlertCircle, FileX, ThumbsUp, Upload, ShieldCheck, Building2, Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type FilterKey = "all" | "submitted" | "approved" | "rejected" | "blocked100" | "no_evidence";

type ExtendedMilestone = SpmoMilestoneWithEvidence & { approvedByName?: string | null };

const FILTER_CONFIG: Array<{
  key: FilterKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  borderClass: string;
  activeClass: string;
}> = [
  { key: "all",         label: "Total Milestones",     icon: Target,        colorClass: "text-primary",          borderClass: "border-primary/20 bg-primary/5",           activeClass: "bg-primary text-primary-foreground border-primary" },
  { key: "approved",    label: "Approved",              icon: ThumbsUp,      colorClass: "text-success",          borderClass: "border-success/20 bg-success/5",           activeClass: "bg-success text-white border-success" },
  { key: "submitted",   label: "Pending",               icon: Clock,         colorClass: "text-warning",          borderClass: "border-warning/20 bg-warning/5",           activeClass: "bg-warning text-white border-warning" },
  { key: "rejected",    label: "Rejected",              icon: XCircle,       colorClass: "text-destructive",      borderClass: "border-destructive/20 bg-destructive/5",   activeClass: "bg-destructive text-white border-destructive" },
  { key: "blocked100",  label: "At 100% Unapproved",   icon: AlertCircle,   colorClass: "text-destructive",      borderClass: "border-destructive/20 bg-destructive/5",   activeClass: "bg-destructive text-white border-destructive" },
  { key: "no_evidence", label: "Missing Evidence",      icon: FileX,         colorClass: "text-muted-foreground", borderClass: "border-border bg-secondary/50",            activeClass: "bg-slate-600 text-white border-slate-600" },
];

export default function ProgressProof() {
  const [filter, setFilter] = useState<FilterKey>("submitted");
  const [collapsedPillars, setCollapsedPillars] = useState<Set<number>>(() => new Set());
  const [collapsedInitiatives, setCollapsedInitiatives] = useState<Set<number>>(() => new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(() => new Set());
  const { data: authData } = useGetCurrentAuthUser();
  const isAdmin = authData?.user?.role === "admin";
  const { data, isLoading } = useListSpmoAllMilestones();

  if (!isAdmin && authData !== undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to view progress proofs.</p>
      </div>
    );
  }

  if (isLoading)
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const allItems = (data?.items ?? []) as SpmoPendingApprovalItem[];

  const counts: Record<FilterKey, number> = {
    all:         allItems.length,
    approved:    allItems.filter((i) => i.milestone.status === "approved").length,
    submitted:   allItems.filter((i) => i.milestone.status === "submitted").length,
    rejected:    allItems.filter((i) => i.milestone.status === "rejected").length,
    blocked100:  allItems.filter((i) => (i.milestone.progress ?? 0) >= 100 && i.milestone.status !== "approved").length,
    no_evidence: allItems.filter((i) => (i.milestone.evidence?.length ?? 0) === 0).length,
  };

  const filteredItems = allItems.filter((i) => {
    if (filter === "all")         return true;
    if (filter === "submitted")   return i.milestone.status === "submitted";
    if (filter === "approved")    return i.milestone.status === "approved";
    if (filter === "rejected")    return i.milestone.status === "rejected";
    if (filter === "blocked100")  return (i.milestone.progress ?? 0) >= 100 && i.milestone.status !== "approved";
    if (filter === "no_evidence") return (i.milestone.evidence?.length ?? 0) === 0;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader
        title="Progress Proof Centre"
        description="Review evidence and approve milestone completions."
      />

      {/* 6 Summary Filter Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {FILTER_CONFIG.map((fc) => {
          const Icon = fc.icon;
          const isActive = filter === fc.key;
          return (
            <button
              key={fc.key}
              onClick={() => setFilter(fc.key)}
              className={`text-left p-4 rounded-2xl border-2 transition-all shadow-sm hover:shadow-md ${
                isActive ? `${fc.activeClass} shadow-md` : `${fc.borderClass} hover:border-current/40`
              }`}
            >
              <Icon className={`w-5 h-5 mb-3 ${isActive ? "opacity-90" : fc.colorClass}`} />
              <div className={`text-3xl font-display font-bold leading-none mb-1.5 ${isActive ? "" : fc.colorClass}`}>
                {counts[fc.key]}
              </div>
              <div className={`text-xs font-semibold leading-tight ${isActive ? "opacity-80" : "text-muted-foreground"}`}>
                {fc.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Evidence Stats Bar */}
      <Card className="py-3 px-6">
        <div className="flex flex-wrap items-center gap-6 divide-x divide-border">
          <div className="pr-6">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Evidence Files</span>
            <div className="text-2xl font-display font-bold text-primary mt-0.5">
              {allItems.reduce((s, i) => s + (i.milestone.evidence?.length ?? 0), 0)}
            </div>
          </div>
          <div className="pl-6 pr-6">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Approval Rate</span>
            <div className="text-2xl font-display font-bold text-success mt-0.5">
              {counts.all > 0 ? Math.round((counts.approved / counts.all) * 100) : 0}%
            </div>
          </div>
          <div className="pl-6">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Showing</span>
            <div className="text-2xl font-display font-bold text-foreground mt-0.5">
              {filteredItems.length} <span className="text-sm font-normal text-muted-foreground">milestone{filteredItems.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "all" as FilterKey,         label: "All" },
            { key: "submitted" as FilterKey,   label: "Pending" },
            { key: "blocked100" as FilterKey,  label: "100% Blocked" },
            { key: "no_evidence" as FilterKey, label: "No Evidence" },
            { key: "approved" as FilterKey,    label: "Approved" },
            { key: "rejected" as FilterKey,    label: "Rejected" },
          ]
        ).map((pill) => {
          const isActive = filter === pill.key;
          return (
            <button
              key={pill.key}
              onClick={() => setFilter(pill.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {pill.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                isActive ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground"
              }`}>{counts[pill.key]}</span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground font-medium">
          {filteredItems.length} milestone{filteredItems.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Hierarchy: Pillar → Initiative → Project → Milestones */}
      {filteredItems.length === 0 ? (
        <Card className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3 opacity-50" />
          <h3 className="text-lg font-bold">Nothing here</h3>
          <p className="text-muted-foreground mt-1 text-sm">No milestones in this category.</p>
        </Card>
      ) : (() => {
        // Build Pillar → Initiative → Project hierarchy
        type PillarGroup = {
          pillar: SpmoPendingApprovalItem["pillar"];
          initiatives: {
            initiative: SpmoPendingApprovalItem["initiative"];
            projects: {
              project: SpmoPendingApprovalItem["project"];
              items: SpmoPendingApprovalItem[];
            }[];
          }[];
        };

        const pillarMap = new Map<number, PillarGroup>();
        for (const item of filteredItems) {
          const pid = item.pillar.id;
          if (!pillarMap.has(pid)) pillarMap.set(pid, { pillar: item.pillar, initiatives: [] });
          const pg = pillarMap.get(pid)!;

          let ig = pg.initiatives.find((i) => i.initiative.id === item.initiative.id);
          if (!ig) { ig = { initiative: item.initiative, projects: [] }; pg.initiatives.push(ig); }

          let proj = ig.projects.find((p) => p.project.id === item.project.id);
          if (!proj) { proj = { project: item.project, items: [] }; ig.projects.push(proj); }

          proj.items.push(item);
        }

        const pillarGroups = Array.from(pillarMap.values()).sort((a, b) =>
          (a.pillar.sortOrder ?? 999) - (b.pillar.sortOrder ?? 999)
        );

        const toggleSet = (setFn: Dispatch<SetStateAction<Set<number>>>, id: number) =>
          setFn((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

        return (
          <div className="space-y-4">
            {pillarGroups.map(({ pillar, initiatives }) => {
              const pillarCollapsed = collapsedPillars.has(pillar.id);
              const pillarCount = initiatives.reduce((s, i) => s + i.projects.reduce((s2, p) => s2 + p.items.length, 0), 0);

              return (
                <div key={pillar.id} className="rounded-2xl border border-border overflow-hidden shadow-sm">
                  {/* Pillar Header */}
                  <button
                    onClick={() => toggleSet(setCollapsedPillars, pillar.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-secondary/50 transition-colors"
                    style={{ background: `linear-gradient(90deg, ${pillar.color ?? "#3b82f6"}22 0%, transparent 60%)` }}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: pillar.color ?? "#3b82f6" }} />
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-display font-bold text-sm flex-1">{pillar.name}</span>
                    <span className="text-xs text-muted-foreground font-medium">{pillarCount} milestone{pillarCount !== 1 ? "s" : ""}</span>
                    {pillarCollapsed
                      ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {!pillarCollapsed && (
                    <div className="border-t border-border">
                      {initiatives.map(({ initiative, projects }) => {
                        const initCollapsed = collapsedInitiatives.has(initiative.id);
                        const initCount = projects.reduce((s, p) => s + p.items.length, 0);

                        return (
                          <div key={initiative.id} className="border-b border-border/50 last:border-b-0">
                            {/* Initiative Header */}
                            <button
                              onClick={() => toggleSet(setCollapsedInitiatives, initiative.id)}
                              className="w-full flex items-center gap-3 px-5 py-2.5 text-left bg-secondary/20 hover:bg-secondary/40 transition-colors"
                            >
                              <div className="w-1 h-6 rounded-full ml-4 shrink-0" style={{ backgroundColor: pillar.color ?? "#3b82f6" }} />
                              <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-semibold text-xs flex-1">{initiative.name}</span>
                              <span className="text-[10px] text-muted-foreground">{initCount} milestone{initCount !== 1 ? "s" : ""}</span>
                              {initCollapsed
                                ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>

                            {!initCollapsed && (
                              <div>
                                {projects.map(({ project, items }) => {
                                  const projCollapsed = collapsedProjects.has(project.id);

                                  return (
                                    <div key={project.id} className="border-t border-border/30">
                                      {/* Project Header */}
                                      <button
                                        onClick={() => toggleSet(setCollapsedProjects, project.id)}
                                        className="w-full flex items-center gap-3 px-5 py-2 text-left bg-background hover:bg-secondary/30 transition-colors"
                                      >
                                        <div className="w-6 ml-8" />
                                        <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        <span className="font-semibold text-xs flex-1">
                                          {project.projectCode && <span className="font-mono text-muted-foreground mr-1.5">{project.projectCode}:</span>}
                                          {project.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">{items.length} milestone{items.length !== 1 ? "s" : ""}</span>
                                        {projCollapsed
                                          ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                          : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                                      </button>

                                      {!projCollapsed && (
                                        <div className="p-4 bg-background grid grid-cols-1 xl:grid-cols-2 gap-4 border-t border-border/20">
                                          {items.map((item) => (
                                            <ApprovalCard key={item.milestone.id} item={item} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

function ApprovalCard({ item }: { item: SpmoPendingApprovalItem }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const aiMutation = useRunSpmoAiValidateEvidence();
  const approveMutation = useApproveSpmoMilestone();
  const rejectMutation = useRejectSpmoMilestone();
  const addEvidence = useAddSpmoEvidence();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/milestones/all"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/pending-approvals"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/programme"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
  };

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await fetch("/api/spmo/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId: item.milestone.id }),
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
        { id: item.milestone.id, data: { fileName: file.name, contentType: file.type, objectPath } },
        {
          onSuccess: () => {
            toast({ title: "Evidence uploaded", description: file.name });
            invalidate();
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

  const handleAI = () => {
    aiMutation.mutate({ data: { milestoneId: item.milestone.id } }, {
      onSuccess: () => toast({ title: "AI Validation Complete" }),
      onError: () => toast({ variant: "destructive", title: "AI validation failed" }),
    });
  };

  const handleApprove = () => {
    approveMutation.mutate({ id: item.milestone.id, data: {} }, {
      onSuccess: () => { toast({ title: "Milestone approved" }); invalidate(); },
    });
  };

  const handleReject = () => {
    rejectMutation.mutate({ id: item.milestone.id, data: { reason: "Evidence insufficient" } }, {
      onSuccess: () => { toast({ title: "Milestone rejected" }); invalidate(); },
    });
  };

  const milestone = item.milestone as ExtendedMilestone;
  const pillarColor = item.pillar?.color ?? "#2563eb";
  const progress = milestone.progress ?? 0;
  const evidenceCount = milestone.evidence?.length ?? 0;
  const isApproved = milestone.status === "approved";

  return (
    <Card
      noPadding={false}
      className="flex flex-col border-l-4"
      style={{ borderLeftColor: pillarColor }}
    >
      {/* Breadcrumb header */}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2 flex-wrap">
        <span style={{ color: pillarColor }}>{item.pillar?.name}</span>
        <ChevronRight className="w-3 h-3" />
        <span>{item.initiative?.name}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground/80">{item.project?.name}</span>
      </div>

      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-base leading-snug">{milestone.name}</h3>
        <StatusBadge status={milestone.status} />
      </div>

      <div className="flex items-center gap-3 mb-4 text-xs text-muted-foreground flex-wrap">
        {milestone.effortDays != null && (
          <span className="font-medium">Effort: <span className="font-bold text-foreground">{milestone.effortDays}d</span></span>
        )}
        {((milestone as any).effectiveWeight ?? milestone.weight ?? 0) > 0 && (
          <span className="font-medium">Weight: <span className="font-bold text-foreground">{Math.round((milestone as any).effectiveWeight ?? milestone.weight ?? 0)}%</span></span>
        )}
        {milestone.status === "approved" && milestone.approvedByName && (
          <span className="flex items-center gap-1 text-success font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            Approved by {milestone.approvedByName}
          </span>
        )}
        {milestone.status === "rejected" && milestone.rejectionReason && (
          <span className="text-destructive font-medium">
            Rejected: {milestone.rejectionReason}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-bold" style={{ color: pillarColor }}>{progress}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, backgroundColor: pillarColor }}
          />
        </div>
      </div>

      {/* Evidence list */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            Evidence ({evidenceCount})
          </h4>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {uploading ? "Uploading…" : "Upload Evidence"}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
        </div>
        {evidenceCount === 0 ? (
          <div className="text-xs text-destructive p-2.5 bg-destructive/10 rounded-lg border border-destructive/20 font-medium">
            No evidence attached — milestone cannot be approved without evidence.
          </div>
        ) : (
          <div className="space-y-1.5">
            {(milestone.evidence as SpmoEvidence[]).map((ev) => (
              <div key={ev.id} className="flex items-center justify-between p-2 bg-secondary/30 border border-border rounded-lg text-xs group hover:border-primary/30 transition-colors">
                <span className="font-medium truncate flex-1">{ev.fileName}</span>
                <a
                  href={`/api/storage/objects/${ev.objectPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-3 font-semibold shrink-0"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Results */}
      {aiMutation.data && (
        <div className={`mb-4 p-3.5 rounded-xl border ${
          aiMutation.data.verdict === "strong" ? "bg-success/5 border-success/20" : "bg-warning/5 border-warning/20"
        }`}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Sparkles className="w-3.5 h-3.5 text-violet-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI Validation</span>
            <span className={`text-xs font-bold capitalize px-2 py-0.5 rounded-full border ${
              aiMutation.data.verdict === "strong" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"
            }`}>
              {aiMutation.data.verdict}
            </span>
            {/* Score circle (1-10 scale) */}
            <div className="ml-auto flex items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-sm border-2 ${
                aiMutation.data.overallScore >= 80
                  ? "border-success text-success bg-success/10"
                  : aiMutation.data.overallScore >= 50
                  ? "border-warning text-warning bg-warning/10"
                  : "border-destructive text-destructive bg-destructive/10"
              }`}>
                {Math.round(aiMutation.data.overallScore / 10)}
              </div>
              <span className="text-[10px] text-muted-foreground">/10</span>
            </div>
          </div>

          {/* Sub-scores */}
          {aiMutation.data.subScores && (
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {(["completeness", "relevance", "specificity"] as const).map((key) => {
                const val = aiMutation.data.subScores?.[key] ?? 0;
                return (
                  <div key={key} className="text-center p-1.5 bg-background/60 rounded-lg border border-border/50">
                    <div className="text-sm font-bold">{val}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{key}</div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-foreground/80 leading-relaxed mb-2">{aiMutation.data.reasoning}</p>

          {/* Present / Gaps columns */}
          {((aiMutation.data.presentItems?.length ?? 0) > 0 || (aiMutation.data.gapItems?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <p className="text-[10px] font-bold text-success mb-1 uppercase tracking-wider">Present</p>
                <ul className="space-y-0.5">
                  {(aiMutation.data.presentItems ?? []).map((item, i) => (
                    <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                      <span className="text-success shrink-0">✓</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-bold text-destructive mb-1 uppercase tracking-wider">Gaps</p>
                <ul className="space-y-0.5">
                  {(aiMutation.data.gapItems ?? []).map((item, i) => (
                    <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                      <span className="text-destructive shrink-0">✗</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {aiMutation.data.suggestions?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Recommendations:</p>
              {aiMutation.data.suggestions.map((s: string, i: number) => (
                <p key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                  <span className="shrink-0 text-primary">→</span>{s}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-border">
        <button
          onClick={handleAI}
          disabled={aiMutation.isPending || evidenceCount === 0}
          className="flex items-center gap-1.5 bg-secondary text-secondary-foreground border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-secondary/80 disabled:opacity-50 transition-colors"
        >
          {aiMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {aiMutation.data ? "Re-validate" : "AI Validate"}
        </button>

        {milestone.status === "submitted" && (
          <>
            <button
              onClick={handleReject}
              disabled={rejectMutation.isPending}
              className="flex items-center gap-1.5 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={approveMutation.isPending || evidenceCount === 0}
              className="flex items-center gap-1.5 bg-success text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:-translate-y-0.5 transition-transform shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          </>
        )}

        {isApproved && (
          <div className="flex items-center gap-1.5 text-success text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </div>
        )}
      </div>
    </Card>
  );
}
