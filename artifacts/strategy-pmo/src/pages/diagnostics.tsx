import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  Loader2, ShieldCheck, Database, Server, HardDrive, Clock,
  Table2, Cpu, RefreshCw, CheckCircle2, XCircle, Activity,
} from "lucide-react";

interface DiagnosticsData {
  appVersion: string;
  nodeVersion: string;
  environment: string;
  database: { status: string; latencyMs: number };
  tableCounts: Record<string, number>;
  config: { programmeName: string | null; weeklyResetDay: number | null; riskAlertThreshold: number | null; reminderDaysAhead: number | null; lastAiAssessmentAt: string | null };
  memory: { rss: string; heapUsed: string; heapTotal: string; external: string };
  uptime: { formatted: string; ms: number };
  serverTime: string;
}

function StatCard({ icon: Icon, label, value, sub, status }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  status?: "healthy" | "warning" | "error";
}) {
  const statusCls = status === "healthy" ? "text-green-600" : status === "error" ? "text-destructive" : status === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <Card className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`text-lg font-bold ${statusCls}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}

export default function Diagnostics() {
  const isAdmin = useIsAdmin();
  const { data, isLoading, refetch, isFetching } = useQuery<DiagnosticsData>({
    queryKey: ["/api/spmo/admin/diagnostics"],
    queryFn: () => customFetch("/api/spmo/admin/diagnostics"),
    refetchInterval: 30_000,
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="System Diagnostics" description="Application health, database status, and configuration overview">
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
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      )}

      {data && (
        <>
          {/* Status cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Server}
              label="App Version"
              value={`v${data.appVersion}`}
              sub={`Node ${data.nodeVersion} · ${data.environment}`}
            />
            <StatCard
              icon={Database}
              label="Database"
              value={data.database.status === "healthy" ? "Connected" : "Error"}
              sub={`${data.database.latencyMs}ms latency`}
              status={data.database.status === "healthy" ? "healthy" : "error"}
            />
            <StatCard
              icon={Clock}
              label="Uptime"
              value={data.uptime.formatted}
              sub={`Since ${new Date(Date.now() - data.uptime.ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
            />
            <StatCard
              icon={Cpu}
              label="Memory"
              value={data.memory.heapUsed}
              sub={`${data.memory.heapTotal} total · ${data.memory.rss} RSS`}
              status={parseInt(data.memory.heapUsed) > 500 ? "warning" : "healthy"}
            />
          </div>

          {/* Table counts */}
          <Card>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
              <Table2 className="w-4 h-4 text-primary" /> Database Table Counts
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {Object.entries(data.tableCounts).map(([table, count]) => (
                <div key={table} className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                  <div className="text-xl font-bold tabular-nums">{count.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
                    {table.replace(/_/g, " ")}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Configuration */}
          <Card>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" /> Programme Configuration
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Programme</div>
                <div className="text-sm font-semibold">{data.config.programmeName ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Weekly Reset Day</div>
                <div className="text-sm font-semibold">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][data.config.weeklyResetDay ?? 3]}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Risk Alert Threshold</div>
                <div className="text-sm font-semibold">Score ≥ {data.config.riskAlertThreshold ?? 9}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Reminder Days Ahead</div>
                <div className="text-sm font-semibold">{data.config.reminderDaysAhead ?? 3} days</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">Last AI Assessment:</div>
                {data.config.lastAiAssessmentAt ? (
                  <div className="flex items-center gap-1.5 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    {new Date(data.config.lastAiAssessmentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <XCircle className="w-3.5 h-3.5" /> Never run
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Server info */}
          <Card>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-primary" /> Server Info
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Server Time</div>
                <div className="font-mono text-xs">{new Date(data.serverTime).toLocaleString("en-GB")}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">RSS Memory</div>
                <div className="font-mono text-xs">{data.memory.rss}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">External Memory</div>
                <div className="font-mono text-xs">{data.memory.external}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Environment</div>
                <div className="font-mono text-xs">{data.environment}</div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
