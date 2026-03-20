import { useListSpmoAlerts } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, AlertTriangle, Info, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export default function Alerts() {
  const { data, isLoading } = useListSpmoAlerts();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in max-w-4xl mx-auto">
      <PageHeader title="System Alerts" description="Dynamic insights and warnings computed from programme data." />

      <div className="space-y-4">
        {data?.alerts.map(alert => {
          let Icon = Info;
          let colorClass = 'bg-secondary text-foreground border-border';
          
          if (alert.severity === 'critical') {
            Icon = AlertCircle;
            colorClass = 'bg-destructive/10 text-destructive border-destructive/20';
          } else if (alert.severity === 'warning') {
            Icon = AlertTriangle;
            colorClass = 'bg-warning/10 text-warning-foreground border-warning/30';
          }

          return (
            <div key={alert.id} className={`p-5 rounded-xl border flex items-start gap-4 transition-all hover:shadow-md ${colorClass}`}>
              <div className="mt-1 bg-background p-2 rounded-lg shadow-sm">
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg">{alert.title}</h3>
                  <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                    {format(new Date(alert.createdAt), 'HH:mm')}
                  </span>
                </div>
                <p className="opacity-90 leading-relaxed mb-3">{alert.description}</p>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="bg-background/50 px-2 py-1 rounded border border-current/10 uppercase tracking-wider">{alert.category}</span>
                  <span className="opacity-70">{alert.entityType}: {alert.entityName}</span>
                </div>
              </div>
            </div>
          )
        })}
        {data?.alerts.length === 0 && (
          <Card className="text-center p-12 text-muted-foreground flex flex-col items-center">
             <CheckCircle2 className="w-12 h-12 text-success mb-4 opacity-50" />
             <p className="text-lg font-medium">All clear! No alerts at this time.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
