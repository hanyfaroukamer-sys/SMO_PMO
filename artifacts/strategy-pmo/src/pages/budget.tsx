import { useListSpmoBudget } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Budget() {
  const { data, isLoading } = useListSpmoBudget();

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  // Prepare chart data grouping by category
  const chartData = data?.entries.reduce((acc: any[], entry) => {
    const existing = acc.find(item => item.name === entry.category);
    if (existing) {
      existing.Allocated += entry.allocated;
      existing.Spent += entry.spent;
    } else {
      acc.push({ name: entry.category, Allocated: entry.allocated, Spent: entry.spent });
    }
    return acc;
  }, []) || [];

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Budget Tracking" description="Financial overview of programme allocations and spend.">
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          Add Entry
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-secondary/20">
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Allocated</div>
          <div className="text-3xl font-display font-bold">{formatCurrency(data?.totalAllocated || 0)}</div>
        </Card>
        <Card className="bg-secondary/20">
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Spent</div>
          <div className="text-3xl font-display font-bold text-primary">{formatCurrency(data?.totalSpent || 0)}</div>
        </Card>
        <Card className={data && data.utilizationPct > 100 ? 'bg-destructive/10 border-destructive/30' : 'bg-secondary/20'}>
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Utilization</div>
          <div className={`text-3xl font-display font-bold ${data && data.utilizationPct > 100 ? 'text-destructive' : ''}`}>
            {data?.utilizationPct.toFixed(1)}%
          </div>
        </Card>
      </div>

      <Card className="h-[400px]">
        <h3 className="font-bold text-lg mb-6">Spend by Category</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
            <YAxis tickFormatter={(val) => `$${val/1000}k`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
            <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar dataKey="Allocated" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Spent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
