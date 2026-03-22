import { useState } from "react";
import {
  useListSpmoRisks,
  useCreateSpmoRisk,
  useUpdateSpmoRisk,
  useDeleteSpmoRisk,
  useCreateSpmoMitigation,
  useUpdateSpmoMitigation,
  useListSpmoProjects,
  useListSpmoInitiatives,
  type CreateSpmoRiskRequest,
  type CreateSpmoMitigationRequest,
} from "@workspace/api-client-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass, selectClass } from "@/components/modal";
import { Loader2, ShieldAlert, Plus, Pencil, Trash2, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";

const RISK_STATUSES = ["open", "mitigated", "closed", "accepted"] as const;
const PROB_IMPACT_VALUES = ["low", "medium", "high", "critical"] as const;
type ProbImpact = "low" | "medium" | "high" | "critical";

const SCORE_MAP: Record<ProbImpact, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const LABEL_MAP: Record<ProbImpact, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

const RISK_CATEGORIES = [
  "Technical", "Financial", "Operational", "Regulatory", "Strategic",
  "Security", "Resource", "Schedule", "Vendor", "Other",
];

type RiskForm = {
  title: string;
  description: string;
  category: string;
  probability: ProbImpact;
  impact: ProbImpact;
  status: string;
  owner: string;
  projectId: string;
};

type MitigationForm = {
  description: string;
  status: string;
  dueDate: string;
};

const emptyRisk = (): RiskForm => ({
  title: "", description: "", category: "", probability: "medium", impact: "medium",
  status: "open", owner: "", projectId: "",
});

const emptyMitigation = (): MitigationForm => ({ description: "", status: "planned", dueDate: "" });

function riskBorderColor(score: number) {
  if (score >= 12) return "#dc2626";
  if (score >= 6) return "#d97706";
  if (score >= 3) return "#2563eb";
  return "#6b7280";
}

function riskColorClass(score: number) {
  if (score >= 12) return "border-destructive/30 bg-destructive/5";
  if (score >= 6) return "border-warning/30 bg-warning/5";
  return "";
}

function heatmapColor(count: number) {
  if (count === 0) return "bg-card text-muted-foreground/30 border-border/50";
  if (count === 1) return "bg-amber-50 text-amber-700 border-amber-200";
  if (count === 2) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-red-100 text-red-700 border-red-300";
}

export default function Risks() {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useListSpmoRisks();
  const { data: projectsData } = useListSpmoProjects();
  const { data: initiativesData } = useListSpmoInitiatives();
  const [riskModal, setRiskModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [riskForm, setRiskForm] = useState<RiskForm>(emptyRisk());
  const [expandedRisk, setExpandedRisk] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const projects = projectsData?.projects ?? [];
  const initiatives = initiativesData?.initiatives ?? [];
  const initiativeCodeMap = new Map(initiatives.map((ini, idx) => [ini.id, ini.initiativeCode ?? String(idx + 1).padStart(2, "0")]));

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
      category: risk.category ?? "",
      probability: (risk.probability as ProbImpact) ?? "medium",
      impact: (risk.impact as ProbImpact) ?? "medium",
      status: risk.status,
      owner: risk.owner ?? "",
      projectId: risk.projectId ? String(risk.projectId) : "",
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
      category: riskForm.category || undefined,
      probability: riskForm.probability,
      impact: riskForm.impact,
      status: riskForm.status as "open" | "mitigated" | "accepted" | "closed",
      owner: riskForm.owner || undefined,
      projectId: riskForm.projectId ? parseInt(riskForm.projectId) : undefined,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Risk updated" });
          setRiskModal(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error" }),
      });
    } else {
      const createRiskPayload: CreateSpmoRiskRequest = payload;
      createMutation.mutate({ data: createRiskPayload }, {
        onSuccess: () => {
          toast({ title: "Risk logged" });
          setRiskModal(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error" }),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading)
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const risks = data?.risks ?? [];
  const sorted = [...risks].sort((a, b) => b.riskScore - a.riskScore);

  function getProjectContext(projectId: number | null): { projectName: string; initiativeName: string } | null {
    if (!projectId) return null;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;
    const initiative = initiatives.find((i) => i.id === project.initiativeId);
    const iniCode = initiative ? (initiativeCodeMap.get(initiative.id) ?? "--") : "--";
    const codePrefix = project.projectCode ? `${project.projectCode}: ` : "";
    const iniPrefix = initiative ? `Initiative ${iniCode}: ` : "";
    return {
      projectName: `${codePrefix}${project.name}`,
      initiativeName: initiative ? `${iniPrefix}${initiative.name}` : "",
    };
  }

  const PROB_LEVELS: ProbImpact[] = ["low", "medium", "high", "critical"];
  const IMPACT_LEVELS: ProbImpact[] = ["low", "medium", "high", "critical"];

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

      {/* Heat Map */}
      {risks.length > 0 && (
        <Card>
          <h3 className="font-bold text-base mb-4">Risk Heat Map</h3>
          <div className="flex gap-4">
            {/* Y-axis label */}
            <div className="flex flex-col justify-around text-xs text-muted-foreground font-semibold" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: 200 }}>
              ← Probability →
            </div>

            <div className="flex-1">
              {/* Grid */}
              <div className="grid grid-rows-4 gap-1" style={{ gridTemplateRows: "repeat(4, 1fr)" }}>
                {[...PROB_LEVELS].reverse().map((prob) => (
                  <div key={prob} className="grid grid-cols-4 gap-1">
                    {IMPACT_LEVELS.map((impact) => {
                      const cellRisks = risks.filter(
                        (r) => r.probability === prob && r.impact === impact
                      );
                      return (
                        <div
                          key={impact}
                          className={`min-h-[48px] rounded-lg border p-1.5 text-xs ${heatmapColor(cellRisks.length)}`}
                        >
                          {cellRisks.length > 0 && (
                            <div>
                              <div className="font-bold mb-1">{cellRisks.length}</div>
                              {cellRisks.slice(0, 2).map((r) => (
                                <div key={r.id} className="truncate text-[9px] leading-tight">{r.title}</div>
                              ))}
                              {cellRisks.length > 2 && (
                                <div className="text-[9px] opacity-60">+{cellRisks.length - 2} more</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* X-axis labels */}
              <div className="grid grid-cols-4 gap-1 mt-1">
                {IMPACT_LEVELS.map((l) => (
                  <div key={l} className="text-center text-xs text-muted-foreground font-medium capitalize">{LABEL_MAP[l]}</div>
                ))}
              </div>
              <div className="text-center text-xs text-muted-foreground font-semibold mt-1">← Impact →</div>
            </div>

            {/* Y-axis labels */}
            <div className="flex flex-col-reverse justify-around text-xs text-muted-foreground font-medium" style={{ height: 200 }}>
              {PROB_LEVELS.map((l) => (
                <div key={l} className="capitalize text-right">{LABEL_MAP[l]}</div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-card border border-border" /> None</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-amber-50 border border-amber-200" /> 1</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-amber-100 border border-amber-300" /> 2</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-red-100 border border-red-300" /> 3+</span>
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["open", "mitigated", "accepted", "closed"] as const).map((s) => {
          const count = risks.filter((r) => r.status === s).length;
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
        {sorted.map((risk) => {
          const borderColor = riskBorderColor(risk.riskScore);
          return (
            <Card key={risk.id} noPadding className={`overflow-hidden ${riskColorClass(risk.riskScore)}`}>
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-black/5 transition-colors"
                style={{ borderLeft: `4px solid ${borderColor}` }}
                onClick={() => setExpandedRisk(expandedRisk === risk.id ? null : risk.id)}
              >
                <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl shrink-0 border-2 bg-background"
                  style={{ borderColor, color: borderColor }}
                >
                  <span className="text-xl font-bold leading-none">{risk.riskScore}</span>
                  <span className="text-[9px] uppercase tracking-wider opacity-70">score</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-foreground">{risk.title}</h3>
                    <StatusBadge status={risk.status} />
                    {risk.category && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                        {risk.category}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const ctx = getProjectContext(risk.projectId);
                    return ctx ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                        {ctx.initiativeName && <span className="text-primary/70">{ctx.initiativeName}</span>}
                        {ctx.initiativeName && <span>›</span>}
                        <span className="font-medium text-foreground/70">{ctx.projectName}</span>
                      </div>
                    ) : null;
                  })()}
                  <p className="text-sm text-muted-foreground line-clamp-1">{risk.description}</p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {risk.owner && <span>Owner: <strong className="text-foreground">{risk.owner}</strong></span>}
                    <span className="capitalize">{LABEL_MAP[risk.probability as ProbImpact]} probability × {LABEL_MAP[risk.impact as ProbImpact]} impact</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(risk)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(risk.id, risk.title)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div onClick={(e) => { e.stopPropagation(); setExpandedRisk(expandedRisk === risk.id ? null : risk.id); }}>
                    {expandedRisk === risk.id
                      ? <ChevronUp className="w-5 h-5 text-muted-foreground cursor-pointer" />
                      : <ChevronDown className="w-5 h-5 text-muted-foreground cursor-pointer" />}
                  </div>
                </div>
              </div>

              {expandedRisk === risk.id && <MitigationSection riskId={risk.id} mitigations={risk.mitigations ?? []} />}
            </Card>
          );
        })}

        {risks.length === 0 && (
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
            <input className={inputClass} value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} placeholder="e.g. System Integration Failure" required />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <select className={selectClass} value={riskForm.category} onChange={(e) => setRiskForm({ ...riskForm, category: e.target.value })}>
                <option value="">— None —</option>
                {RISK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Linked Project">
              <select className={selectClass} value={riskForm.projectId} onChange={(e) => setRiskForm({ ...riskForm, projectId: e.target.value })}>
                <option value="">— None —</option>
                {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.projectCode ? `${p.projectCode}: ` : ""}{p.name}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Description">
            <textarea className={inputClass} rows={3} value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} placeholder="Describe the risk and its potential impact..." />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Probability">
              <select className={selectClass} value={riskForm.probability} onChange={(e) => setRiskForm({ ...riskForm, probability: e.target.value as ProbImpact })}>
                {PROB_IMPACT_VALUES.map((v) => <option key={v} value={v} className="capitalize">{LABEL_MAP[v]}</option>)}
              </select>
            </FormField>
            <FormField label="Impact">
              <select className={selectClass} value={riskForm.impact} onChange={(e) => setRiskForm({ ...riskForm, impact: e.target.value as ProbImpact })}>
                {PROB_IMPACT_VALUES.map((v) => <option key={v} value={v} className="capitalize">{LABEL_MAP[v]}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select className={selectClass} value={riskForm.status} onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })}>
                {RISK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Risk Owner">
            <input className={inputClass} value={riskForm.owner} onChange={(e) => setRiskForm({ ...riskForm, owner: e.target.value })} placeholder="e.g. Ahmed Al-Mansouri" />
          </FormField>

          <div className="p-3 bg-secondary/50 rounded-lg border border-border text-sm">
            Risk Score = {LABEL_MAP[riskForm.probability]} × {LABEL_MAP[riskForm.impact]} ={" "}
            <strong>{SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact]}</strong>
            {" "}
            ({SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact] >= 12 ? "Critical"
              : SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact] >= 6 ? "High"
              : SCORE_MAP[riskForm.probability] * SCORE_MAP[riskForm.impact] >= 3 ? "Medium"
              : "Low"})
          </div>

          <FormActions loading={isSaving} label={editId ? "Update Risk" : "Log Risk"} onCancel={() => setRiskModal(false)} />
        </form>
      </Modal>
    </div>
  );
}

type Mitigation = { id: number; description: string; status: string; dueDate?: string | Date | null };

function MitigationSection({
  riskId,
  mitigations,
}: {
  riskId: number;
  mitigations: Mitigation[];
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

  function openEdit(m: Mitigation) {
    setEditId(m.id);
    const dueDateStr = m.dueDate
      ? (m.dueDate instanceof Date
          ? m.dueDate.toISOString().slice(0, 10)
          : String(m.dueDate).slice(0, 10))
      : "";
    setForm({ description: m.description, status: m.status, dueDate: dueDateStr });
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const status = form.status as "planned" | "in_progress" | "completed";
    const dueDate = form.dueDate || undefined;
    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: { description: form.description, status, dueDate } }, {
        onSuccess: () => {
          toast({ title: "Mitigation updated" });
          setModalOpen(false);
          invalidate();
        },
      });
    } else {
      const createMitigationPayload: CreateSpmoMitigationRequest = { description: form.description, status, dueDate };
      createMutation.mutate({ id: riskId, data: createMitigationPayload }, {
        onSuccess: () => {
          toast({ title: "Mitigation added" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error" }),
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
        <button onClick={openCreate} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" /> Add Mitigation
        </button>
      </div>

      <div className="divide-y divide-border/50 px-5">
        {mitigations.map((m) => {
          const dueDateDisplay = m.dueDate
            ? (m.dueDate instanceof Date
                ? m.dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                : new Date(m.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }))
            : null;
          return (
            <div key={m.id} className="flex items-start gap-3 py-3 group">
              <div className="flex-1 min-w-0">
                <p className="text-sm">{m.description}</p>
                {dueDateDisplay && (
                  <p className="text-xs text-muted-foreground mt-0.5">Due: <span className="font-semibold text-foreground">{dueDateDisplay}</span></p>
                )}
              </div>
              <StatusBadge status={m.status} />
              <button onClick={() => openEdit(m)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {mitigations.length === 0 && (
          <div className="py-4 text-sm text-muted-foreground text-center">No mitigations defined.</div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Mitigation" : "Add Mitigation"} maxWidth="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Mitigation Action" required>
            <textarea className={inputClass} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the mitigation action..." required />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">
              <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="planned">Planned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </FormField>
            <FormField label="Due Date">
              <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </FormField>
          </div>
          <FormActions loading={isSaving} label={editId ? "Update" : "Add Mitigation"} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
