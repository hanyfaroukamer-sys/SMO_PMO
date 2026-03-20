import { useListSpmoActivityLog } from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function ActivityLog() {
  const { data, isLoading } = useListSpmoActivityLog();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Activity Log" description="Comprehensive audit trail of all programme actions." />

      <Card noPadding className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Timestamp</th>
                <th className="px-6 py-4 font-semibold">Actor</th>
                <th className="px-6 py-4 font-semibold">Action</th>
                <th className="px-6 py-4 font-semibold">Entity</th>
                <th className="px-6 py-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-secondary/10 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground/80 whitespace-nowrap">
                    {format(new Date(entry.createdAt), 'MMM d, yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 font-semibold">{entry.actorName || entry.actorId}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={entry.action} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-muted-foreground uppercase">{entry.entityType}</div>
                    <div className="font-medium text-foreground">{entry.entityName}</div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-xs bg-secondary px-2 py-1 rounded border border-border text-muted-foreground">
                      {JSON.stringify(entry.details).slice(0, 50)}...
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.entries.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No activity recorded yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
