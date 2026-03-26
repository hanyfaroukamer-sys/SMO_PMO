import { useState } from "react";
import {
  useListSpmoPillars,
  useCreateSpmoPillar,
  useUpdateSpmoPillar,
  useDeleteSpmoPillar,
  type CreateSpmoPillarRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass } from "@/components/modal";
import { Loader2, Pencil, Trash2, Plus, Layers, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6",
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
];

type PillarForm = {
  name: string;
  description: string;
  pillarType: "pillar" | "enabler";
  weight: string;
  color: string;
  sortOrder: string;
};

const emptyForm = (): PillarForm => ({
  name: "", description: "", pillarType: "pillar", weight: "25", color: COLORS[0], sortOrder: "0",
});

export default function Pillars() {
  const { data, isLoading } = useListSpmoPillars();
  const isAdmin = useIsAdmin();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PillarForm>(emptyForm());
  const [siblingWeightEdits, setSiblingWeightEdits] = useState<Record<number, string>>({});
  const [savingSiblingId, setSavingSiblingId] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoPillar();
  const updateMutation = useUpdateSpmoPillar();
  const deleteMutation = useDeleteSpmoPillar();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/pillars"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/programme"] });
  };

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setSiblingWeightEdits({});
    setModalOpen(true);
  }

  function openEdit(pillar: NonNullable<typeof data>["pillars"][number]) {
    setEditId(pillar.id);
    const pt = (pillar as { pillarType?: string }).pillarType;
    setForm({
      name: pillar.name,
      description: pillar.description ?? "",
      pillarType: (pt === "enabler" ? "enabler" : "pillar"),
      weight: String(pillar.weight),
      color: pillar.color ?? COLORS[0],
      sortOrder: String(pillar.sortOrder ?? 0),
    });
    setSiblingWeightEdits({});
    setModalOpen(true);
  }

  async function saveSiblingPillarWeight(siblingId: number, val: string) {
    const w = Math.round(parseFloat(val));
    if (isNaN(w) || w < 0 || w > 100) return;
    const originalSibling = (data?.pillars ?? []).find(p => p.id === siblingId)?.weight;
    if (w === originalSibling) return;
    setSavingSiblingId(siblingId);
    try {
      if (editId !== null) {
        const mainOriginal = (data?.pillars ?? []).find(p => p.id === editId)?.weight;
        const mainNew = Math.round(parseFloat(form.weight) || 0);
        if (mainOriginal !== undefined && mainNew !== mainOriginal) {
          await updateMutation.mutateAsync({ id: editId, data: { weight: mainNew } });
          invalidate();
        }
      }
      await updateMutation.mutateAsync({ id: siblingId, data: { weight: w } });
      setSiblingWeightEdits(prev => { const next = { ...prev }; delete next[siblingId]; return next; });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update sibling weight." });
    } finally {
      setSavingSiblingId(null);
    }
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete pillar "${name}"? All initiatives and projects under it will be affected.`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted", description: `"${name}" removed.` });
        invalidate();
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      pillarType: form.pillarType,
      weight: parseFloat(form.weight) || 0,
      color: form.color,
      sortOrder: parseInt(form.sortOrder) || 0,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Updated" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update pillar." }),
      });
    } else {
      const createPayload: CreateSpmoPillarRequest = {
        ...payload,
        iconName: "circle",
      };
      createMutation.mutate({ data: createPayload }, {
        onSuccess: () => {
          toast({ title: "Created", description: `Pillar "${form.name}" added.` });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to create pillar." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const siblingPillars = (data?.pillars ?? []).filter(p => p.id !== editId);
  const siblingPillarWeight = siblingPillars.reduce((s, p) => s + (p.weight ?? 0), 0);
  const pillarWeightTotal = siblingPillarWeight + (parseFloat(form.weight) || 0);
  const pillarWeightError = pillarWeightTotal > 100;
  const pillarWeightUnder = !pillarWeightError && pillarWeightTotal > 0 && pillarWeightTotal < 100;

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const allItems = data?.pillars ?? [];
  const strategicPillars = allItems.filter(p => (p as { pillarType?: string }).pillarType !== "enabler");
  const enablers = allItems.filter(p => (p as { pillarType?: string }).pillarType === "enabler");

  function PillarCard({ pillar, typeLabel, typeColor, TypeIcon }: {
    pillar: NonNullable<typeof data>["pillars"][number];
    typeLabel: string;
    typeColor: string;
    TypeIcon: typeof Layers;
  }) {
    return (
      <Card key={pillar.id} className="flex flex-col group hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ backgroundColor: typeColor + "18", color: typeColor }}
              >
                <TypeIcon className="w-2.5 h-2.5" />
                {typeLabel}
              </span>
            </div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: pillar.color ?? "#6366f1" }} />
              {pillar.name}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">{pillar.description || "No description provided."}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-secondary px-3 py-1 rounded-md text-sm font-bold border border-border">
              {pillar.weight}% Weight
            </div>
            {isAdmin && (
              <>
                <button
                  onClick={() => openEdit(pillar)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(pillar.id, pillar.name)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex justify-between text-sm mb-2 font-medium">
            <span className="text-muted-foreground">Overall Progress</span>
            <span>{Math.round(pillar.progress ?? 0)}%</span>
          </div>
          <ProgressBar progress={pillar.progress ?? 0} showLabel={false} />

          <div className="grid grid-cols-4 gap-4 mt-6 pt-4 border-t border-border/50">
            <Stat label="Initiatives" val={pillar.initiativeCount ?? 0} />
            <Stat label="Projects" val={pillar.projectCount ?? 0} />
            <Stat label="Milestones" val={pillar.milestoneCount ?? 0} />
            <Stat label="Approvals" val={pillar.pendingApprovals ?? 0} alert={(pillar.pendingApprovals ?? 0) > 0} />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in">
      <PageHeader title="Pillars & Enablers" description="Strategic pillars define what the organisation delivers; enablers define how.">
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </PageHeader>

      {/* Strategic Pillars */}
      {strategicPillars.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="text-[15px] font-display font-bold tracking-tight border-l-[3px] border-primary pl-2">
              Strategic Pillars
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">({strategicPillars.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {strategicPillars.map((pillar) => (
              <PillarCard key={pillar.id} pillar={pillar} typeLabel="Pillar" typeColor="#2563EB" TypeIcon={Layers} />
            ))}
          </div>
        </section>
      )}

      {/* Cross-cutting Enablers */}
      {enablers.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-amber-600" />
            <h2 className="text-[15px] font-display font-bold tracking-tight border-l-[3px] border-amber-500 pl-2">
              Cross-Cutting Enablers
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">({enablers.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {enablers.map((pillar) => (
              <PillarCard key={pillar.id} pillar={pillar} typeLabel="Enabler" typeColor="#D97706" TypeIcon={Zap} />
            ))}
          </div>
        </section>
      )}

      {allItems.length === 0 && (
        <div className="p-12 text-center text-muted-foreground bg-card border border-border rounded-xl">
          No pillars or enablers defined yet.
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Pillar" : "New Pillar"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Pillar Name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Digital Transformation"
              required
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={inputClass}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this pillar represent?"
            />
          </FormField>

          <FormField label="Type">
            <select
              className={inputClass}
              value={form.pillarType}
              onChange={(e) => setForm({ ...form, pillarType: e.target.value as "pillar" | "enabler" })}
            >
              <option value="pillar">Strategic Pillar</option>
              <option value="enabler">Cross-Cutting Enabler</option>
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label={`Weight: ${form.weight}%`}>
              <input
                type="range"
                min="0"
                max="100"
                className="w-full accent-primary mt-2"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
              <div className={`flex items-center justify-between text-[11px] mt-1.5 min-h-[1rem] tabular-nums ${pillarWeightError ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                <span>Others: {Math.round(siblingPillarWeight)}% + This: {parseFloat(form.weight) || 0}%</span>
                <span className="w-20 text-right shrink-0">{pillarWeightError ? `⚠ Total ${Math.round(pillarWeightTotal)}%` : `${Math.max(0, Math.round(100 - siblingPillarWeight))}% left`}</span>
              </div>
            </FormField>
            <FormField label="Sort Order">
              <input
                type="number"
                className={inputClass}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                min="0"
                placeholder="0"
              />
            </FormField>
          </div>

          <FormField label="Colour">
            <div className="flex flex-wrap gap-2 mt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-125" : "border-transparent hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                className="w-8 h-8 rounded-full border-2 border-border cursor-pointer"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                title="Custom colour"
              />
            </div>
          </FormField>

          {pillarWeightError && (
            <p className="text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              ⚠ Pillar weights cannot exceed 100%. Reduce this pillar's weight or adjust others first.
            </p>
          )}
          {pillarWeightUnder && (
            <div className="text-xs bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5 space-y-2">
              <p className="font-semibold text-warning">⚠ Weights sum to {Math.round(pillarWeightTotal)}% — must reach exactly 100% before saving.</p>
              <p className="text-muted-foreground">Adjust another pillar below to fill the remaining <span className="font-bold text-foreground">{100 - Math.round(pillarWeightTotal)}%</span>:</p>
              <ul className="divide-y divide-border/40">
                {siblingPillars.map(p => {
                  const localVal = siblingWeightEdits[p.id] ?? String(p.weight);
                  const isSavingThis = savingSiblingId === p.id;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="text-foreground truncate flex-1">{p.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number" min="0" max="100"
                          value={localVal}
                          onChange={e => setSiblingWeightEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onBlur={() => saveSiblingPillarWeight(p.id, localVal)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveSiblingPillarWeight(p.id, localVal); } }}
                          disabled={isSavingThis}
                          className="w-14 text-right px-1.5 py-0.5 bg-background border border-border rounded text-xs font-mono disabled:opacity-50"
                        />
                        <span className="text-muted-foreground">%</span>
                        {isSavingThis && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <FormActions loading={isSaving} disabled={pillarWeightError || pillarWeightUnder} label={editId ? "Update Pillar" : "Create Pillar"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}

function Stat({ label, val, alert }: { label: string; val: number; alert?: boolean }) {
  return (
    <div>
      <div className={`text-xl font-bold ${alert ? "text-warning" : "text-foreground"}`}>{val}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
