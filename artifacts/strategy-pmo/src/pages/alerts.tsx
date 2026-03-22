import { useListSpmoAlerts, type SpmoAlert } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, AlertTriangle, Info, AlertCircle, CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Link } from "wouter";

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    border: "border-l-4 border-l-destructive",
    badge: "bg-destructive/10 text-destructive border border-destructive/20",
    iconColor: "text-white",
    iconBg: "bg-gradient-to-br from-red-500 to-red-600",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-l-4 border-l-warning",
    badge: "bg-warning/10 text-warning-foreground border border-warning/20",
    iconColor: "text-white",
    iconBg: "bg-gradient-to-br from-amber-400 to-amber-600",
  },
  info: {
    icon: Info,
    border: "border-l-4 border-l-primary",
    badge: "bg-primary/10 text-primary border border-primary/20",
    iconColor: "text-white",
    iconBg: "bg-gradient-to-br from-blue-500 to-blue-700",
  },
} as const;

function getAlertLink(alert: SpmoAlert): string {
  switch (alert.entityType) {
    case "kpi":
      return "/kpis";
    case "risk":
      return "/risks";
    case "project":
      return alert.entityId ? `/projects?project=${alert.entityId}` : "/projects";
    case "milestone":
      return alert.projectId
        ? `/projects?project=${alert.projectId}&milestone=${alert.entityId}`
        : "/projects";
    case "pillar":
      return "/pillars";
    case "initiative":
      return "/initiatives";
    case "programme":
      return alert.category === "budget" ? "/budget" : "/";
    default:
      return "/";
  }
}

function getAlertLinkLabel(entityType: string): string {
  switch (entityType) {
    case "kpi":        return "View KPIs";
    case "risk":       return "View Risks";
    case "project":    return "View Project";
    case "milestone":  return "View Project";
    case "pillar":     return "View Pillars";
    case "initiative": return "View Initiatives";
    case "programme":  return "View Budget";
    default:           return "View";
  }
}

export default function Alerts() {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useListSpmoAlerts();

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to view alerts.</p>
      </div>
    );
  }

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
          const href = getAlertLink(alert);
          const linkLabel = getAlertLinkLabel(alert.entityType);

          return (
            <Card key={alert.id} noPadding={false} className={`${config.border} hover:shadow-md transition-all`}>
              <div className="flex items-start gap-4">
                <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${config.iconBg}`}>
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
                  <p className="text-sm text-foreground/80 leading-relaxed mb-3">{alert.description}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <span className="bg-secondary px-2 py-0.5 rounded border border-border uppercase tracking-wider">
                        {alert.category}
                      </span>
                      <span>·</span>
                      <span>{alert.entityType}: {alert.entityName}</span>
                    </div>
                    <Link
                      href={href}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shrink-0
                        ${severity === "critical"
                          ? "border-destructive/30 text-destructive bg-destructive/5 hover:bg-destructive/15"
                          : severity === "warning"
                          ? "border-warning/30 text-warning-foreground bg-warning/5 hover:bg-warning/15"
                          : "border-primary/30 text-primary bg-primary/5 hover:bg-primary/15"
                        }`}
                    >
                      {linkLabel} <ArrowRight className="w-3 h-3" />
                    </Link>
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
