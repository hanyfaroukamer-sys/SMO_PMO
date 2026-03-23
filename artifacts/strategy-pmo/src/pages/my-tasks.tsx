import { useGetSpmoMyTasks, type SpmoMyTask, type SpmoMyTaskPriority } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, AlertTriangle, Clock, CheckCircle2, FileText, RefreshCw, ArrowRight, Lock } from "lucide-react";
import { Link } from "wouter";

const PRIORITY_CONFIG: Record<SpmoMyTaskPriority, { label: string; bg: string; border: string; text: string; icon: React.ReactNode }> = {
  critical: {
    label: "Critical",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    text: "text-destructive",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  high: {
    label: "High Priority",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  medium: {
    label: "Medium",
    bg: "bg-warning/5",
    border: "border-warning/20",
    text: "text-warning",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  low: {
    label: "Low",
    bg: "bg-secondary/60",
    border: "border-border",
    text: "text-muted-foreground",
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
  info: {
    label: "Info",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-600",
    icon: <Lock className="w-3.5 h-3.5" />,
  },
};

const TYPE_LABELS: Record<string, string> = {
  approval: "Needs Approval",
  overdue: "Overdue",
  due_soon: "Due Soon",
  weekly_report: "Weekly Report Due",
  progress_update: "Progress Update",
  blocked: "Blocked",
};

function TaskCard({ task }: { task: SpmoMyTask }) {
  const cfg = PRIORITY_CONFIG[task.priority];
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-start gap-3 group transition-all hover:shadow-sm`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${cfg.border} bg-white/80 ${cfg.text}`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.border} ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border bg-background">
            {TYPE_LABELS[task.type] ?? task.type}
          </span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug">{task.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{task.subtitle}</p>
        <p className="text-xs text-muted-foreground/80 mt-1 italic">{task.action}</p>
      </div>
      <Link
        href={task.link}
        className={`shrink-0 flex items-center gap-1 text-xs font-semibold ${cfg.text} hover:underline opacity-0 group-hover:opacity-100 transition-opacity`}
      >
        Open <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

const PRIORITY_ORDER: SpmoMyTaskPriority[] = ["critical", "high", "medium", "low", "info"];

const SECTION_TITLES: Record<SpmoMyTaskPriority, string> = {
  critical: "Critical — Action Required Immediately",
  high: "High Priority",
  medium: "Medium Priority",
  low: "Low Priority / Updates Needed",
  info: "Informational",
};

export default function MyTasks() {
  const { data, isLoading, error, refetch, isFetching } = useGetSpmoMyTasks();

  const tasks = data?.tasks ?? [];
  const tasksByPriority = PRIORITY_ORDER.reduce<Record<SpmoMyTaskPriority, SpmoMyTask[]>>((acc, p) => {
    acc[p] = tasks.filter((t) => t.priority === p);
    return acc;
  }, { critical: [], high: [], medium: [], low: [], info: [] });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="My Tasks"
        description="Pending approvals, overdue milestones, weekly reports, and progress updates assigned to you"
      >
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageHeader>

      {isLoading && (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="p-6 border-destructive/20 bg-destructive/5">
          <p className="text-destructive text-sm">Failed to load tasks. Please try refreshing.</p>
        </Card>
      )}

      {!isLoading && !error && tasks.length === 0 && (
        <Card className="p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
          <p className="text-lg font-semibold text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No pending tasks assigned to you right now.</p>
        </Card>
      )}

      {!isLoading && tasks.length > 0 && (
        <>
          {/* Summary banner */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card shadow-sm">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-semibold">{data?.taskCount ?? 0} task{(data?.taskCount ?? 0) !== 1 ? "s" : ""} require your attention</span>
              {(data?.criticalCount ?? 0) > 0 && (
                <span className="ml-2 text-sm text-destructive font-bold">· {data?.criticalCount} critical</span>
              )}
              {(data?.highCount ?? 0) > 0 && (
                <span className="ml-2 text-sm text-orange-600 font-bold">· {data?.highCount} high</span>
              )}
            </div>
          </div>

          {/* Tasks by priority */}
          {PRIORITY_ORDER.map((priority) => {
            const group = tasksByPriority[priority];
            if (group.length === 0) return null;
            const cfg = PRIORITY_CONFIG[priority];
            return (
              <section key={priority}>
                <h2 className="text-[13px] font-bold text-foreground uppercase tracking-wide border-l-[3px] border-primary pl-2 mb-3">
                  <span className={cfg.text}>{SECTION_TITLES[priority]}</span>
                  <span className="ml-2 text-muted-foreground font-normal normal-case">({group.length})</span>
                </h2>
                <div className="space-y-2.5">
                  {group.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
