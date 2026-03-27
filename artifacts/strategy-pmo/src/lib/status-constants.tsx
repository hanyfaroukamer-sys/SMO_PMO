// Standardized status colors used across all pages
// Single source of truth for RAG status visualization

export type HealthStatus = "on_track" | "at_risk" | "delayed" | "completed" | "not_started" | "on_hold";

export const STATUS_CONFIG: Record<HealthStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  text: string;
  pieColor: string;
}> = {
  on_track:    { label: "On Track",    color: "#16a34a", bg: "bg-green-50",   border: "border-green-200",  text: "text-green-700",  pieColor: "#86efac" },
  at_risk:     { label: "At Risk",     color: "#f59e0b", bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-700",  pieColor: "#f59e0b" },
  delayed:     { label: "Delayed",     color: "#ef4444", bg: "bg-red-50",     border: "border-red-200",    text: "text-red-600",    pieColor: "#ef4444" },
  completed:   { label: "Completed",   color: "#2563eb", bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-700",   pieColor: "#16a34a" },
  not_started: { label: "Not Started", color: "#94a3b8", bg: "bg-slate-50",   border: "border-slate-200",  text: "text-slate-500",  pieColor: "#d1d5db" },
  on_hold:     { label: "On Hold",     color: "#6b7280", bg: "bg-gray-50",    border: "border-gray-200",   text: "text-gray-500",   pieColor: "#9ca3af" },
};

export const STATUS_ORDER: HealthStatus[] = ["on_track", "at_risk", "delayed", "completed", "not_started", "on_hold"];

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
      <Icon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 transition-all"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
