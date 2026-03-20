import { useListSpmoProjects } from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Loader2, Plus, Wallet } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

export default function Projects() {
  const { data, isLoading } = useListSpmoProjects();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Projects" description="Detailed project tracking and budget utilization.">
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {data?.projects.map((proj) => {
          const utilPct = proj.budget ? (proj.budgetSpent / proj.budget) * 100 : 0;
          return (
            <Card key={proj.id} className="hover:shadow-md transition-shadow group flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <StatusBadge status={proj.status} />
                <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-1 rounded">
                  {proj.milestoneCount} Milestones
                </span>
              </div>
              
              <h3 className="text-xl font-bold leading-tight mb-2 group-hover:text-primary transition-colors">{proj.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-6 flex-1">{proj.description}</p>
              
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5 uppercase tracking-wider text-muted-foreground">
                    <span>Progress</span>
                  </div>
                  <ProgressBar progress={proj.progress} />
                </div>

                <div className="bg-secondary/40 p-3 rounded-lg border border-border">
                  <div className="flex justify-between text-xs font-bold mb-2 text-foreground flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-primary" /> Budget Utilization
                  </div>
                  <div className="w-full h-1.5 bg-background rounded-full overflow-hidden mb-2 border border-border/50">
                    <div 
                      className={`h-full ${utilPct > 100 ? 'bg-destructive' : utilPct > 80 ? 'bg-warning' : 'bg-success'}`}
                      style={{ width: `${Math.min(100, utilPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{formatCurrency(proj.budgetSpent)}</span>
                    <span className="text-muted-foreground">of {formatCurrency(proj.budget)}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
