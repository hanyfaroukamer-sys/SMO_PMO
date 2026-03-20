import { useGetSpmoOverview, useListSpmoAlerts, useRunSpmoAiAssessment } from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Target, FolderOpen, AlertTriangle, Wallet, Sparkles, AlertCircle, Loader2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data, isLoading, error } = useGetSpmoOverview();
  const { data: alertsData } = useListSpmoAlerts();
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const aiMutation = useRunSpmoAiAssessment();

  const handleRunAi = () => {
    setIsAiModalOpen(true);
    if (!aiMutation.data) {
      aiMutation.mutate();
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error || !data) return <div className="p-8 text-destructive">Failed to load dashboard data.</div>;

  const criticalAlerts = alertsData?.alerts.filter((a) => a.severity === "critical") ?? [];
  const totalProjects = data.pillarSummaries.reduce((s, p) => s + p.projectCount, 0);
  const onTrackProjects = data.pillarSummaries.reduce((s, p) => s + (p.projectCount - p.pendingApprovals), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Programme Dashboard"
        description={`Weighted progress cascade — last updated ${format(new Date(data.lastUpdated), "MMM d, yyyy HH:mm")}`}
      >
        <button
          onClick={handleRunAi}
          className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-2.5 rounded-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          AI Assessment
        </button>
      </PageHeader>

      {/* Critical alerts banner */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-4 bg-destructive/10 border border-destructive/30 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <div className="flex-1 text-sm font-medium text-destructive">
            {criticalAlerts.length} critical alert{criticalAlerts.length > 1 ? "s" : ""} require immediate attention.
          </div>
          <Link href="/alerts" className="flex items-center gap-1 text-sm font-semibold text-destructive hover:underline shrink-0">
            View Alerts <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <SummaryCard
          icon={Target}
          label="Strategy Progress"
          value={`${Math.round(data.programmeProgress)}%`}
          sub="Weighted cascade"
          color="text-primary"
          bg="bg-primary/10"
        />
        <SummaryCard
          icon={Sparkles}
          label="Initiatives"
          value={String(data.pillarSummaries.reduce((s, p) => s + p.initiativeCount, 0))}
          sub={`${data.pillarSummaries.length} pillars`}
          color="text-violet-600"
          bg="bg-violet-100"
        />
        <SummaryCard
          icon={FolderOpen}
          label="Projects"
          value={String(totalProjects)}
          sub={`${onTrackProjects} on track`}
          color="text-success"
          bg="bg-success/10"
        />
        <SummaryCard
          icon={Wallet}
          label="Pending Approvals"
          value={String(data.pendingApprovals)}
          sub={`${data.totalMilestones} milestones total`}
          color="text-warning"
          bg="bg-warning/10"
        />
      </div>

      {/* Pillar Progress */}
      <div>
        <h2 className="text-xl font-display font-bold mb-5">Pillar Progress</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-5">
          {data.pillarSummaries.map((pillar) => (
            <Card key={pillar.id} className="hover:border-primary/30 transition-colors relative overflow-hidden" noPadding={false}>
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: pillar.color }} />
              <div className="pl-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: pillar.color }}>
                      Pillar
                    </div>
                    <h3 className="font-bold text-base leading-tight">{pillar.name}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-display font-bold" style={{ color: pillar.color }}>
                      {Math.round(pillar.progress)}%
                    </div>
                    <div className="text-xs text-muted-foreground">{pillar.weight}% weight</div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, pillar.progress)}%`, backgroundColor: pillar.color }}
                    />
                  </div>
                </div>

                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="font-bold text-base">{pillar.initiativeCount}</span>{" "}
                    <span className="text-muted-foreground">initiatives</span>
                  </div>
                  <div>
                    <span className="font-bold text-base">{pillar.projectCount}</span>{" "}
                    <span className="text-muted-foreground">projects</span>
                  </div>
                  {pillar.pendingApprovals > 0 && (
                    <div>
                      <span className="font-bold text-base text-warning">{pillar.pendingApprovals}</span>{" "}
                      <span className="text-muted-foreground">pending</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Initiative Progress */}
      <div>
        <h2 className="text-xl font-display font-bold mb-5">Initiative Progress</h2>
        <Card noPadding className="overflow-hidden">
          <div className="divide-y divide-border">
            {data.pillarSummaries.flatMap((pillar) =>
              Array.from({ length: pillar.initiativeCount }, (_, i) => ({
                pillarName: pillar.name,
                pillarColor: pillar.color,
                index: i,
                pillarProgress: pillar.progress,
              }))
            ).slice(0, 0).map(() => null)}
            {data.pillarSummaries.map((pillar) =>
              pillar.initiativeCount > 0 ? (
                <div key={pillar.id} className="p-4 flex items-center gap-4">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: pillar.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{pillar.name}</span>
                      <span className="text-sm font-bold" style={{ color: pillar.color }}>
                        {Math.round(pillar.progress)}%
                      </span>
                    </div>
                    <ProgressBar progress={pillar.progress} />
                    <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{pillar.initiativeCount} initiatives</span>
                      <span>{pillar.approvedMilestones}/{pillar.milestoneCount} milestones</span>
                    </div>
                  </div>
                </div>
              ) : null
            )}
          </div>
        </Card>
      </div>

      {/* AI Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-center bg-gradient-to-r from-violet-600/10 to-primary/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-violet-600" />
                </div>
                <h2 className="text-2xl font-display font-bold">AI Programme Assessment</h2>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {aiMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-lg font-medium text-muted-foreground animate-pulse">Claude is analyzing your programme...</p>
                </div>
              )}
              {aiMutation.isError && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
                  Assessment failed. Please try again.
                </div>
              )}
              {aiMutation.isSuccess && aiMutation.data && (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 bg-secondary/20 rounded-xl border border-border">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Overall Health</h4>
                      <StatusBadge status={aiMutation.data.overallHealth} className="text-base px-4 py-1.5" />
                    </div>
                    <div className="flex-1 text-sm leading-relaxed text-foreground/80">{aiMutation.data.summary}</div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-warning" /> Key Risk Flags
                    </h3>
                    <ul className="space-y-2">
                      {aiMutation.data.riskFlags.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 bg-destructive/5 text-destructive p-3 rounded-lg border border-destructive/10 text-sm">
                          <span className="mt-0.5 shrink-0">•</span>{risk}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                      <Target className="w-5 h-5 text-success" /> Strategic Recommendations
                    </h3>
                    <ul className="space-y-2">
                      {aiMutation.data.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 bg-success/5 p-3 rounded-lg border border-success/10 text-sm font-medium">
                          <span className="mt-0.5 shrink-0 text-success">→</span>
                          <span className="text-foreground">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end bg-secondary/20">
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <Card className="hover:-translate-y-1 transition-transform duration-300">
      <div className="flex items-center gap-4 mb-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <span className="text-4xl font-display font-bold tracking-tight">{value}</span>
      </div>
      <div className="font-semibold text-sm text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </Card>
  );
}
