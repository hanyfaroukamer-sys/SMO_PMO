import { useState } from "react";
import {
  useListDependencies,
  useDeleteDependency,
  useCascadeAnalysis,
  type DepEnrichedRow,
} from "@/hooks/use-dependencies";
import { AddDependencyModal } from "@/components/add-dependency-modal";
import { PageHeader } from "@/components/ui-elements";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  GitMerge,
  Plus,
  Trash2,
  Lock,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEP_TYPE_LABELS: Record<string, string> = {
  "ms-ms": "Milestone → Milestone",
  "ms-proj": "Milestone → Project",
  "proj-proj": "Project → Project",
};

function depTypeBadge(type: string) {
  const colors: Record<string, string> = {
    "ms-ms": "bg-blue-500/10 text-blue-600 border-blue-200",
    "ms-proj": "bg-violet-500/10 text-violet-600 border-violet-200",
    "proj-proj": "bg-orange-500/10 text-orange-600 border-orange-200",
  };
  return colors[type] ?? "bg-muted text-muted-foreground border-border";
}

function CascadePanel({ sourceId, onClose }: { sourceId: number; onClose: () => void }) {
  const { data, isLoading } = useCascadeAnalysis(sourceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-background rounded-[14px] shadow-xl border border-border w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Cascade Impact
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
            Close
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !data ? (
          <p className="text-muted-foreground text-sm">Failed to load cascade analysis.</p>
        ) : data.totalAffected === 0 ? (
          <p className="text-muted-foreground text-sm">No downstream items would be affected.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{data.totalAffected}</span> downstream item
              {data.totalAffected !== 1 ? "s" : ""} would be impacted.
            </p>

            {data.directlyBlocked.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Directly Blocked ({data.directlyBlocked.length})
                </h3>
                <div className="space-y-1.5">
                  {data.directlyBlocked.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <Lock className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span className="font-medium">{item.name}</span>
                      {item.project && item.project !== item.name && (
                        <span className="text-muted-foreground text-xs">({item.project})</span>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground capitalize">{item.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.indirectlyBlocked.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Indirectly Blocked ({data.indirectlyBlocked.length})
                </h3>
                <div className="space-y-1.5">
                  {data.indirectlyBlocked.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.name}</span>
                      {item.project && item.project !== item.name && (
                        <span className="text-xs">({item.project})</span>
                      )}
                      <span className="ml-auto text-[10px] capitalize">{item.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DepRow({
  dep,
  isAdmin,
  onCascade,
}: {
  dep: DepEnrichedRow;
  isAdmin: boolean;
  onCascade: (sourceId: number) => void;
}) {
  const deleteMut = useDeleteDependency();
  const { toast } = useToast();
  const qc = useQueryClient();

  async function handleDelete() {
    if (!confirm(`Remove dependency: "${dep.sourceName}" → "${dep.targetName}"?`)) return;
    try {
      await deleteMut.mutateAsync(dep.id);
      qc.invalidateQueries({ queryKey: ["/api/spmo/dependencies"] });
      toast({ title: "Dependency removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove dependency" });
    }
  }

  return (
    <div className="group flex items-center gap-3 px-5 py-3.5 border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors">
      {/* Source */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{dep.sourceName}</div>
        {dep.sourceProjectName && dep.sourceProjectName !== dep.sourceName && (
          <div className="text-xs text-muted-foreground truncate">{dep.sourceProjectName}</div>
        )}
        <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{dep.sourceType}</div>
      </div>

      {/* Arrow + type */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span
          className={cn(
            "text-[10px] font-semibold border rounded px-1.5 py-0.5",
            depTypeBadge(dep.depType),
          )}
        >
          {DEP_TYPE_LABELS[dep.depType] ?? dep.depType}
        </span>
        <GitMerge className="w-4 h-4 text-muted-foreground" />
        {dep.lagDays > 0 && (
          <span className="text-[10px] text-muted-foreground">+{dep.lagDays}d lag</span>
        )}
      </div>

      {/* Target */}
      <div className="flex-1 min-w-0 text-right">
        <div className="text-sm font-semibold truncate">{dep.targetName}</div>
        {dep.targetProjectName && dep.targetProjectName !== dep.targetName && (
          <div className="text-xs text-muted-foreground truncate">{dep.targetProjectName}</div>
        )}
        <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{dep.targetType}</div>
      </div>

      {/* Hard/Soft badge */}
      <div className="shrink-0">
        <span
          className={cn(
            "text-[10px] font-semibold rounded px-1.5 py-0.5 border",
            dep.isHard
              ? "bg-destructive/10 text-destructive border-destructive/20"
              : "bg-muted text-muted-foreground border-border",
          )}
        >
          {dep.isHard ? "Hard" : "Soft"}
        </span>
      </div>

      {/* Threshold (for proj-proj) */}
      {dep.depType === "proj-proj" && (
        <div className="shrink-0 text-xs text-muted-foreground w-12 text-center">
          ≥{dep.sourceThreshold}%
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onCascade(dep.sourceId)}
          className="p-1.5 rounded-lg hover:bg-warning/10 text-muted-foreground hover:text-warning transition-colors"
          title="Cascade impact"
        >
          <Zap className="w-4 h-4" />
        </button>
        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            title="Remove dependency"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function DependenciesPage() {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useListDependencies();
  const [showAdd, setShowAdd] = useState(false);
  const [cascadeSourceId, setCascadeSourceId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "ms-ms" | "ms-proj" | "proj-proj">("all");

  const allDeps = data?.dependencies ?? [];
  const filtered = filter === "all" ? allDeps : allDeps.filter((d) => d.depType === filter);

  const hardCount = allDeps.filter((d) => d.isHard).length;
  const softCount = allDeps.filter((d) => !d.isHard).length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Dependency Engine"
          description="Manage milestone and project dependencies — blocked items cannot progress until prerequisites are met."
        />
        {isAdmin && (
          <Button onClick={() => setShowAdd(true)} className="shrink-0">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Dependency
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[14px] border border-border bg-card p-4">
          <div className="text-2xl font-bold">{allDeps.length}</div>
          <div className="text-sm text-muted-foreground mt-0.5">Total Dependencies</div>
        </div>
        <div className="rounded-[14px] border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-destructive" />
            <div className="text-2xl font-bold text-destructive">{hardCount}</div>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">Hard Dependencies</div>
        </div>
        <div className="rounded-[14px] border border-border bg-card p-4">
          <div className="text-2xl font-bold text-muted-foreground">{softCount}</div>
          <div className="text-sm text-muted-foreground mt-0.5">Soft Dependencies</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {(["all", "ms-ms", "ms-proj", "proj-proj"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground",
            )}
          >
            {f === "all" ? "All" : DEP_TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="flex-1">Prerequisite (Source)</div>
          <div className="w-40 text-center">Type</div>
          <div className="flex-1 text-right">Dependent (Target)</div>
          <div className="w-16 text-center">Hard?</div>
          <div className="w-20 text-center">Actions</div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <GitMerge className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">
              {allDeps.length === 0 ? "No dependencies have been configured yet." : "No dependencies match the selected filter."}
            </p>
            {isAdmin && allDeps.length === 0 && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Add your first dependency
              </button>
            )}
          </div>
        ) : (
          filtered.map((dep) => (
            <DepRow
              key={dep.id}
              dep={dep}
              isAdmin={isAdmin}
              onCascade={(id) => setCascadeSourceId(id)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddDependencyModal onClose={() => setShowAdd(false)} />
      )}
      {cascadeSourceId !== null && (
        <CascadePanel sourceId={cascadeSourceId} onClose={() => setCascadeSourceId(null)} />
      )}
    </div>
  );
}
