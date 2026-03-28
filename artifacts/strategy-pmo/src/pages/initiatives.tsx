import { useState } from "react";
import {
  useListSpmoInitiatives,
  useListSpmoPillars,
  useCreateSpmoInitiative,
  useUpdateSpmoInitiative,
  useDeleteSpmoInitiative,
  type CreateSpmoInitiativeRequest,
  type UpdateSpmoInitiativeRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";

const STATUSES = ["active", "on_hold", "completed", "cancelled"] as const;

type InitiativeForm = {
  initiativeCode: string;
  name: string;
  description: string;
  pillarId: string;
  ownerName: string;
  weight: string;
  status: string;
  startDate: string;
  targetDate: string;
};

const emptyForm = (): InitiativeForm => ({
  initiativeCode: "",
  name: "",
  description: "",
  pillarId: "",
  ownerName: "",
  weight: "50",
  status: "active",
  startDate: "",
  targetDate: "",
});

export default function Initiatives() {
  const { data, isLoading } = useListSpmoInitiatives();
  const { data: pillarsData } = useListSpmoPillars();
  const isAdmin = useIsAdmin();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<InitiativeForm>(emptyForm());
  const [siblingWeightEdits, setSiblingWeightEdits] = useState<Record<number, string>>({});
  const [savingSiblingId, setSavingSiblingId] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoInitiative();
  const updateMutation = useUpdateSpmoInitiative();
  const deleteMutation = useDeleteSpmoInitiative();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/initiatives"] });
    qc.invalidateQueries({ queryKey: ["/api/spmo/programme"] });
  };

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setSiblingWeightEdits({});
    setModalOpen(true);
  }

  function openEdit(initiative: NonNullable<typeof data>["initiatives"][number]) {
    setEditId(initiative.id);
    setForm({
      initiativeCode: initiative.initiativeCode ?? "",
      name: initiative.name,
      description: initiative.description ?? "",
      pillarId: String(initiative.pillarId),
      ownerName: initiative.ownerName ?? "",
      weight: String(initiative.weight),
      status: initiative.status,
      startDate: initiative.startDate ?? "",
      targetDate: initiative.targetDate ?? "",
    });
    setSiblingWeightEdits({});
    setModalOpen(true);
  }

  async function saveSiblingInitiativeWeight(siblingId: number, val: string) {
    const w = Math.round(parseFloat(val));
    if (isNaN(w) || w < 0 || w > 100) return;
    const originalSibling = (data?.initiatives ?? []).find(i => i.id === siblingId)?.weight;
    if (w === originalSibling) return;
    setSavingSiblingId(siblingId);
    try {
      if (editId !== null) {
        const mainOriginal = (data?.initiatives ?? []).find(i => i.id === editId)?.weight;
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
    if (!confirm(`Delete initiative "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: `"${name}" removed.` });
          invalidate();
        },
      }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const commonFields = {
      initiativeCode: form.initiativeCode.trim() || null,
      name: form.name,
      description: form.description || undefined,
      pillarId: parseInt(form.pillarId),
      ownerId: "user",
      ownerName: form.ownerName || undefined,
      weight: parseFloat(form.weight) || 0,
      status: form.status as "active" | "on_hold" | "completed" | "cancelled",
    };

    function extractError(err: unknown): string {
      if (err && typeof err === "object" && "message" in err) return String((err as { message: string }).message);
      return "An unexpected error occurred.";
    }

    if (editId !== null) {
      const updatePayload: UpdateSpmoInitiativeRequest = {
        ...commonFields,
        startDate: form.startDate || undefined,
        targetDate: form.targetDate || undefined,
      };
      updateMutation.mutate(
        { id: editId, data: updatePayload },
        {
          onSuccess: () => {
            toast({ title: "Updated", description: `"${form.name}" updated.` });
            setModalOpen(false);
            invalidate();
          },
          onError: (err) => toast({ variant: "destructive", title: "Error", description: extractError(err) }),
        }
      );
    } else {
      const createPayload: CreateSpmoInitiativeRequest = {
        ...commonFields,
        startDate: form.startDate,
        targetDate: form.targetDate,
      };
      createMutation.mutate(
        { data: createPayload },
        {
          onSuccess: () => {
            toast({ title: "Created", description: `"${form.name}" added.` });
            setModalOpen(false);
            invalidate();
          },
          onError: (err) => toast({ variant: "destructive", title: "Error", description: extractError(err) }),
        }
      );
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const selectedPillarId = parseInt(form.pillarId) || 0;
  const siblingInitiatives = (data?.initiatives ?? []).filter(i => i.pillarId === selectedPillarId && i.id !== editId);
  const siblingInitiativeWeight = siblingInitiatives.reduce((s, i) => s + (i.weight ?? 0), 0);
  const initiativeWeightTotal = siblingInitiativeWeight + (parseFloat(form.weight) || 0);
  const initiativeWeightError = !!form.pillarId && initiativeWeightTotal > 100;
  const initiativeWeightUnder = !!form.pillarId && !initiativeWeightError && initiativeWeightTotal > 0 && initiativeWeightTotal < 100;

  if (isLoading)
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Initiatives" description="Manage and track strategic initiatives.">
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Initiative
          </button>
        )}
      </PageHeader>

      {(pillarsData?.pillars ?? []).length === 0 && (data?.initiatives.length ?? 0) === 0 && (
        <Card>
          <div className="p-12 text-center text-muted-foreground">No pillars or initiatives yet.</div>
        </Card>
      )}

      {(pillarsData?.pillars ?? []).map((pillar) => {
        const pillarInits = (data?.initiatives ?? []).filter((i) => i.pillarId === pillar.id);
        if (pillarInits.length === 0) return null;
        return (
          <Card key={pillar.id} noPadding className="overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-secondary/40">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: pillar.color ?? "#6366f1" }} />
              <span className="font-bold text-sm">{pillar.name}</span>
              <span className="text-xs text-muted-foreground font-normal">
                {pillarInits.length} initiative{pillarInits.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/20 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Initiative</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold w-44">Progress</th>
                    <th className="px-6 py-3 font-semibold text-center">Weight</th>
                    <th className="px-6 py-3 font-semibold">Owner</th>
                    <th className="px-6 py-3 font-semibold">Target Date</th>
                    <th className="px-6 py-3 font-semibold text-right">Projects</th>
                    <th className="px-6 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pillarInits.map((init) => (
                    <tr key={init.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-foreground">
                          {init.initiativeCode && (
                            <><span className="font-mono text-muted-foreground">{init.initiativeCode}</span><span className="text-muted-foreground mx-1">:</span></>
                          )}
                          {init.name}
                        </div>
                        {init.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{init.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium text-muted-foreground capitalize px-2 py-1 bg-secondary rounded-md">
                          {init.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <ProgressBar progress={init.progress ?? 0} className="w-full" />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-bold tabular-nums" title={`Source: ${(init as any).weightSource ?? "auto"}`}>
                          {Math.round((init as any).effectiveWeight ?? 0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground/80">{init.ownerName || "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {init.targetDate ? format(new Date(init.targetDate), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-bold">{init.projectCount ?? 0}</td>
                      <td className="px-6 py-4 text-right">
                        {isAdmin && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEdit(init)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                              title="Edit initiative"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => handleDelete(init.id, init.name)}
                              className="p-1.5 rounded-lg border border-border bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Initiative" : "New Initiative"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[120px_1fr] gap-4">
            <FormField label="Code" required={false}>
              <input
                className={inputClass + " font-mono"}
                value={form.initiativeCode}
                onChange={(e) => setForm({ ...form, initiativeCode: e.target.value.toUpperCase() })}
                placeholder="e.g. I01"
                maxLength={10}
              />
            </FormField>
            <FormField label="Name" required>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Digital Identity Programme"
                required
              />
            </FormField>
          </div>

          <FormField label="Pillar" required>
            <select
              className={selectClass}
              value={form.pillarId}
              onChange={(e) => setForm({ ...form, pillarId: e.target.value })}
              required
            >
              <option value="">Select a pillar...</option>
              {pillarsData?.pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Description">
            <textarea
              className={inputClass}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of this initiative..."
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Owner Name">
              <input
                className={inputClass}
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                placeholder="e.g. Sarah Al-Rashid"
              />
            </FormField>
            <FormField label="Status">
              <select
                className={selectClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label={`Weight: ${form.weight}%`}>
            <input
              type="range"
              min="0"
              max="100"
              className="w-full accent-primary"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
            />
            <div className={`flex items-center justify-between text-[11px] mt-1.5 min-h-[1rem] tabular-nums ${initiativeWeightError ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
              {form.pillarId ? (
                <>
                  <span>Others: {Math.round(siblingInitiativeWeight)}% + This: {parseFloat(form.weight) || 0}%</span>
                  <span className="w-20 text-right shrink-0">{initiativeWeightError ? `⚠ Total ${Math.round(initiativeWeightTotal)}%` : `${Math.max(0, Math.round(100 - siblingInitiativeWeight))}% left`}</span>
                </>
              ) : <span className="italic">Select a pillar to see weight breakdown</span>}
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date">
              <input
                type="date"
                className={inputClass}
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </FormField>
            <FormField label="Target Date">
              <input
                type="date"
                className={inputClass}
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
              />
            </FormField>
          </div>

          {initiativeWeightError && (
            <p className="text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              ⚠ Initiative weights in this pillar cannot exceed 100%. Reduce this weight or adjust siblings first.
            </p>
          )}
          {initiativeWeightUnder && (
            <div className="text-xs bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5 space-y-2">
              <p className="font-semibold text-warning">⚠ Weights sum to {Math.round(initiativeWeightTotal)}% — must reach exactly 100% before saving.</p>
              <p className="text-muted-foreground">Adjust another initiative below to fill the remaining <span className="font-bold text-foreground">{100 - Math.round(initiativeWeightTotal)}%</span>:</p>
              <ul className="divide-y divide-border/40">
                {siblingInitiatives.map(i => {
                  const localVal = siblingWeightEdits[i.id] ?? String(i.weight);
                  const isSavingThis = savingSiblingId === i.id;
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="text-foreground truncate flex-1">{i.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number" min="0" max="100"
                          value={localVal}
                          onChange={e => setSiblingWeightEdits(prev => ({ ...prev, [i.id]: e.target.value }))}
                          onBlur={() => saveSiblingInitiativeWeight(i.id, localVal)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveSiblingInitiativeWeight(i.id, localVal); } }}
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
          <FormActions loading={isSaving} disabled={initiativeWeightError || initiativeWeightUnder} label={editId ? "Update Initiative" : "Create Initiative"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
