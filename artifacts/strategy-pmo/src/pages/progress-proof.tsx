import { useState } from "react";
import {
  useListSpmoPendingApprovals,
  useRunSpmoAiValidateEvidence,
  useApproveSpmoMilestone,
  useRejectSpmoMilestone,
} from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Loader2, CheckCircle2, XCircle, FileText, Sparkles, ChevronRight, Target, Clock, AlertCircle, FileX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type FilterType = "all" | "pending" | "approved" | "rejected";

export default function ProgressProof() {
  const [filter, setFilter] = useState<FilterType>("pending");
  const { data, isLoading } = useListSpmoPendingApprovals();

  if (isLoading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const allItems = data?.items ?? [];

  const pending = allItems.filter((i) => i.milestone.status === "submitted");
  const approved = allItems.filter((i) => i.milestone.status === "approved");
  const rejected = allItems.filter((i) => i.milestone.status === "rejected");
  const at100Unapproved = allItems.filter(
    (i) => (i.milestone.progress ?? 0) >= 100 && i.milestone.status !== "approved"
  );
  const noEvidence = allItems.filter(
    (i) => (i.milestone.evidence?.length ?? 0) === 0 && i.milestone.status !== "approved"
  );

  const filteredItems =
    filter === "pending" ? pending
      : filter === "approved" ? approved
      : filter === "rejected" ? rejected
      : allItems;

  const filterCards = [
    { key: "all" as FilterType, label: "Total Milestones", count: allItems.length, icon: Target, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
    { key: "approved" as FilterType, label: "Approved", count: approved.length, icon: CheckCircle2, color: "text-success", bg: "bg-success/10", border: "border-success/20" },
    { key: "pending" as FilterType, label: "Pending Review", count: pending.length, icon: Clock, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
    { key: "rejected" as FilterType, label: "Rejected", count: rejected.length, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
    { key: "all" as FilterType, label: "100% Unapproved", count: at100Unapproved.length, icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
    { key: "all" as FilterType, label: "Missing Evidence", count: noEvidence.length, icon: FileX, color: "text-muted-foreground", bg: "bg-secondary", border: "border-border" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Progress Proof Centre" description="Review evidence and approve milestone completions." />

      {/* 6 Summary Filter Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {filterCards.map((fc, idx) => {
          const Icon = fc.icon;
          const isActive = filter === fc.key && (idx === 0 ? filter === "all" : true);
          return (
            <button
              key={idx}
              onClick={() => setFilter(fc.key)}
              className={`text-left p-4 rounded-xl border transition-all hover:shadow-md ${fc.border} ${fc.bg} ${filter === fc.key ? "ring-2 ring-primary shadow-md" : ""}`}
            >
              <div className={`w-8 h-8 rounded-lg ${fc.bg} ${fc.color} flex items-center justify-center mb-2`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className={`text-2xl font-display font-bold ${fc.color}`}>{fc.count}</div>
              <div className="text-xs font-medium text-muted-foreground mt-0.5">{fc.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "approved", "rejected"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && pending.length > 0 && (
              <span className="ml-1.5 bg-warning/20 text-warning text-xs px-1.5 py-0.5 rounded-full">{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Milestone Cards */}
      {filteredItems.length === 0 ? (
        <Card className="text-center p-12 flex flex-col items-center">
          <CheckCircle2 className="w-12 h-12 text-success mb-4 opacity-50" />
          <h3 className="text-xl font-bold">All caught up!</h3>
          <p className="text-muted-foreground mt-2">No milestones in this category.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredItems.map((item) => (
            <ApprovalCard key={item.milestone.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ item }: { item: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const aiMutation = useRunSpmoAiValidateEvidence();
  const approveMutation = useApproveSpmoMilestone();
  const rejectMutation = useRejectSpmoMilestone();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/spmo/pending-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/spmo/programme"] });
    queryClient.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
  };

  const handleAI = () => {
    aiMutation.mutate({ data: { milestoneId: item.milestone.id } }, {
      onSuccess: () => toast({ title: "AI Validation Complete" }),
      onError: () => toast({ variant: "destructive", title: "AI Error" }),
    });
  };

  const handleApprove = () => {
    approveMutation.mutate({ id: item.milestone.id, data: {} }, {
      onSuccess: () => {
        toast({ title: "Approved", description: "Milestone has been approved." });
        invalidate();
      },
    });
  };

  const handleReject = () => {
    rejectMutation.mutate({ id: item.milestone.id, data: { reason: "Evidence insufficient" } }, {
      onSuccess: () => {
        toast({ title: "Rejected" });
        invalidate();
      },
    });
  };

  const pillarColor = item.pillar?.color ?? "#2563eb";
  const progress = item.milestone.progress ?? 0;
  const evidenceCount = item.milestone.evidence?.length ?? 0;
  const isApproved = item.milestone.status === "approved";
  const isRejected = item.milestone.status === "rejected";

  return (
    <Card
      noPadding={false}
      className="flex flex-col overflow-hidden"
      style={{ borderLeft: `4px solid ${pillarColor}` }}
    >
      {/* Breadcrumb header */}
      <div className="bg-secondary/40 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
          <span style={{ color: pillarColor }}>{item.pillar?.name}</span>
          <ChevronRight className="w-3 h-3" />
          <span>{item.initiative?.name}</span>
          <ChevronRight className="w-3 h-3" />
          <span>{item.project?.name}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-base">{item.milestone.name}</h3>
          <StatusBadge status={item.milestone.status} />
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span className="font-bold" style={{ color: pillarColor }}>{progress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, backgroundColor: pillarColor }}
            />
          </div>
        </div>

        {/* Status banners */}
        {isApproved && (
          <div className="flex items-center gap-2 bg-success/10 border border-success/20 text-success p-3 rounded-lg text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Approved — milestone complete
          </div>
        )}
        {isRejected && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg text-sm font-semibold">
            <XCircle className="w-4 h-4 shrink-0" />
            Rejected — evidence insufficient
          </div>
        )}

        {/* Evidence */}
        <div>
          <h4 className="text-sm font-bold flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-primary" />
            Evidence ({evidenceCount})
          </h4>
          {evidenceCount === 0 ? (
            <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg border border-destructive/20 font-medium">
              No evidence attached.
            </div>
          ) : (
            <div className="space-y-1.5">
              {item.milestone.evidence.map((ev: any) => (
                <div key={ev.id} className="flex items-center justify-between p-2.5 bg-background border border-border rounded-lg text-sm group hover:border-primary/40 transition-colors">
                  <span className="font-medium truncate flex-1">{ev.fileName}</span>
                  <a
                    href={`/spmo/api/storage/objects/${ev.objectPath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline ml-4 text-xs font-semibold shrink-0"
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
          <div className={`p-4 rounded-xl border ${aiMutation.data.verdict === "strong" ? "bg-success/5 border-success/20" : "bg-warning/5 border-warning/20"}`}>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" />
              AI Validation · Score: <span className="text-foreground">{aiMutation.data.overallScore}/10</span>
              · <span className="capitalize">{aiMutation.data.verdict}</span>
            </h4>
            <p className="text-sm text-foreground/80 leading-relaxed">{aiMutation.data.reasoning}</p>
          </div>
        )}

        {/* Actions */}
        {!isApproved && (
          <div className="mt-auto flex flex-wrap gap-2 pt-3 border-t border-border">
            <button
              onClick={handleAI}
              disabled={aiMutation.isPending || evidenceCount === 0}
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-3 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/80 disabled:opacity-50 transition-colors"
            >
              {aiMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {aiMutation.data ? "Re-validate" : "AI Validate"}
            </button>

            {item.milestone.status === "submitted" && (
              <>
                <button
                  onClick={handleReject}
                  disabled={rejectMutation.isPending}
                  className="flex items-center gap-1.5 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="flex items-center gap-1.5 bg-success text-white px-3 py-2 rounded-lg text-sm font-semibold hover:-translate-y-0.5 transition-transform shadow-sm shadow-success/20 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
