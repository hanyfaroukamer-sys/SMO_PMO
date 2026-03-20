import { useListSpmoActivityLog } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function actionDotColor(action: string): string {
  if (action.includes("approve") || action.includes("create")) return "bg-success";
  if (action.includes("reject") || action.includes("delete")) return "bg-destructive";
  if (action.includes("update") || action.includes("submit")) return "bg-primary";
  return "bg-muted-foreground";
}

function actionLabel(action: string): string {
  return action.replace(/_/g, " ").toUpperCase();
}

export default function ActivityLog() {
  const { data, isLoading } = useListSpmoActivityLog();

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
            const detailText = details
              ? Object.entries(details)
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                  .join(", ")
              : "";

            return (
              <div key={entry.id} className="flex items-start gap-4 px-6 py-4 hover:bg-secondary/10 transition-colors">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                  <div className={`w-3 h-3 rounded-full ${dotColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                      {actionLabel(entry.action)}
                    </span>
                    <span className="font-semibold text-sm text-foreground">{entry.entityName}</span>
                    <span className="text-xs text-muted-foreground capitalize">{entry.entityType}</span>
                  </div>
                  {detailText && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{detailText}</p>
                  )}
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
