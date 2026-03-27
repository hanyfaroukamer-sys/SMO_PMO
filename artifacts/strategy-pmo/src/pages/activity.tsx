import { useState } from "react";
import { useListSpmoActivityLog } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import {
  Loader2, FileText, ShieldCheck, ChevronLeft, ChevronRight,
  Calendar, Filter, X, RefreshCw, ExternalLink, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { useIsAdmin } from "@/hooks/use-is-admin";

const PAGE_SIZE = 50;

const ACTION_META: Record<string, { label: string; color: string; dot: string }> = {
  created:                { label: "Created",           color: "bg-primary/10 text-primary",          dot: "bg-primary" },
  updated:                { label: "Updated",           color: "bg-blue-100 text-blue-700",           dot: "bg-blue-500" },
  deleted:                { label: "Deleted",           color: "bg-destructive/10 text-destructive",  dot: "bg-destructive" },
  submitted:              { label: "Submitted",         color: "bg-violet-100 text-violet-700",       dot: "bg-violet-500" },
  approved:               { label: "Approved",          color: "bg-success/10 text-success",          dot: "bg-success" },
  rejected:               { label: "Rejected",          color: "bg-orange-100 text-orange-700",       dot: "bg-orange-500" },
  uploaded_evidence:      { label: "Evidence Uploaded", color: "bg-sky-100 text-sky-700",             dot: "bg-sky-500" },
  ran_ai_assessment:      { label: "AI Assessment",     color: "bg-violet-100 text-violet-700",       dot: "bg-violet-500" },
  weekly_report_submitted:{ label: "Weekly Report",     color: "bg-teal-100 text-teal-700",           dot: "bg-teal-500" },
};

const ENTITY_LABELS: Record<string, string> = {
  project:        "Project",
  milestone:      "Milestone",
  initiative:     "Initiative",
  pillar:         "Pillar",
  kpi:            "KPI",
  risk:           "Risk",
  budget:         "Budget Entry",
  change_request: "Change Request",
  procurement:    "Procurement",
  evidence:       "Evidence",
  department:     "Department",
};

const FRIENDLY_FIELDS: Record<string, string> = {
  name:               "Name",
  description:        "Description",
  status:             "Status",
  progress:           "Progress",
  startDate:          "Start Date",
  targetDate:         "Target Date",
  budget:             "Budget",
  budgetSpent:        "Budget Spent",
  capexBudget:        "CAPEX Budget",
  opexBudget:         "OPEX Budget",
  ownerName:          "Owner",
  ownerDepartment:    "Department",
  healthStatus:       "Health Status",
  riskScore:          "Risk Score",
  likelihood:         "Likelihood",
  impact:             "Impact",
  mitigation:         "Mitigation",
  weight:             "Weight",
  currentValue:       "Current Value",
  targetValue:        "Target Value",
  baselineValue:      "Baseline Value",
  changeType:         "Change Type",
  budgetImpact:       "Budget Impact",
  timelineImpact:     "Timeline Impact",
  weekStart:          "Week Start",
  keyAchievements:    "Key Achievements",
  nextSteps:          "Next Steps",
  issues:             "Issues",
  updatedFields:      "Fields Changed",
};

function renderFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.toLowerCase().includes("budget") || key.toLowerCase().includes("capex") || key.toLowerCase().includes("opex")) {
      return `${(value / 1_000_000).toFixed(2)}M SAR`;
    }
    if (key === "progress") return `${value}%`;
    if (key === "riskScore") return String(value);
    return String(value);
  }
  if (typeof value === "string") {
    if (key.toLowerCase().includes("date") && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return format(new Date(value), "d MMM yyyy");
    }
    return value.length > 80 ? value.slice(0, 80) + "…" : value;
  }
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value).slice(0, 80);
}

