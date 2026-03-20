import { useState } from "react";
import {
  useListSpmoRisks,
  useCreateSpmoRisk,
  useUpdateSpmoRisk,
  useDeleteSpmoRisk,
  useCreateSpmoMitigation,
  useUpdateSpmoMitigation,
  type CreateSpmoRiskRequest,
  type CreateSpmoMitigationRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, ShieldAlert, Plus, Pencil, Trash2, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const RISK_STATUSES = ["open", "mitigated", "closed", "accepted"] as const;
const PROB_IMPACT_VALUES = ["low", "medium", "high", "critical"] as const;
type ProbImpact = "low" | "medium" | "high" | "critical";

const SCORE_MAP: Record<ProbImpact, number> = { low: 1, medium: 2, high: 3, critical: 4 };

type RiskForm = {
  title: string;
  description: string;
  probability: ProbImpact;
  impact: ProbImpact;
  status: string;
  owner: string;
};

type MitigationForm = {
  description: string;
  status: string;
};

const emptyRisk = (): RiskForm => ({
  title: "", description: "", probability: "medium", impact: "medium", status: "open", owner: "",
});

const emptyMitigation = (): MitigationForm => ({ description: "", status: "planned" });

const riskColor = (score: number) =>
  score >= 16 ? "text-destructive bg-destructive/10 border-destructive/30"
  : score >= 9  ? "text-orange-600 bg-orange-50 border-orange-200"
  : score >= 4  ? "text-warning bg-warning/10 border-warning/30"
  : "text-muted-foreground bg-secondary border-border";

export default function Risks() {
  const { data, isLoading } = useListSpmoRisks();
  const [riskModal, setRiskModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [riskForm, setRiskForm] = useState<RiskForm>(emptyRisk());
  const [expandedRisk, setExpandedRisk] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoRisk();
  const updateMutation = useUpdateSpmoRisk();
  const deleteMutation = useDeleteSpmoRisk();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/spmo/risks"] });

  function openCreate() {
    setEditId(null);
    setRiskForm(emptyRisk());
    setRiskModal(true);
  }

  function openEdit(risk: NonNullable<typeof data>["risks"][number]) {
    setEditId(risk.id);
    setRiskForm({
      title: risk.title,
      description: risk.description ?? "",
      probability: (risk.probability as ProbImpact) ?? "medium",
      impact: (risk.impact as ProbImpact) ?? "medium",
      status: risk.status,
      owner: risk.owner ?? "",
    });
    setRiskModal(true);
  }

  function handleDelete(id: number, title: string) {
    if (!confirm(`Delete risk "${title}"?`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Risk removed" });
        invalidate();
      },
    });
  }

  function handleRiskSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: riskForm.title,
      description: riskForm.description || undefined,
      probability: riskForm.probability,
      impact: riskForm.impact,
      status: riskForm.status as "open" | "mitigated" | "accepted" | "closed",
      owner: riskForm.owner || undefined,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Risk updated" });
          setRiskModal(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update risk." }),
      });
    } else {
      const createRiskPayload: CreateSpmoRiskRequest = {
        title: riskForm.title,
        description: riskForm.description || undefined,
        probability: riskForm.probability,
        impact: riskForm.impact,
        status: riskForm.status as "open" | "mitigated" | "accepted" | "closed",
        owner: riskForm.owner || undefined,
      };
      createMutation.mutate({ data: createRiskPayload }, {
        onSuccess: () => {
          toast({ title: "Risk logged", description: `"${riskForm.title}" added to register.` });
          setRiskModal(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to log risk." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const sorted = [...(data?.risks ?? [])].sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Risk Register" description="Identify, assess, and mitigate programme risks.">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Log New Risk
        </button>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["open", "mitigated", "accepted", "closed"] as const).map((s) => {
          const count = data?.risks.filter((r) => r.status === s).length ?? 0;
          return (
            <Card key={s} className="text-center py-4">
              <div className="text-2xl font-bold font-display">{count}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1 capitalize">{s}</div>
            </Card>
          );
        })}
      </div>

      {/* Risk list */}
      <div className="space-y-3">
        {sorted.map((risk) => (
          <Card key={risk.id} noPadding className="overflow-hidden">
            <div
              className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
              onClick={() => setExpandedRisk(expandedRisk === risk.id ? null : risk.id)}
            >
              <div className={`shrink-0 w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center font-bold ${riskColor(risk.riskScore)}`}>
                <span className="text-xl leading-none">{risk.riskScore}</span>
                <span className="text-[9px] uppercase tracking-wider opacity-70">score</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-foreground">{risk.title}</h3>
                  <StatusBadge status={risk.status} />
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">{risk.description}</p>
                {risk.owner && <span className="text-xs text-muted-foreground mt-1 block">Owner: {risk.owner}</span>}
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-center hidden md:block">
                  <div className="text-sm font-bold capitalize">{risk.probability} × {risk.impact}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">P × I</div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(risk)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(risk.id, risk.title)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {expandedRisk === risk.id
                  ? <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              </div>
            </div>

            {expandedRisk === risk.id && <MitigationSection riskId={risk.id} mitigations={risk.mitigations ?? []} />}
          </Card>
        ))}

        {data?.risks.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <ShieldAlert className="w-12 h-12 mb-4 opacity-20" />
            <p>No risks logged yet.</p>
          </Card>
        )}
      </div>

      {/* Risk Form Modal */}
      <Modal open={riskModal} onClose={() => setRiskModal(false)} title={editId ? "Edit Risk" : "Log New Risk"}>
        <form onSubmit={handleRiskSubmit} className="space-y-4">
          <FormField label="Risk Title" required>
            <input
              className={inputClass}
              value={riskForm.title}
              onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })}
              placeholder="e.g. System Integration Failure"
              required
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={inputClass}
              rows={3}
              value={riskForm.description}
              onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })}
              placeholder="Describe the risk and its potential impact..."
            />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Probability">
              <select className={selectClass} value={riskForm.probability} onChange={(e) => setRiskForm({ ...riskForm, probability: e.target.value as ProbImpact })}>
                {PROB_IMPACT_VALUES.map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}
              </select>
            </FormField>
            <FormField label="Impact">
              <select className={selectClass} value={riskForm.impact} onChange={(e) => setRiskForm({ ...riskForm, impact: e.target.value as ProbImpact })}>
                {PROB_IMPACT_VALUES.map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select className={selectClass} value={riskForm.status} onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })}>
                {RISK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Risk Owner">
            <input
              className={inputClass}
              value={riskForm.owner}
              onChange={(e) => setRiskForm({ ...riskForm, owner: e.target.value })}
              placeholder="e.g. Ahmed Al-Mansouri"
            />
          </FormField>

          <div className="p-3 bg-secondary/50 rounded-lg border border-border text-sm">
            Risk Score = Probability × Impact ={" "}
            <strong>{SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact]}</strong>
            {" "}
            {SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact] >= 16 ? "Critical"
              : SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact] >= 9 ? "High"
              : SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact] >= 4 ? "Medium"
              : "Low"}
          </div>

          <FormActions loading={isSaving} label={editId ? "Update Risk" : "Log Risk"} onCancel={() => setRiskModal(false)} />
        </form>
      </Modal>
    </div>
  );
}

