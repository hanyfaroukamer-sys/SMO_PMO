import { useState } from "react";
import { useListSpmoKpis } from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Loader2, TrendingUp, Target as TargetIcon } from "lucide-react";

export default function KPIs() {
  const [type, setType] = useState<'strategic'|'operational'>('strategic');
  const { data, isLoading } = useListSpmoKpis({ type });

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Key Performance Indicators" description="Track strategic and operational metrics.">
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          Add KPI
        </button>
      </PageHeader>

      <div className="flex space-x-1 bg-secondary/50 p-1 rounded-xl w-fit border border-border mb-8">
        <button 
          className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${type === 'strategic' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setType('strategic')}
        >
          Strategic KPIs
        </button>
        <button 
          className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${type === 'operational' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setType('operational')}
        >
          Operational KPIs
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {data?.kpis.map(kpi => {
            const progress = Math.min(100, (kpi.actual / kpi.target) * 100);
            return (
              <Card key={kpi.id} className="relative overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 p-4">
                  <StatusBadge status={kpi.status} />
                </div>
                <div className="mb-6 mt-2">
                  <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-4">
                    {type === 'strategic' ? <TrendingUp className="w-5 h-5" /> : <TargetIcon className="w-5 h-5" />}
                  </div>
                  <h3 className="font-bold text-lg leading-tight pr-20">{kpi.name}</h3>
                </div>
                
                <div className="mt-auto">
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-3xl font-display font-bold tracking-tight">{kpi.actual}</span>
                    <span className="text-muted-foreground font-medium pb-1">/ {kpi.target} {kpi.unit}</span>
                  </div>
                  
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/50">
                    <div 
                      className={`h-full ${kpi.status === 'on_track' ? 'bg-success' : kpi.status === 'at_risk' ? 'bg-warning' : 'bg-destructive'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
          {data?.kpis.length === 0 && (
            <div className="col-span-full p-12 text-center text-muted-foreground">No KPIs defined for this view.</div>
          )}
        </div>
      )}
    </div>
  );
}
