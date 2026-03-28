import { useState } from "react";
import { useGetSpmoMyTasks, type SpmoMyTask, type SpmoMyTaskPriority } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, AlertTriangle, Clock, CheckCircle2, FileText, RefreshCw, ArrowRight, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

const PRIORITY_CONFIG: Record<SpmoMyTaskPriority, { label: string; bg: string; border: string; text: string; icon: React.ReactNode; summary: string }> = {
  critical: {
    label: "Critical",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    text: "text-destructive",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    summary: "Requires immediate action",
  },
  high: {
    label: "High Priority",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    summary: "Needs attention soon",
  },
  medium: {
    label: "Medium",
    bg: "bg-warning/5",
    border: "border-warning/20",
    text: "text-warning",
    icon: <Clock className="w-3.5 h-3.5" />,
    summary: "Upcoming deadlines",
  },
  low: {
    label: "Low",
    bg: "bg-secondary/60",
    border: "border-border",
    text: "text-muted-foreground",
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    summary: "Routine updates",
  },
  info: {
    label: "Info",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-600",
    icon: <Lock className="w-3.5 h-3.5" />,
    summary: "For your awareness",
  },
};

const TYPE_LABELS: Record<string, string> = {
  approval: "Needs Approval",
  overdue: "Overdue",
  due_soon: "Due Soon",
  weekly_report: "Weekly Report Due",
  progress_update: "Progress Update",
  blocked: "Blocked",
  action_assigned: "Action Item",
  risk_alert: "Risk Alert",
  owner_milestone_overdue: "Project Milestone Overdue",
  owner_milestone_due_soon: "Project Milestone Due Soon",
  project_delayed: "Project Delayed",
  project_at_risk: "Project At Risk",
};

const ACTION_LABELS: Record<string, string> = {
  approval: "Review & Approve",
  overdue: "Update Now",
  due_soon: "Update Progress",
  weekly_report: "Submit Report",
  progress_update: "Update Progress",
  blocked: "View Details",
  action_assigned: "Complete Action",
  risk_alert: "Review Risk",
  owner_milestone_overdue: "Follow Up",
  owner_milestone_due_soon: "Check Status",
  project_delayed: "Intervene Now",
  project_at_risk: "Review Plan",
};

function TaskCard({ task }: { task: SpmoMyTask }) {
  const [, navigate] = useLocation();
  const cfg = PRIORITY_CONFIG[task.priority];
  const actionLabel = ACTION_LABELS[task.type] ?? "Open";

  return (
    <div
      onClick={() => navigate(task.link)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(task.link); }}
      className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-start gap-3 group transition-all hover:shadow-md cursor-pointer hover:brightness-95 active:scale-[0.99]`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${cfg.border} bg-white/80 ${cfg.text}`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.border} ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border bg-background">
            {TYPE_LABELS[task.type] ?? task.type}
          </span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug">{task.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{task.subtitle}</p>
        <p className="text-xs text-muted-foreground/70 mt-1 italic">{task.action}</p>
      </div>
      <div className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${cfg.border} ${cfg.bg} ${cfg.text} group-hover:opacity-100 transition-all whitespace-nowrap`}>
        {actionLabel} <ArrowRight className="w-3 h-3" />
      </div>
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

function CollapsibleSection({ priority, tasks }: { priority: SpmoMyTaskPriority; tasks: SpmoMyTask[] }) {
  const [expanded, setExpanded] = useState(priority === "critical" || priority === "high");
  const cfg = PRIORITY_CONFIG[priority];

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-2 text-left group"
      >
        <span className={`transition-transform ${expanded ? "" : "-rotate-90"}`}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </span>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0`} style={{ backgroundColor: priority === "critical" ? "#ef4444" : priority === "high" ? "#f97316" : priority === "medium" ? "#eab308" : priority === "info" ? "#3b82f6" : "#9ca3af" }} />
        <span className="text-[13px] font-bold text-foreground uppercase tracking-wide flex-1">
          <span className={cfg.text}>{SECTION_TITLES[priority]}</span>
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.text}`}>
          {tasks.length}
        </span>
        <span className="text-[11px] text-muted-foreground hidden sm:block">{cfg.summary}</span>
      </button>
      {expanded && (
        <div className="space-y-2.5 ml-6 mt-1 mb-4 animate-in slide-in-from-top-1 duration-200">
          {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
        </div>
      )}
    </section>
  );
}

export default function MyTasks() {
  const { data, isLoading, error, refetch, isFetching } = useGetSpmoMyTasks();

  const tasks = data?.tasks ?? [];
  const tasksByPriority = PRIORITY_ORDER.reduce<Record<SpmoMyTaskPriority, SpmoMyTask[]>>((acc, p) => {
    acc[p] = tasks.filter((t) => t.priority === p);
    return acc;
  }, { critical: [], high: [], medium: [], low: [], info: [] });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="My Tasks"
        description="Milestones, action items, reports, and project alerts assigned to you"
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
            <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold">{data?.taskCount ?? 0} task{(data?.taskCount ?? 0) !== 1 ? "s" : ""}</span>
              {PRIORITY_ORDER.map((p) => {
                const count = tasksByPriority[p].length;
                if (count === 0) return null;
                const cfg = PRIORITY_CONFIG[p];
                return (
                  <span key={p} className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.text}`}>
                    {count} {cfg.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Collapsible priority groups */}
          <div className="space-y-1">
            {PRIORITY_ORDER.map((priority) => {
              const group = tasksByPriority[priority];
              if (group.length === 0) return null;
              return <CollapsibleSection key={priority} priority={priority} tasks={group} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}