function renderDetails(
  action: string,
  entityType: string,
  entityName: string,
  details: Record<string, unknown> | null,
) {
  if (!details) return null;
  const isWeeklyReport = action === "weekly_report_submitted";

  if (isWeeklyReport) {
    const weekStart = details.weekStart as string | undefined;
    const keyAchievements = details.keyAchievements as string | undefined;
    const nextSteps = details.nextSteps as string | undefined;
    const issues = details.issues as string | undefined;
    return (
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {weekStart && (
          <div className="col-span-full text-xs text-muted-foreground">
            Week of {format(new Date(weekStart + "T00:00:00"), "d MMM yyyy")}
          </div>
        )}
        {keyAchievements && (
          <div className="rounded-md bg-secondary/40 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Key Achievements</div>
            <p className="text-xs text-foreground/80 line-clamp-4 whitespace-pre-wrap">{keyAchievements}</p>
          </div>
        )}
        {nextSteps && (
          <div className="rounded-md bg-secondary/40 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Next Steps</div>
            <p className="text-xs text-foreground/80 line-clamp-4 whitespace-pre-wrap">{nextSteps}</p>
          </div>
        )}
        {issues && (
          <div className="col-span-full rounded-md bg-warning/5 border border-warning/20 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-warning mb-1">Issues</div>
            <p className="text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">{issues}</p>
          </div>
        )}
      </div>
    );
  }

  if (action === "ran_ai_assessment") {
    return <p className="text-xs text-muted-foreground mt-1">AI analysis run on programme data.</p>;
  }

  if (action === "uploaded_evidence") {
    const fileName = details.fileName as string | undefined;
    return fileName ? (
      <p className="text-xs text-muted-foreground mt-1">File: <span className="font-medium text-foreground">{fileName}</span></p>
    ) : null;
  }

  const skipKeys = new Set(["weekStart", "keyAchievements", "nextSteps", "issues", "id", "projectId", "initiativeId", "pillarId", "milestoneId", "link", "changes", "projectName", "projectCode"]);

  // Render before/after changes (new format)
  const changes = details.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  const link = details.link as string | undefined;
  const projectName = details.projectName as string | undefined;

  const legacyItems = Object.entries(details).filter(([k]) => !skipKeys.has(k));
  const hasChanges = changes && Object.keys(changes).length > 0;
  const hasLegacy = legacyItems.length > 0;

  if (!hasChanges && !hasLegacy) return null;

  const sectionLabel = ENTITY_LABELS[entityType] ?? entityType;

  return (
    <div className="mt-2 space-y-2">
      {/* Project context for milestones */}
      {projectName && entityType === "milestone" && (
        <div className="text-[11px] text-muted-foreground">
          Project: <span className="font-semibold text-foreground">{projectName}</span>
        </div>
      )}

      {/* Before → After changes */}
      {hasChanges && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            What changed
          </div>
          <div className="space-y-1">
            {Object.entries(changes).map(([key, { from: fromVal, to: toVal }]) => {
              const label = FRIENDLY_FIELDS[key] ?? key.replace(/([A-Z])/g, " $1").trim();
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground font-medium min-w-[80px]">{label}</span>
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 line-through truncate max-w-[150px]">
                    {renderFieldValue(key, fromVal)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-semibold truncate max-w-[150px]">
                    {renderFieldValue(key, toVal)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Legacy flat items (old log entries without before/after) */}
      {!hasChanges && hasLegacy && (
        <>
          {action === "updated" && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Updated values in {sectionLabel} <span className="normal-case font-normal">(logged before audit tracking — previous values not available)</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {legacyItems.slice(0, 8).map(([key, value]) => {
              const label = FRIENDLY_FIELDS[key] ?? key.replace(/([A-Z])/g, " $1").trim();
              const val = renderFieldValue(key, value);
              return (
                <div key={key} className="inline-flex items-center gap-1 bg-secondary/50 rounded-md px-2 py-1 text-xs border border-border/60">
                  <span className="text-muted-foreground font-medium">{label}:</span>
                  <span className="text-foreground font-semibold truncate max-w-[180px]">{val}</span>
                </div>
              );
            })}
            {legacyItems.length > 8 && (
              <span className="text-xs text-muted-foreground self-center">+{legacyItems.length - 8} more</span>
            )}
          </div>
        </>
      )}

      {/* Navigation link */}
      {link && (
        <Link href={link} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline mt-1">
          <ExternalLink className="w-3 h-3" /> View {sectionLabel}
        </Link>
      )}
    </div>
  );
}

function buildContextLine(entityType: string, details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const parts: string[] = [];
  const sectionLabel = ENTITY_LABELS[entityType];
  if (sectionLabel) parts.push(sectionLabel);
  if (details.pillarName) parts.push(`Pillar: ${details.pillarName}`);
  if (details.initiativeName) parts.push(`Initiative: ${details.initiativeName}`);
  if (details.projectName && entityType !== "project") parts.push(`Project: ${details.projectName}`);
  if (details.kpiCode) parts.push(`KPI: ${details.kpiCode}`);
  return parts.length > 1 ? parts.join(" › ") : null;
}

const ALL_ACTIONS = [
  "created", "updated", "deleted", "submitted", "approved", "rejected",
  "uploaded_evidence", "ran_ai_assessment", "weekly_report_submitted",
];
const ALL_ENTITY_TYPES = [
  "project", "milestone", "initiative", "pillar", "kpi", "risk",
  "budget", "change_request", "procurement", "evidence", "department",
];

export default function ActivityLog() {
  const isAdmin = useIsAdmin();
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const params = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(dateFrom ? { from: dateFrom } : {}),
    ...(dateTo ? { to: dateTo } : {}),
    ...(filterEntityType ? { entityType: filterEntityType } : {}),
    ...(filterAction ? { action: filterAction } : {}),
  };

  const { data, isLoading, refetch } = useListSpmoActivityLog(params);

  const totalPages = data?.total ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  const hasActiveFilters = !!(dateFrom || dateTo || filterEntityType || filterAction);

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setFilterEntityType("");
    setFilterAction("");
    setPage(0);
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to view the activity log.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in">
      <PageHeader
        title="Activity Log"
        description={`Full audit trail of all programme actions${total > 0 ? ` · ${total.toLocaleString()} entries` : ""}`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              hasActiveFilters
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-secondary text-foreground"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filter
            {hasActiveFilters && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {[dateFrom, dateTo, filterEntityType, filterAction].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </PageHeader>

      {/* Filter panel */}
      {showFilters && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">From</label>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">To</label>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Section</label>
              <select
                value={filterEntityType}
                onChange={(e) => { setFilterEntityType(e.target.value); setPage(0); }}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All sections</option>
                {ALL_ENTITY_TYPES.map((et) => (
                  <option key={et} value={et}>{ENTITY_LABELS[et] ?? et}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Action</label>
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All actions</option>
                {ALL_ACTIONS.map((a) => (
                  <option key={a} value={a}>{ACTION_META[a]?.label ?? a}</option>
                ))}
              </select>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Results info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : (
            total === 0 ? "No entries found" :
            `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()} entries`
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md border border-border hover:bg-secondary disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-muted-foreground tabular-nums">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md border border-border hover:bg-secondary disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Log entries */}
      <Card noPadding className="overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {hasActiveFilters ? "No entries match the selected filters." : "No activity recorded yet."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => {
              const meta = ACTION_META[entry.action] ?? { label: entry.action, color: "bg-secondary text-foreground", dot: "bg-muted-foreground" };
              const details = entry.details as Record<string, unknown> | null;
              const contextLine = buildContextLine(entry.entityType, details);
              const isWeeklyReport = entry.action === "weekly_report_submitted";
              const entityLabel = ENTITY_LABELS[entry.entityType] ?? entry.entityType;

              return (
                <div key={entry.id} className="flex items-start gap-4 px-6 py-4 hover:bg-secondary/10 transition-colors">
                  {/* Icon/dot */}
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                    {isWeeklyReport ? (
                      <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                        <FileText className="w-3.5 h-3.5 text-teal-600" />
                      </div>
                    ) : (
                      <div className={`w-3 h-3 rounded-full ${meta.dot}`} />
                    )}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: action badge + entity name + section breadcrumb */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border border-border/60 bg-secondary/50 px-1.5 py-0.5 rounded">
                        {entityLabel}
                      </span>
                      <span className="font-semibold text-sm text-foreground">{entry.entityName}</span>
                    </div>

                    {/* Context breadcrumb (section → initiative → project) */}
                    {contextLine && (
                      <p className="text-[11px] text-muted-foreground mb-1">{contextLine}</p>
                    )}

                    {/* Detail chips / expanded content */}
                    {renderDetails(entry.action, entry.entityType, entry.entityName, details)}
                  </div>

                  {/* Right: actor + timestamp */}
                  <div className="text-right shrink-0 min-w-[100px]">
                    <div className="text-sm font-semibold text-foreground/80">{entry.actorName || entry.actorId}</div>
                    <div className="text-xs text-muted-foreground" title={format(new Date(entry.createdAt), "d MMM yyyy HH:mm")}>
                      {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {format(new Date(entry.createdAt), "d MMM yyyy")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-30 text-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          {/* Page jumper */}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const half = 3;
              let p: number;
              if (totalPages <= 7) {
                p = i;
              } else if (page < 4) {
                p = i < 6 ? i : totalPages - 1;
              } else if (page > totalPages - 5) {
                p = i === 0 ? 0 : totalPages - 7 + i;
              } else {
                p = i === 0 ? 0 : i === 6 ? totalPages - 1 : page - half + i;
              }
              const isEllipsis = totalPages > 7 && ((i === 1 && page >= 4) || (i === 5 && page <= totalPages - 5));
              if (isEllipsis) return <span key={i} className="text-muted-foreground px-1 text-sm">…</span>;
              return (
                <button
                  key={i}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                    page === p ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-muted-foreground"
                  }`}
                >
                  {p + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-30 text-sm transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
