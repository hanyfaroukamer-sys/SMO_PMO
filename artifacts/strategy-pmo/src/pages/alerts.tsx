import { useListSpmoAlerts } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, AlertTriangle, Info, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    border: "border-l-4 border-l-destructive",
    badge: "bg-destructive/10 text-destructive border border-destructive/20",
    iconColor: "text-destructive",
    bg: "",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-l-4 border-l-warning",
    badge: "bg-warning/10 text-warning-foreground border border-warning/20",
    iconColor: "text-warning",
    bg: "",
  },
  info: {
    icon: Info,
    border: "border-l-4 border-l-primary",
    badge: "bg-primary/10 text-primary border border-primary/20",
    iconColor: "text-primary",
    bg: "",
  },
} as const;

export default function Alerts() {
  const { data, isLoading } = useListSpmoAlerts();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const alerts = data?.alerts ?? [];
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warnings = alerts.filter((a) => a.severity === "warning").length;

  return (
    <div className="space-y-6 animate-in fade-in max-w-4xl mx-auto">
      <PageHeader title="Smart Alerts" description="Dynamic insights and warnings computed automatically from programme data." />

      {/* Summary row */}
      {alerts.length > 0 && (
        <div className="flex gap-4 text-sm">
          {critical > 0 && (
            <span className="flex items-center gap-1.5 bg-destructive/10 text-destructive px-3 py-1.5 rounded-full font-semibold border border-destructive/20">
              <AlertCircle className="w-3.5 h-3.5" /> {critical} Critical
            </span>
          )}
          {warnings > 0 && (
            <span className="flex items-center gap-1.5 bg-warning/10 text-warning-foreground px-3 py-1.5 rounded-full font-semibold border border-warning/20">
              <AlertTriangle className="w-3.5 h-3.5" /> {warnings} Warning
            </span>
          )}
        </div>
      )}

      <div className="space-y-3">
        {alerts.map((alert) => {
          const severity = (alert.severity ?? "info") as "critical" | "warning" | "info";
          const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
          const Icon = config.icon;

          return (
            <Card key={alert.id} noPadding={false} className={`${config.border} hover:shadow-md transition-all`}>
              <div className="flex items-start gap-4">
                <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-secondary`}>
                  <Icon className={`w-5 h-5 ${config.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-bold text-base">{alert.title}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${config.badge}`}>
                        {severity}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(alert.createdAt), "HH:mm")}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed mb-2">{alert.description}</p>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span className="bg-secondary px-2 py-0.5 rounded border border-border uppercase tracking-wider">
                      {alert.category}
                    </span>
                    <span>·</span>
                    <span>{alert.entityType}: {alert.entityName}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {alerts.length === 0 && (
          <Card className="text-center p-12 flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 text-success mb-4 opacity-50" />
            <p className="text-lg font-medium">All clear!</p>
            <p className="text-muted-foreground text-sm mt-1">No alerts at this time. Programme is healthy.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
