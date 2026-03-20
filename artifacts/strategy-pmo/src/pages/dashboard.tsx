import { useGetSpmoOverview, useRunSpmoAiAssessment } from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Target, CheckCircle2, Clock, ShieldAlert, Sparkles, AlertCircle, Activity, Loader2, Columns } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

export default function Dashboard() {
  const { data, isLoading, error } = useGetSpmoOverview();
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader 
        title="Programme Dashboard" 
        description={`Last updated: ${format(new Date(data.lastUpdated), 'MMM d, yyyy HH:mm')}`}
      >
        <button 
          onClick={handleRunAi}
          className="flex items-center gap-2 bg-gradient-to-r from-accent to-primary text-primary-foreground px-5 py-2.5 rounded-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all active:translate-y-0"
        >
          <Sparkles className="w-4 h-4" />
          Run AI Assessment
        </button>
      </PageHeader>

      {/* Top Section - Circular Progress & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-card to-secondary/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent" />
          <h3 className="text-lg font-display font-semibold mb-6">Overall Health</h3>
          <div className="relative w-40 h-40 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-secondary" />
              <circle 
                cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" 
                className="text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)] transition-all duration-1000 ease-out"
                strokeDasharray="251.2" 
                strokeDashoffset={251.2 - (251.2 * data.programmeProgress) / 100}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold font-display tracking-tighter text-foreground">{Math.round(data.programmeProgress)}%</span>
            </div>
          </div>
        </Card>

        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Target} label="Total Milestones" value={data.totalMilestones} color="text-primary" bg="bg-primary/10" />
          <StatCard icon={CheckCircle2} label="Approved" value={data.approvedMilestones} color="text-success" bg="bg-success/10" />
          <StatCard icon={Clock} label="Pending Approvals" value={data.pendingApprovals} color="text-warning" bg="bg-warning/10" />
          <StatCard icon={ShieldAlert} label="Active Risks" value={data.activeRisks} color="text-destructive" bg="bg-destructive/10" />
          {data.alertCount > 0 && (
            <StatCard icon={AlertCircle} label="System Alerts" value={data.alertCount} color="text-destructive" bg="bg-destructive/10" />
          )}
        </div>
      </div>

      {/* Pillars Grid */}
      <div>
        <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Columns className="w-6 h-6 text-muted-foreground" /> 
          Strategic Pillars
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.pillarSummaries.map((pillar, i) => (
            <Card key={pillar.id} className="hover:border-primary/30 transition-colors group relative overflow-hidden" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
              <div className="flex items-start justify-between mb-4 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-5 h-5" style={{ color: pillar.color }} />
                    <h3 className="font-bold text-lg leading-tight">{pillar.name}</h3>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded">Weight: {pillar.weight}%</span>
                </div>
              </div>
              
              <div className="space-y-4 relative z-10">
                <ProgressBar progress={pillar.progress} />
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold">{pillar.initiativeCount}</span>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Initiatives</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold">{pillar.projectCount}</span>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Projects</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold">{pillar.pendingApprovals}</span>
                    <span className="text-xs text-warning font-medium uppercase tracking-wider">Pending</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* AI Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold">AI Programme Assessment</h2>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
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
                    <div className="flex-2 text-sm leading-relaxed text-foreground/80">
                      {aiMutation.data.summary}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-warning" /> Key Risk Flags
                    </h3>
                    <ul className="space-y-2">
                      {aiMutation.data.riskFlags.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 bg-destructive/5 text-destructive p-3 rounded-lg border border-destructive/10 text-sm">
                          <span className="mt-0.5 shrink-0">•</span>
                          {risk}
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
                        <li key={i} className="flex items-start gap-2 bg-success/5 text-success-foreground p-3 rounded-lg border border-success/10 text-sm font-medium">
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
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: any) {
  return (
    <Card className="flex flex-col justify-center p-6 hover:-translate-y-1 transition-transform duration-300">
      <div className="flex items-center gap-4 mb-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <span className="text-4xl font-display font-bold tracking-tight">{value}</span>
      </div>
      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    </Card>
  );
}
