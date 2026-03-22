import { useState } from "react";
import { useCreateDependency } from "@/hooks/use-dependencies";
import { useListSpmoProjects, useListSpmoMilestones } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, GitMerge, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NodeType = "milestone" | "project";
type DepType = "ms-ms" | "ms-proj" | "proj-proj";

interface NodeOption {
  id: number;
  label: string;
  sub?: string;
  type: NodeType;
}

function useMilestonesForProject(projectId: number | null) {
  return useListSpmoMilestones(projectId ?? 0);
}

export function AddDependencyModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createMut = useCreateDependency();

  const { data: projectsData } = useListSpmoProjects();
  const projects = projectsData?.projects ?? [];

  const [sourceNodeType, setSourceNodeType] = useState<NodeType>("milestone");
  const [sourceProjectId, setSourceProjectId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);

  const [targetNodeType, setTargetNodeType] = useState<NodeType>("milestone");
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);

  const [isHard, setIsHard] = useState(true);
  const [lagDays, setLagDays] = useState(0);
  const [sourceThreshold, setSourceThreshold] = useState(100);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: sourceMilestonesData } = useMilestonesForProject(
    sourceNodeType === "milestone" ? sourceProjectId : null,
  );
  const { data: targetMilestonesData } = useMilestonesForProject(
    targetNodeType === "milestone" ? targetProjectId : null,
  );

  const sourceMilestones = sourceMilestonesData?.milestones ?? [];
  const targetMilestones = targetMilestonesData?.milestones ?? [];

  function computeDepType(): DepType | null {
    if (sourceNodeType === "milestone" && targetNodeType === "milestone") return "ms-ms";
    if (sourceNodeType === "milestone" && targetNodeType === "project") return "ms-proj";
    if (sourceNodeType === "project" && targetNodeType === "project") return "proj-proj";
    return null; // proj → milestone not supported per spec
  }

  const depType = computeDepType();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourceId) { setError("Please select a source item."); return; }
    if (!targetId) { setError("Please select a target item."); return; }
    if (!depType) { setError("Project → Milestone dependencies are not supported. Use Milestone → Project instead."); return; }
    if (sourceId === targetId && sourceNodeType === targetNodeType) {
      setError("Source and target cannot be the same.");
      return;
    }

    try {
      await createMut.mutateAsync({
        sourceType: sourceNodeType,
        sourceId,
        targetType: targetNodeType,
        targetId,
        depType,
        sourceThreshold,
        lagDays,
        isHard,
        notes: notes.trim() || undefined,
      });

      qc.invalidateQueries({ queryKey: ["/api/spmo/dependencies"] });
      toast({ title: "Dependency added", description: "The dependency has been created." });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create dependency";
      setError(msg);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const selectClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-background rounded-[14px] shadow-xl border border-border w-full max-w-xl">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-border">
          <GitMerge className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Add Dependency</h2>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground text-sm">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Source section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Prerequisite (must be met first)
            </h3>

            <div className="flex gap-2">
              {(["milestone", "project"] as NodeType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setSourceNodeType(t); setSourceId(null); setSourceProjectId(null); }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-colors",
                    sourceNodeType === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {sourceNodeType === "milestone" && (
              <select
                className={selectClass}
                value={sourceProjectId ?? ""}
                onChange={(e) => { setSourceProjectId(Number(e.target.value) || null); setSourceId(null); }}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {sourceNodeType === "milestone" && sourceProjectId && (
              <select
                className={selectClass}
                value={sourceId ?? ""}
                onChange={(e) => setSourceId(Number(e.target.value) || null)}
              >
                <option value="">Select milestone…</option>
                {sourceMilestones.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}

            {sourceNodeType === "project" && (
              <select
                className={selectClass}
                value={sourceId ?? ""}
                onChange={(e) => setSourceId(Number(e.target.value) || null)}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {sourceNodeType === "project" && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground shrink-0">Completion threshold:</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={sourceThreshold}
                  onChange={(e) => setSourceThreshold(Math.min(100, Math.max(1, parseInt(e.target.value) || 100)))}
                  className={cn(inputClass, "w-20")}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
          </div>

          {/* Target section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Dependent (blocked until prerequisite met)
            </h3>

            <div className="flex gap-2">
              {(["milestone", "project"] as NodeType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTargetNodeType(t); setTargetId(null); setTargetProjectId(null); }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-colors",
                    targetNodeType === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {targetNodeType === "milestone" && (
              <select
                className={selectClass}
                value={targetProjectId ?? ""}
                onChange={(e) => { setTargetProjectId(Number(e.target.value) || null); setTargetId(null); }}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {targetNodeType === "milestone" && targetProjectId && (
              <select
                className={selectClass}
                value={targetId ?? ""}
                onChange={(e) => setTargetId(Number(e.target.value) || null)}
              >
                <option value="">Select milestone…</option>
                {targetMilestones.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}

            {targetNodeType === "project" && (
              <select
                className={selectClass}
                value={targetId ?? ""}
                onChange={(e) => setTargetId(Number(e.target.value) || null)}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Dependency Strength</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsHard(true)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
                    isHard
                      ? "bg-destructive/10 text-destructive border-destructive/30"
                      : "bg-background text-muted-foreground border-border",
                  )}
                >
                  Hard
                </button>
                <button
                  type="button"
                  onClick={() => setIsHard(false)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
                    !isHard
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-background text-muted-foreground border-border",
                  )}
                >
                  Soft
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Lag Days</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={lagDays}
                  onChange={(e) => setLagDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className={cn(inputClass, "w-20")}
                />
                <span className="text-xs text-muted-foreground">days after source completes</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Explain why this dependency exists…"
              className={inputClass}
            />
          </div>

          {/* Dep type indicator */}
          {depType && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Type: <span className="font-semibold text-foreground capitalize">{depType.replace("-", " → ")}</span>
              {isHard ? " · Hard block (target cannot progress until source is done)" : " · Soft warning only"}
            </div>
          )}
          {!depType && sourceNodeType === "project" && targetNodeType === "milestone" && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Project → Milestone dependencies are not supported. Try Milestone → Project instead.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMut.isPending || !depType}>
              {createMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Create Dependency
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
