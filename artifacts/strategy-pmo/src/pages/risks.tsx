import { useListSpmoRisks } from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Loader2, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

export default function Risks() {
  const { data, isLoading } = useListSpmoRisks();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Risk Register" description="Identify, assess, and mitigate programme risks.">
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          Log New Risk
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-1 bg-secondary/20">
           <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Risk Matrix</h3>
           <div className="aspect-square bg-background border border-border rounded-xl relative p-4 flex items-center justify-center text-muted-foreground text-sm font-medium">
             [Matrix Heatmap Visualization]
           </div>
        </Card>
        <div className="lg:col-span-2">
           <Card noPadding className="h-full overflow-hidden">
             <div className="p-4 border-b border-border bg-secondary/50 font-bold">Top Risks by Score</div>
             <div className="divide-y divide-border">
               {data?.risks.slice(0,5).map(risk => (
                 <div key={risk.id} className="p-4 flex items-center justify-between hover:bg-secondary/10">
                   <div className="flex-1 pr-4">
                     <h4 className="font-semibold text-foreground">{risk.title}</h4>
                     <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{risk.description}</p>
                   </div>
                   <div className="flex items-center gap-4 shrink-0">
                     <div className="text-right">
                       <div className="text-xl font-display font-bold text-destructive">{risk.riskScore}</div>
                       <div className="text-[10px] uppercase font-bold text-muted-foreground">Score</div>
                     </div>
                     <StatusBadge status={risk.status} />
                   </div>
                 </div>
               ))}
               {data?.risks.length === 0 && <div className="p-8 text-center text-muted-foreground">No risks logged.</div>}
             </div>
           </Card>
        </div>
      </div>
    </div>
  );
}
