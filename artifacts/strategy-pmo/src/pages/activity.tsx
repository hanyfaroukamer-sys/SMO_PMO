import { useListSpmoActivityLog } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, FileText, ShieldCheck } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useIsAdmin } from "@/hooks/use-is-admin";

function actionDotColor(action: string): string {
  if (action.includes("approve")) return "bg-success";
  if (action.includes("delete")) return "bg-destructive";
  if (action === "weekly_report_submitted") return "bg-violet-500";
  return "bg-primary";
}

function actionLabel(action: string): string {
  if (action === "weekly_report_submitted") return "Weekly Report";
  return action.replace(/_/g, " ").toUpperCase();
}

export default function ActivityLog() {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useListSpmoActivityLog();

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to view the activity log.</p>
      </div>
    );
  }

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Activity Log" description="Comprehensive audit trail of all programme actions — last 50 entries." />

      <Card noPadding className="overflow-hidden">
        <div className="divide-y divide-border">
          {entries.map((entry) => {
            const dotColor = actionDotColor(entry.action);
            const details = entry.details as Record<string, unknown> | null;
            const isWeeklyReport = entry.action === "weekly_report_submitted";
            const weekStart = details?.weekStart as string | undefined;
            const keyAchievements = details?.keyAchievements as string | undefined;
            const nextSteps = details?.nextSteps as string | undefined;

            const detailText = !isWeeklyReport && details
              ? Object.entries(details)
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                  .join(", ")
              : "";

            return (
              <div key={entry.id} className="flex items-start gap-4 px-6 py-4 hover:bg-secondary/10 transition-colors">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                  {isWeeklyReport ? (
                    <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-violet-500" />
                    </div>
                  ) : (
                    <div className={`w-3 h-3 rounded-full ${dotColor}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isWeeklyReport ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "text-muted-foreground bg-secondary"}`}>
                      {actionLabel(entry.action)}
                    </span>
                    <span className="font-semibold text-sm text-foreground">{entry.entityName}</span>
                    {!isWeeklyReport && (
                      <span className="text-xs text-muted-foreground capitalize">{entry.entityType}</span>
                    )}
                    {isWeeklyReport && weekStart && (
                      <span className="text-xs text-muted-foreground">
                        · week of {format(new Date(weekStart + "T00:00:00"), "d MMM yyyy")}
                      </span>
                    )}
                  </div>

                  {isWeeklyReport && (keyAchievements || nextSteps) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                      {keyAchievements && (
                        <div className="rounded-md bg-secondary/40 px-3 py-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Key Achievements</div>
                          <p className="text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">{keyAchievements}</p>
                        </div>
                      )}
                      {nextSteps && (
                        <div className="rounded-md bg-secondary/40 px-3 py-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Next Steps</div>
                          <p className="text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">{nextSteps}</p>
                        </div>
                      )}
                    </div>
                  ) : detailText ? (
                    <p className="text-xs text-muted-foreground line-clamp-1">{detailText}</p>
                  ) : null}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-foreground/80">{entry.actorName || entry.actorId}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            );
          })}

          {entries.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              No activity recorded yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
