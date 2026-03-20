import { useState } from "react";
import {
  useListSpmoBudget,
  useCreateSpmoBudgetEntry,
  useUpdateSpmoBudgetEntry,
  useDeleteSpmoBudgetEntry,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const CATEGORIES = [
  "Personnel", "Technology", "Infrastructure", "Consulting",
  "Training", "Procurement", "Operations", "Contingency", "Other",
];

type EntryForm = {
  category: string;
  allocated: string;
  spent: string;
  description: string;
  fiscalYear: string;
  fiscalQuarter: string;
};

const emptyForm = (): EntryForm => ({
  category: "Technology",
  allocated: "",
  spent: "0",
  description: "",
  fiscalYear: String(new Date().getFullYear()),
  fiscalQuarter: String(Math.ceil((new Date().getMonth() + 1) / 3)),
});

export default function Budget() {
  const { data, isLoading } = useListSpmoBudget();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoBudgetEntry();
  const updateMutation = useUpdateSpmoBudgetEntry();
  const deleteMutation = useDeleteSpmoBudgetEntry();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/spmo/budget"] });

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(entry: NonNullable<typeof data>["entries"][number]) {
    setEditId(entry.id);
    setForm({
      category: entry.category,
      allocated: String(entry.allocated),
      spent: String(entry.spent),
      description: entry.description ?? "",
      fiscalYear: String(entry.fiscalYear ?? new Date().getFullYear()),
      fiscalQuarter: String(entry.fiscalQuarter ?? ""),
    });
    setModalOpen(true);
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this budget entry?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Entry removed" });
        invalidate();
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      category: form.category,
      allocated: parseFloat(form.allocated) || 0,
      spent: parseFloat(form.spent) || 0,
      description: form.description || null,
      fiscalYear: parseInt(form.fiscalYear) || null,
      fiscalQuarter: form.fiscalQuarter ? parseInt(form.fiscalQuarter) : null,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Entry updated" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update entry." }),
      });
    } else {
      createMutation.mutate({ data: payload as never }, {
        onSuccess: () => {
          toast({ title: "Entry added", description: `${form.category} budget entry created.` });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to add entry." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const chartData =
    data?.entries.reduce((acc: Array<{ name: string; Allocated: number; Spent: number }>, entry) => {
      const existing = acc.find((item) => item.name === entry.category);
      if (existing) {
        existing.Allocated += entry.allocated;
        existing.Spent += entry.spent;
      } else {
        acc.push({ name: entry.category, Allocated: entry.allocated, Spent: entry.spent });
      }
      return acc;
    }, []) ?? [];

  const utilizationPct = data?.utilizationPct ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Budget Tracking" description="Financial overview of programme allocations and spend.">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Entry
        </button>
      </PageHeader>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-secondary/20">
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Allocated</div>
          <div className="text-3xl font-display font-bold">{formatCurrency(data?.totalAllocated ?? 0)}</div>
        </Card>
        <Card className="bg-secondary/20">
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Spent</div>
          <div className="text-3xl font-display font-bold text-primary">{formatCurrency(data?.totalSpent ?? 0)}</div>
        </Card>
        <Card className={utilizationPct > 100 ? "bg-destructive/10 border-destructive/30" : "bg-secondary/20"}>
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Utilization</div>
          <div className={`text-3xl font-display font-bold ${utilizationPct > 100 ? "text-destructive" : ""}`}>
            {utilizationPct.toFixed(1)}%
          </div>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card style={{ height: 380 }}>
          <h3 className="font-bold text-lg mb-6">Spend by Category</h3>
          <ResponsiveContainer width="100%" height="88%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b7280" }} dy={10} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip
                cursor={{ fill: "#f3f4f6" }}
                formatter={(val: number) => formatCurrency(val)}
                contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
              />
              <Legend wrapperStyle={{ paddingTop: "20px" }} />
              <Bar dataKey="Allocated" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Spent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Entries table */}
      <Card noPadding className="overflow-hidden">
        <div className="p-4 border-b border-border bg-secondary/50 flex items-center justify-between">
          <h3 className="font-bold">All Budget Entries</h3>
          <span className="text-sm text-muted-foreground">{data?.entries.length ?? 0} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/30 border-b border-border">
              <tr>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold text-right">Allocated</th>
                <th className="px-5 py-3 font-semibold text-right">Spent</th>
                <th className="px-5 py-3 font-semibold text-right">Remaining</th>
                <th className="px-5 py-3 font-semibold text-center">FY / Q</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.entries.map((entry) => {
                const remaining = entry.allocated - entry.spent;
                return (
                  <tr key={entry.id} className="hover:bg-secondary/20 transition-colors group">
                    <td className="px-5 py-3 font-semibold">{entry.category}</td>
                    <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{entry.description || "—"}</td>
                    <td className="px-5 py-3 text-right font-mono">{formatCurrency(entry.allocated)}</td>
                    <td className="px-5 py-3 text-right font-mono">{formatCurrency(entry.spent)}</td>
                    <td className={`px-5 py-3 text-right font-mono font-bold ${remaining < 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(remaining)}
                    </td>
                    <td className="px-5 py-3 text-center text-muted-foreground">
                      {entry.fiscalYear ? `FY${entry.fiscalYear}${entry.fiscalQuarter ? ` Q${entry.fiscalQuarter}` : ""}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => openEdit(entry)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data?.entries.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No budget entries yet. Click "Add Entry" to create one.</div>
          )}
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Budget Entry" : "New Budget Entry"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Category" required>
            <select
              className={selectClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          <FormField label="Description">
            <input
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Cloud infrastructure licences Q1"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Allocated (USD)" required>
              <input
                type="number"
                className={inputClass}
                value={form.allocated}
                onChange={(e) => setForm({ ...form, allocated: e.target.value })}
                placeholder="0"
                min="0"
                step="any"
                required
              />
            </FormField>
            <FormField label="Spent (USD)">
              <input
                type="number"
                className={inputClass}
                value={form.spent}
                onChange={(e) => setForm({ ...form, spent: e.target.value })}
                placeholder="0"
                min="0"
                step="any"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fiscal Year">
              <input
                type="number"
                className={inputClass}
                value={form.fiscalYear}
                onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })}
                placeholder="2026"
                min="2000"
                max="2100"
              />
            </FormField>
            <FormField label="Fiscal Quarter">
              <select className={selectClass} value={form.fiscalQuarter} onChange={(e) => setForm({ ...form, fiscalQuarter: e.target.value })}>
                <option value="">—</option>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </FormField>
          </div>

          <FormActions loading={isSaving} label={editId ? "Update Entry" : "Add Entry"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
