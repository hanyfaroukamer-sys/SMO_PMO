import { useState } from "react";
import {
  useListSpmoBudget,
  useListSpmoInitiatives,
  useListSpmoProjects,
  useListSpmoProcurement,
  useCreateSpmoBudgetEntry,
  useUpdateSpmoBudgetEntry,
  useDeleteSpmoBudgetEntry,
  useUpdateSpmoProject,
  useUpdateSpmoInitiative,
  type CreateSpmoBudgetEntryRequest,
  type SpmoInitiativeWithProgress,
  useGetSpmoConfig,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import {
  Loader2, Plus, Pencil, Trash2, Wallet, TrendingUp, CircleDollarSign, BarChart2,
  Check, X, ShieldCheck, Download,
} from "lucide-react";
import { exportToXlsx } from "@/lib/export";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const CATEGORIES = [
  "Personnel", "Technology", "Infrastructure", "Consulting",
  "Training", "Procurement", "Operations", "Contingency", "Other",
];

type InitiativeWithBudget = SpmoInitiativeWithProgress & {
  budget: number;
  budgetSpent: number;
};

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

function InlineNumberEdit({
  value,
  onSave,
  prefix = "",
}: {
  value: number;
  onSave: (newVal: number) => void;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (!editing) {
    return (
      <button
        className="text-right font-mono text-sm hover:text-primary hover:underline cursor-pointer"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        title="Click to edit"
      >
        {prefix}{(value / 1_000_000).toFixed(1)}M
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        type="number"
        className="w-24 text-xs border border-primary rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(parseFloat(draft) || 0); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(parseFloat(draft) || 0); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
      />
    </span>
  );
}

function initiativeHealth(progress: number): { label: string; color: string } {
  if (progress >= 75) return { label: "On Track", color: "text-success" };
  if (progress >= 40) return { label: "At Risk", color: "text-warning" };
  return { label: "Critical", color: "text-destructive" };
}

export default function Budget() {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useListSpmoBudget();
  const { data: initiativesData } = useListSpmoInitiatives();
  const { data: projectsData } = useListSpmoProjects();
  const { data: procurementData } = useListSpmoProcurement();
  const { data: spmoConfigData } = useGetSpmoConfig();
  const currency = (spmoConfigData as any)?.reportingCurrency ?? "SAR";
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();
  const createMutation = useCreateSpmoBudgetEntry();
  const updateMutation = useUpdateSpmoBudgetEntry();
  const deleteMutation = useDeleteSpmoBudgetEntry();
  const updateProject = useUpdateSpmoProject();
  const updateInitiative = useUpdateSpmoInitiative();

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to view budget information.</p>
      </div>
    );
  }

  const invalidateBudget = () => qc.invalidateQueries({ queryKey: ["/api/spmo/budget"] });
  const invalidateProjects = () => qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
  const invalidateInitiatives = () => qc.invalidateQueries({ queryKey: ["/api/spmo/initiatives"] });

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
      onSuccess: () => { toast({ title: "Entry removed" }); invalidateBudget(); },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fiscalYear = parseInt(form.fiscalYear) || undefined;
    const fiscalQuarter = form.fiscalQuarter ? parseInt(form.fiscalQuarter) : undefined;
    const period = fiscalYear && fiscalQuarter
      ? `FY${fiscalYear} Q${fiscalQuarter}`
      : fiscalYear ? `FY${fiscalYear}` : new Date().getFullYear().toString();

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: {
        category: form.category,
        allocated: parseFloat(form.allocated) || 0,
        spent: parseFloat(form.spent) || 0,
        description: form.description || undefined,
        fiscalYear,
        fiscalQuarter,
        period,
      }}, {
        onSuccess: () => { toast({ title: "Entry updated" }); setModalOpen(false); invalidateBudget(); },
        onError: () => toast({ variant: "destructive", title: "Error" }),
      });
    } else {
      const createPayload: CreateSpmoBudgetEntryRequest = {
        category: form.category,
        allocated: parseFloat(form.allocated) || 0,
        spent: parseFloat(form.spent) || 0,
        description: form.description || undefined,
        fiscalYear,
        fiscalQuarter,
        period,
      };
      createMutation.mutate({ data: createPayload }, {
        onSuccess: () => { toast({ title: "Entry added" }); setModalOpen(false); invalidateBudget(); },
        onError: () => toast({ variant: "destructive", title: "Error" }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const totalAllocated = data?.totalAllocated ?? 0;
  const totalSpent = data?.totalSpent ?? 0;
  const remaining = totalAllocated - totalSpent;
  const utilizationPct = data?.utilizationPct ?? 0;

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

  const initiatives = initiativesData?.initiatives ?? [];
  const projects = projectsData?.projects ?? [];
  const initiativeCodeMap = new Map(initiatives.map((ini, idx) => [ini.id, ini.initiativeCode ?? String(idx + 1).padStart(2, "0")]));
  const totalProjBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);

  const spentByInitiative: Map<number, number> = new Map();
  projects.forEach((p) => {
    const initId = p.initiativeId;
    if (initId != null) {
      spentByInitiative.set(initId, (spentByInitiative.get(initId) ?? 0) + (p.budgetSpent ?? 0));
    }
  });

  const vendorByProject: Map<number, string> = new Map(
    (procurementData?.procurement ?? [])
      .filter((r: { vendor?: string | null }) => r.vendor)
      .map((r: { projectId: number; vendor?: string | null }) => [r.projectId, r.vendor as string])
  );

  const currentYear = new Date().getFullYear();
  const quarterlyChartData = [1, 2, 3, 4].map((q) => {
    const entriesQ = (data?.entries ?? []).filter(
      (e: { fiscalYear?: number | null; fiscalQuarter?: number | null }) =>
        e.fiscalQuarter === q && (e.fiscalYear == null || e.fiscalYear === currentYear)
    );
    return {
      name: `Q${q}`,
      Allocated: entriesQ.reduce((s: number, e: { allocated?: number }) => s + (e.allocated ?? 0), 0),
      Spent: entriesQ.reduce((s: number, e: { spent?: number }) => s + (e.spent ?? 0), 0),
    };
  });
  const hasQuarterlyData = quarterlyChartData.some((d) => d.Allocated > 0 || d.Spent > 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Budget Tracking" description="Financial overview of programme allocations and spend.">
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToXlsx((data?.entries ?? []).map((e: { label?: string; category?: string; allocated?: number; spent?: number; notes?: string }) => ({
              Label: e.label ?? "",
              Category: e.category ?? "",
              Allocated: e.allocated ?? 0,
              Spent: e.spent ?? 0,
              Notes: e.notes ?? "",
            })), "budget-export")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" /> Add Entry
          </button>
        </div>
      </PageHeader>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Allocated</span>
          </div>
          <div className="text-2xl font-display font-bold">{formatCurrency(totalAllocated, currency)}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <CircleDollarSign className="w-5 h-5 text-destructive" />
            </div>
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Spent</span>
          </div>
          <div className="text-2xl font-display font-bold text-destructive">{formatCurrency(totalSpent, currency)}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Remaining</span>
          </div>
          <div className={`text-2xl font-display font-bold ${remaining < 0 ? "text-destructive" : "text-success"}`}>
            {formatCurrency(remaining, currency)}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${utilizationPct > 90 ? "bg-destructive/10" : "bg-warning/10"}`}>
              <BarChart2 className={`w-5 h-5 ${utilizationPct > 90 ? "text-destructive" : "text-warning"}`} />
            </div>
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Burn Rate</span>
          </div>
          <div className={`text-2xl font-display font-bold ${utilizationPct > 90 ? "text-destructive" : ""}`}>
            {utilizationPct.toFixed(1)}%
          </div>
        </Card>
      </div>

      {/* Quarterly Phasing Chart */}
      {hasQuarterlyData && (
        <Card style={{ height: 340 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-base">Quarterly Budget Phasing</h3>
              <p className="text-xs text-muted-foreground mt-0.5">FY{currentYear} — Allocated vs Spent per quarter</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[hsl(220,14%,90%)]" /> Allocated</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[hsl(221,83%,53%)]" /> Spent</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height="82%">
            <BarChart data={quarterlyChartData} margin={{ top: 4, right: 8, left: 20, bottom: 8 }} barGap={4} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} />
              <YAxis tickFormatter={(v) => `${currency} ${(v / 1_000_000).toFixed(1)}M`} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(val: number, name: string) => [formatCurrency(val, currency), name]}
                contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "12px" }}
              />
              <Bar dataKey="Allocated" fill="hsl(220 14% 88%)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Spent" fill="hsl(221 83% 53%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <Card style={{ height: 320 }}>
          <h3 className="font-bold text-base mb-3">Spend by Category</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} dy={10} />
              <YAxis tickFormatter={(v) => `${currency} ${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val: number) => formatCurrency(val, currency)} contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }} />
              <Legend wrapperStyle={{ paddingTop: "12px" }} />
              <Bar dataKey="Allocated" fill="hsl(220 14% 90%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Spent" fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Initiatives Budget Table — inline-editable */}
      {initiatives.length > 0 && (() => {
        const typed = initiatives as InitiativeWithBudget[];
        const totalInitiativeBudget = typed.reduce((s, i) => s + (i.budget ?? 0), 0);
        return (
          <Card noPadding className="overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
              <h3 className="font-bold text-sm">Initiatives Budget</h3>
              <span className="text-xs text-muted-foreground">{initiatives.length} initiatives · Click Alloc or Spent to edit</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold text-right">Alloc ({currency})</th>
                    <th className="px-5 py-3 font-semibold text-right">Spent ({currency})</th>
                    <th className="px-5 py-3 font-semibold text-right">Weight</th>
                    <th className="px-5 py-3 font-semibold text-right">Progress</th>
                    <th className="px-5 py-3 font-semibold text-center">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {typed.map((initiative) => {
                    const budget = initiative.budget ?? 0;
                    const budgetSpent = initiative.budgetSpent ?? 0;
                    const computedWeight = totalInitiativeBudget > 0
                      ? ((budget / totalInitiativeBudget) * 100).toFixed(1)
                      : "—";
                    const progress = initiative.progress ?? 0;
                    const health = initiativeHealth(progress);
                    return (
                      <tr key={initiative.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3 font-semibold">Initiative {initiativeCodeMap.get(initiative.id) ?? "??"}: {initiative.name}</td>
                        <td className="px-5 py-3 text-right">
                          <InlineNumberEdit
                            value={budget}
                            onSave={(v) => {
                              updateInitiative.mutate({ id: initiative.id, data: { budget: v } }, {
                                onSuccess: () => { toast({ title: "Allocation updated" }); invalidateInitiatives(); },
                              });
                            }}
                          />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <InlineNumberEdit
                            value={budgetSpent}
                            onSave={(v) => {
                              updateInitiative.mutate({ id: initiative.id, data: { budgetSpent: v } }, {
                                onSuccess: () => { toast({ title: "Spent updated" }); invalidateInitiatives(); },
                              });
                            }}
                          />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-mono text-sm">{computedWeight}%</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-bold">{Math.round(progress)}%</span>
                        </td>
                        <td className={`px-5 py-3 text-center font-semibold text-xs ${health.color}`}>
                          {health.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}

      {/* Projects Budget Table — inline-editable */}
      {projects.length > 0 && (
        <Card noPadding className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
            <h3 className="font-bold text-sm">Projects Budget</h3>
            <span className="text-xs text-muted-foreground">{projects.length} projects · {currency} {(totalProjBudget / 1_000_000).toFixed(0)}M total · Click budget to edit inline</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Vendor</th>
                  <th className="px-5 py-3 font-semibold text-right">Weight</th>
                  <th className="px-5 py-3 font-semibold text-right">Alloc (M {currency})</th>
                  <th className="px-5 py-3 font-semibold text-right">Spent (M {currency})</th>
                  <th className="px-5 py-3 font-semibold text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((project) => {
                  const budget = project.budget ?? 0;
                  const budgetSpent = project.budgetSpent ?? 0;
                  const progress = project.progress ?? 0;
                  const vendor = vendorByProject.get(project.id) ?? "—";
                  return (
                    <tr key={project.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-5 py-3 font-semibold">
                        {project.projectCode && <span className="font-mono text-muted-foreground mr-1">{project.projectCode}:</span>}{project.name}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{vendor}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm">{project.weight}%</td>
                      <td className="px-5 py-3 text-right">
                        <InlineNumberEdit
                          value={budget}
                          onSave={(v) => {
                            updateProject.mutate({ id: project.id, data: { budget: v } }, {
                              onSuccess: () => { toast({ title: "Budget updated" }); invalidateProjects(); },
                            });
                          }}
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <InlineNumberEdit
                          value={budgetSpent}
                          onSave={(v) => {
                            updateProject.mutate({ id: project.id, data: { budgetSpent: v } }, {
                              onSuccess: () => { toast({ title: "Spent updated" }); invalidateProjects(); },
                            });
                          }}
                        />
                      </td>
                      <td className="px-5 py-3 text-right font-bold">{Math.round(progress)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detailed Budget Entries Table */}
      <Card noPadding className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
          <h3 className="font-bold text-sm">Budget Entries</h3>
          <span className="text-xs text-muted-foreground">{data?.entries.length ?? 0} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase border-b border-border">
              <tr>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold text-right">Allocated</th>
                <th className="px-5 py-3 font-semibold text-right">Spent</th>
                <th className="px-5 py-3 font-semibold text-right">Remaining</th>
                <th className="px-5 py-3 font-semibold text-center">Period</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.entries.map((entry) => {
                const rem = entry.allocated - entry.spent;
                return (
                  <tr key={entry.id} className="hover:bg-secondary/20 transition-colors group">
                    <td className="px-5 py-3 font-semibold">{entry.category}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs truncate">{entry.description || "—"}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs">{formatCurrency(entry.allocated, currency)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs">{formatCurrency(entry.spent, currency)}</td>
                    <td className={`px-5 py-3 text-right font-mono text-xs font-bold ${rem < 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(rem, currency)}
                    </td>
                    <td className="px-5 py-3 text-center text-xs text-muted-foreground">
                      {entry.fiscalYear ? `FY${entry.fiscalYear}${entry.fiscalQuarter ? ` Q${entry.fiscalQuarter}` : ""}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => openEdit(entry)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data?.entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    No budget entries yet. Click "Add Entry" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Budget Entry" : "New Budget Entry"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Category" required>
            <select className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          <FormField label="Description">
            <input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Cloud infrastructure licences Q1" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label={`Allocated (${currency})`} required>
              <input type="number" className={inputClass} value={form.allocated} onChange={(e) => setForm({ ...form, allocated: e.target.value })} placeholder="0" min="0" step="any" required />
            </FormField>
            <FormField label={`Spent (${currency})`}>
              <input type="number" className={inputClass} value={form.spent} onChange={(e) => setForm({ ...form, spent: e.target.value })} placeholder="0" min="0" step="any" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fiscal Year">
              <input type="number" className={inputClass} value={form.fiscalYear} onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })} placeholder="2026" min="2000" max="2100" />
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
