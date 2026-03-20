import { useListSpmoInitiatives } from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Loader2, Plus, Filter } from "lucide-react";
import { format } from "date-fns";

export default function Initiatives() {
  const { data, isLoading } = useListSpmoInitiatives();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Initiatives" description="Manage and track strategic initiatives.">
        <button className="flex items-center gap-2 bg-secondary text-secondary-foreground border border-border px-4 py-2 rounded-lg font-semibold hover:bg-secondary/80 transition-colors">
          <Filter className="w-4 h-4" /> Filter
        </button>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> New Initiative
        </button>
      </PageHeader>

      <Card noPadding className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Initiative Name</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold w-64">Progress</th>
                <th className="px-6 py-4 font-semibold">Owner</th>
                <th className="px-6 py-4 font-semibold">Target Date</th>
                <th className="px-6 py-4 font-semibold text-right">Projects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.initiatives.map((init) => (
                <tr key={init.id} className="hover:bg-secondary/20 transition-colors cursor-pointer group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{init.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 truncate max-w-xs">{init.description}</div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={init.status} />
                  </td>
                  <td className="px-6 py-4">
                    <ProgressBar progress={init.progress} className="w-full" />
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground/80">{init.ownerName || 'Unassigned'}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {init.targetDate ? format(new Date(init.targetDate), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-bold">{init.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.initiatives.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No initiatives found.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