// ─── Mitigation section ────────────────────────────────────────────────────────

function MitigationSection({
  riskId,
  mitigations,
}: {
  riskId: number;
  mitigations: Array<{ id: number; description: string; status: string }>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MitigationForm>(emptyMitigation());
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useCreateSpmoMitigation();
  const updateMutation = useUpdateSpmoMitigation();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/spmo/risks"] });

  function openCreate() {
    setEditId(null);
    setForm(emptyMitigation());
    setModalOpen(true);
  }

  function openEdit(m: { id: number; description: string; status: string }) {
    setEditId(m.id);
    setForm({ description: m.description, status: m.status });
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const status = form.status as "planned" | "in_progress" | "completed";
    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: { description: form.description, status } }, {
        onSuccess: () => {
          toast({ title: "Mitigation updated" });
          setModalOpen(false);
          invalidate();
        },
      });
    } else {
      const createMitigationPayload: CreateSpmoMitigationRequest = {
        description: form.description,
        status,
      };
      createMutation.mutate({ id: riskId, data: createMitigationPayload }, {
        onSuccess: () => {
          toast({ title: "Mitigation added" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to add mitigation." }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="border-t border-border bg-secondary/10">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Mitigations ({mitigations.length})
        </h4>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Add Mitigation
        </button>
      </div>

      <div className="divide-y divide-border/50 px-5">
        {mitigations.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-3 group">
            <div className="flex-1 text-sm">{m.description}</div>
            <StatusBadge status={m.status} />
            <button onClick={() => openEdit(m)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {mitigations.length === 0 && (
          <div className="py-4 text-sm text-muted-foreground text-center">No mitigations defined.</div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Mitigation" : "Add Mitigation"} maxWidth="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Mitigation Action" required>
            <textarea
              className={inputClass}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the mitigation action..."
              required
            />
          </FormField>
          <FormField label="Status">
            <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </FormField>
          <FormActions loading={isSaving} label={editId ? "Update" : "Add Mitigation"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
