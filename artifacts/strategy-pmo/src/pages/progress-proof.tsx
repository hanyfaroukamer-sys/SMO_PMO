import { useState } from "react";
import { useListSpmoPendingApprovals, useRunSpmoAiValidateEvidence, useApproveSpmoMilestone, useRejectSpmoMilestone } from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Loader2, CheckCircle2, XCircle, FileText, Sparkles, FolderArchive, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ProgressProof() {
  const [activeTab, setActiveTab] = useState<'pending'|'all'>('pending');
  const { data, isLoading } = useListSpmoPendingApprovals();
  
  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Progress Proof Centre" description="Review evidence and approve milestone completions." />

      <div className="flex space-x-1 bg-secondary/50 p-1 rounded-xl w-fit border border-border">
        <button 
          className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${activeTab === 'pending' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending Approvals {data?.items && data.items.length > 0 && <span className="ml-2 bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full text-xs">{data.items.length}</span>}
        </button>
        <button 
          className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${activeTab === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('all')}
        >
          All Milestones
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : activeTab === 'pending' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {data?.items.length === 0 ? (
            <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl flex flex-col items-center">
              <CheckCircle2 className="w-12 h-12 text-success mb-4 opacity-50" />
              <h3 className="text-xl font-bold">All caught up!</h3>
              <p className="text-muted-foreground mt-2">There are no milestones awaiting approval.</p>
            </div>
          ) : (
            data?.items.map((item) => (
              <ApprovalCard key={item.milestone.id} item={item} />
            ))
          )}
        </div>
      ) : (
        <Card>
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
            <FolderArchive className="w-12 h-12 mb-4 opacity-20" />
            <p>Milestone search table would render here.</p>
          </div>
        </Card>
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

  const handleAI = () => {
    aiMutation.mutate({ data: { milestoneId: item.milestone.id } }, {
      onSuccess: () => {
        toast({ title: "AI Validation Complete", description: "Evidence has been analyzed." });
      },
      onError: () => toast({ variant: "destructive", title: "AI Error", description: "Failed to run validation." })
    });
  };

  const handleApprove = () => {
    approveMutation.mutate({ id: item.milestone.id, data: {} }, {
      onSuccess: () => {
        toast({ title: "Approved", description: "Milestone has been approved." });
        queryClient.invalidateQueries({ queryKey: ['/api/spmo/pending-approvals'] });
        queryClient.invalidateQueries({ queryKey: ['/api/spmo/programme'] });
      }
    });
  };

  return (
    <Card className="flex flex-col overflow-hidden border-warning/30 shadow-md">
      <div className="bg-secondary/40 p-4 border-b border-border flex justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            <span className="truncate max-w-[120px]" title={item.pillar.name}>{item.pillar.name}</span>
            <ArrowRight className="w-3 h-3" />
            <span className="truncate max-w-[120px]" title={item.project.name}>{item.project.name}</span>
          </div>
          <h3 className="text-lg font-bold leading-tight">{item.milestone.name}</h3>
        </div>
        <StatusBadge status={item.milestone.status} />
      </div>
      
      <div className="p-5 flex-1 flex flex-col">
        <div className="mb-6">
          <h4 className="text-sm font-bold flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" /> Attached Evidence ({item.milestone.evidence.length})
          </h4>
          <div className="space-y-2">
            {item.milestone.evidence.map((ev: any) => (
              <div key={ev.id} className="flex items-center justify-between p-3 bg-background border border-border rounded-lg text-sm group hover:border-primary/40 transition-colors">
                <span className="font-medium truncate flex-1">{ev.fileName}</span>
                <a href={`/api/storage/objects/${ev.objectPath}`} target="_blank" rel="noreferrer" className="text-primary hover:underline ml-4 text-xs font-semibold">View</a>
              </div>
            ))}
            {item.milestone.evidence.length === 0 && (
              <div className="text-sm text-destructive p-3 bg-destructive/10 rounded border border-destructive/20 font-medium">No evidence attached.</div>
            )}
          </div>
        </div>

        {/* AI Results */}
        {aiMutation.data && (
          <div className={`mb-6 p-4 rounded-xl border ${aiMutation.data.verdict === 'strong' ? 'bg-success/5 border-success/20' : 'bg-warning/5 border-warning/20'}`}>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> AI Validation Result: <span className="capitalize text-foreground">{aiMutation.data.verdict}</span>
            </h4>
            <p className="text-sm text-foreground/80 leading-relaxed mb-3">{aiMutation.data.reasoning}</p>
            <div className="w-full bg-background rounded-full h-2 border border-border/50 overflow-hidden">
              <div className="bg-primary h-full" style={{ width: `${aiMutation.data.overallScore}%`}} />
            </div>
            <div className="text-right text-xs font-bold mt-1 text-muted-foreground">Confidence: {aiMutation.data.overallScore}%</div>
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-3 pt-4 border-t border-border">
          <button 
            onClick={handleAI}
            disabled={aiMutation.isPending || item.milestone.evidence.length === 0}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-secondary text-secondary-foreground px-4 py-2.5 rounded-lg font-semibold border border-border hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            {aiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} 
            {aiMutation.data ? "Re-run AI" : "AI Validate"}
          </button>
          <button 
            onClick={() => rejectMutation.mutate({ id: item.milestone.id, data: { reason: "Incomplete evidence" } })}
            disabled={rejectMutation.isPending}
            className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2.5 rounded-lg font-semibold hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <XCircle className="w-4 h-4" /> Reject
          </button>
          <button 
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-success text-success-foreground shadow-lg shadow-success/20 px-4 py-2.5 rounded-lg font-semibold hover:-translate-y-0.5 transition-transform"
          >
            <CheckCircle2 className="w-4 h-4" /> Approve
          </button>
        </div>
      </div>
    </Card>
  );
}
