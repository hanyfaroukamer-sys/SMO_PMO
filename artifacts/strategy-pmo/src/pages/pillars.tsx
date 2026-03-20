import { useListSpmoPillars } from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { Columns, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function Pillars() {
  const { data, isLoading } = useListSpmoPillars();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in">
      <PageHeader 
        title="Strategic Pillars" 
        description="The core foundations of the programme."
      >
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          Add Pillar
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data?.pillars.map((pillar) => (
          <Card key={pillar.id} className="flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: pillar.color }} />
                  {pillar.name}
                </h3>
                <p className="text-muted-foreground text-sm mt-1">{pillar.description || "No description provided."}</p>
              </div>
              <div className="bg-secondary px-3 py-1 rounded-md text-sm font-bold border border-border">
                {pillar.weight}% Weight
              </div>
            </div>
            
            <div className="mt-auto pt-6">
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-muted-foreground">Overall Progress</span>
                <span>{Math.round(pillar.progress)}%</span>
              </div>
              <ProgressBar progress={pillar.progress} showLabel={false} />
              
              <div className="grid grid-cols-4 gap-4 mt-6 pt-4 border-t border-border/50">
                <Stat label="Initiatives" val={pillar.initiativeCount} />
                <Stat label="Projects" val={pillar.projectCount} />
                <Stat label="Milestones" val={pillar.milestoneCount} />
                <Stat label="Approvals" val={pillar.pendingApprovals} alert={pillar.pendingApprovals > 0} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, val, alert }: { label: string, val: number, alert?: boolean }) {
  return (
    <div>
      <div className={`text-xl font-bold ${alert ? 'text-warning' : 'text-foreground'}`}>{val}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
