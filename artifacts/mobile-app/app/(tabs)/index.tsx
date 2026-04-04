import { View, Text, ScrollView, RefreshControl, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

const API = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:3000";

const SCREEN_W = Dimensions.get("window").width;

function useApi<T>(path: string) {
  const { accessToken } = useAuth();
  return useQuery<T>({
    queryKey: [path],
    queryFn: async () => {
      const res = await fetch(`${API}/api${path}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });
}

// ── Progress Ring (SVG-free, border-based) ───────────────────────
function ProgressRing({ progress, size = 110, strokeWidth = 9, color = "#3B82F6" }: { progress: number; size?: number; strokeWidth?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth, borderColor: "#1E3A5F", position: "absolute" }} />
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth, borderColor: color,
        borderTopColor: pct > 25 ? color : "transparent",
        borderRightColor: pct > 50 ? color : "transparent",
        borderBottomColor: pct > 75 ? color : "transparent",
        borderLeftColor: pct > 0 ? color : "transparent",
        position: "absolute", transform: [{ rotate: "-90deg" }],
      }} />
      <Text style={{ fontSize: size * 0.28, fontWeight: "900", color: "#FFFFFF" }}>{Math.round(pct)}%</Text>
      <Text style={{ fontSize: size * 0.11, color: "#94A3B8", fontWeight: "600" }}>PROGRESS</Text>
    </View>
  );
}

// ── Section Card ─────────────────────────────────────────────────
function Section({ title, icon, children, onPress }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode; onPress?: () => void }) {
  return (
    <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
      <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Ionicons name={icon} size={16} color="#2563EB" />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: "#0F172A", letterSpacing: 0.3 }}>{title}</Text>
        {onPress && <Ionicons name="chevron-forward" size={16} color="#94A3B8" />}
      </Pressable>
      {children}
    </View>
  );
}

// ── Metric Card ──────────────────────────────────────────────────
function MetricCard({ label, value, sub, color, icon, onPress }: { label: string; value: string; sub?: string; color: string; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, backgroundColor: "#FFF", borderRadius: 14, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + "18", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
      </View>
      <Text style={{ fontSize: 26, fontWeight: "900", color: "#0F172A" }}>{value}</Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", fontWeight: "600", marginTop: 2 }}>{label}</Text>
      {sub && <Text style={{ fontSize: 10, color: "#64748B", marginTop: 1 }}>{sub}</Text>}
    </Pressable>
  );
}

// ── Horizontal bar segment ───────────────────────────────────────
function SegmentedBar({ segments, height = 18 }: { segments: { color: string; value: number; label: string }[]; height?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  return (
    <View style={{ flexDirection: "row", height, borderRadius: height / 2, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
      {segments.filter((s) => s.value > 0).map((seg, i) => (
        <View key={i} style={{ width: `${(seg.value / total) * 100}%` as any, backgroundColor: seg.color, alignItems: "center", justifyContent: "center", minWidth: seg.value > 0 ? 4 : 0 }}>
          {(seg.value / total) > 0.08 && <Text style={{ fontSize: 8, fontWeight: "800", color: "#FFF" }}>{seg.value}</Text>}
        </View>
      ))}
    </View>
  );
}

// ── Types ────────────────────────────────────────────────────────
interface DeptStatus {
  departmentId: number; departmentName: string; departmentColor: string;
  totalProjects: number; onTrack: number; atRisk: number; delayed: number; completed: number; notStarted: number;
}

interface ProjectItem {
  id: number; name: string; progress: number; status: string;
  budget: number; budgetSpent: number; budgetCapex?: number; budgetOpex?: number;
  computedStatus?: { status: string; reason: string };
  startDate: string | null; targetDate: string | null;
}

interface BudgetData {
  totalAllocated: number; totalCapex: number; totalOpex: number; totalSpent: number; utilizationPct: number;
}

// ── Status colors ────────────────────────────────────────────────
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  on_track:    { color: "#16A34A", label: "On Track" },
  at_risk:     { color: "#F59E0B", label: "At Risk" },
  delayed:     { color: "#EF4444", label: "Delayed" },
  completed:   { color: "#059669", label: "Completed" },
  not_started: { color: "#D1D5DB", label: "Not Started" },
  on_hold:     { color: "#9CA3AF", label: "On Hold" },
};

const PILLAR_COLORS = ["#2563EB", "#7C3AED", "#0891B2", "#059669", "#D97706", "#DC2626", "#EC4899", "#6366F1"];

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // ── API calls ──────────────────────────────────────────────
  const { data: overview, refetch: refetchOverview } = useApi<{
    programmeName: string; programmeProgress: number;
    totalMilestones: number; approvedMilestones: number; pendingApprovals: number; activeRisks: number;
    pillarSummaries: { id: number; name: string; pillarType: string; progress: number; color: string }[];
  }>("/spmo/programme");

  const { data: taskCount } = useApi<{ total: number; critical: number; high: number }>("/spmo/my-tasks/count");
  const { data: deptStatus } = useApi<DeptStatus[]>("/spmo/dashboard/department-status");
  const { data: projects } = useApi<{ projects: ProjectItem[] }>("/spmo/projects");
  const { data: budgetData } = useApi<BudgetData>("/spmo/budget");

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchOverview();
    setRefreshing(false);
  }, [refetchOverview]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.firstName ?? user?.email?.split("@")[0] ?? "there";

  const pillars = (overview?.pillarSummaries ?? []).filter((p) => p.pillarType === "strategic_pillar");
  const enablers = (overview?.pillarSummaries ?? []).filter((p) => p.pillarType !== "strategic_pillar");

  // ── Project status counts ──────────────────────────────────
  const projectList = (projects as any)?.projects ?? projects ?? [];
  const allProjects: ProjectItem[] = Array.isArray(projectList) ? projectList : [];
  const statusCounts: Record<string, number> = {};
  for (const p of allProjects) {
    const st = p.computedStatus?.status ?? p.status ?? "not_started";
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
  }

  // ── Budget from project-level data as fallback ─────────────
  const budget = budgetData ?? {
    totalAllocated: allProjects.reduce((s, p) => s + (p.budget ?? 0), 0),
    totalCapex: allProjects.reduce((s, p) => s + (p.budgetCapex ?? 0), 0),
    totalOpex: allProjects.reduce((s, p) => s + (p.budgetOpex ?? 0), 0),
    totalSpent: allProjects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0),
    utilizationPct: 0,
  };
  const totalBudget = budget.totalAllocated || 1;
  const budgetUsedPct = budget.totalAllocated > 0 ? Math.round((budget.totalSpent / budget.totalAllocated) * 100) : 0;
  const mobileCurrency = (overview as any)?.reportingCurrency ?? "SAR";
  const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

  // ── Department data ────────────────────────────────────────
  const departments = deptStatus ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {/* ── Hero header with progress ring ───────────────────── */}
      <View style={{ backgroundColor: "#0F172A", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: "center" }}>
        <Text style={{ fontSize: 13, color: "#94A3B8", fontWeight: "600", marginBottom: 2 }}>{greeting}, {firstName}</Text>
        <Text style={{ fontSize: 15, color: "#E2E8F0", fontWeight: "700", marginBottom: 16, textAlign: "center" }}>{overview?.programmeName ?? "Strategy Programme"}</Text>
        <ProgressRing progress={overview?.programmeProgress ?? 0} />
      </View>

      <View style={{ padding: 16, gap: 14 }}>

        {/* ── Critical alert banner ──────────────────────────── */}
        {(taskCount?.critical ?? 0) > 0 && (
          <Pressable onPress={() => router.push("/(tabs)/tasks" as never)} style={{ backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#FECACA" }}>
            <Ionicons name="alert-circle" size={22} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#991B1B" }}>{taskCount?.critical} critical task{taskCount!.critical !== 1 ? "s" : ""} need attention</Text>
              <Text style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>Tap to review</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#EF4444" />
          </Pressable>
        )}

        {/* ── Key metrics row ────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard label="Milestones" value={`${overview?.approvedMilestones ?? 0}/${overview?.totalMilestones ?? 0}`} sub="approved" color="#2563EB" icon="flag" onPress={() => router.push("/(tabs)/projects" as never)} />
          <MetricCard label="My Tasks" value={String(taskCount?.total ?? 0)} sub={taskCount?.high ? `${taskCount.high} high priority` : undefined} color="#F97316" icon="checkbox" onPress={() => router.push("/(tabs)/tasks" as never)} />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard label="Active Risks" value={String(overview?.activeRisks ?? 0)} sub="open" color="#EF4444" icon="warning" />
          <MetricCard label="Approvals" value={String(overview?.pendingApprovals ?? 0)} sub="pending" color="#7C3AED" icon="checkmark-circle" onPress={() => router.push("/(tabs)/approvals" as never)} />
        </View>

        {/* ── Project Status Breakdown ────────────────────────── */}
        <Section title="Project Status Breakdown" icon="pie-chart-outline">
          {allProjects.length === 0 ? (
            <Text style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", paddingVertical: 16 }}>No projects loaded</Text>
          ) : (
            <>
              <View style={{ alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: "#0F172A" }}>{allProjects.length}</Text>
                <Text style={{ fontSize: 11, color: "#64748B" }}>total projects</Text>
              </View>
              <View style={{ gap: 6 }}>
                {["on_track", "at_risk", "delayed", "completed", "not_started", "on_hold"].map((st) => {
                  const count = statusCounts[st] ?? 0;
                  const pct = allProjects.length > 0 ? Math.round((count / allProjects.length) * 100) : 0;
                  const { color, label } = STATUS_MAP[st] ?? { color: "#9CA3AF", label: st };
                  return (
                    <View key={st} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, opacity: count === 0 ? 0.3 : 1 }} />
                      <Text style={{ flex: 1, fontSize: 13, color: count === 0 ? "#CBD5E1" : "#475569" }}>{label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: count === 0 ? "#CBD5E1" : "#0F172A", width: 24, textAlign: "right" }}>{count}</Text>
                      <Text style={{ fontSize: 10, color: "#94A3B8", width: 32, textAlign: "right" }}>{pct}%</Text>
                    </View>
                  );
                })}
              </View>
              {/* Mini bar */}
              <View style={{ marginTop: 10 }}>
                <SegmentedBar segments={[
                  { color: "#16A34A", value: statusCounts.on_track ?? 0, label: "On Track" },
                  { color: "#F59E0B", value: statusCounts.at_risk ?? 0, label: "At Risk" },
                  { color: "#EF4444", value: statusCounts.delayed ?? 0, label: "Delayed" },
                  { color: "#059669", value: statusCounts.completed ?? 0, label: "Completed" },
                  { color: "#D1D5DB", value: (statusCounts.not_started ?? 0) + (statusCounts.on_hold ?? 0), label: "Other" },
                ]} />
              </View>
            </>
          )}
        </Section>

        {/* ── Budget Overview ─────────────────────────────────── */}
        <Section title="Budget Overview" icon="wallet-outline">
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "900", color: "#0F172A" }}>{mobileCurrency} {fmtM(budget.totalAllocated)}</Text>
              <Text style={{ fontSize: 10, color: "#64748B" }}>total allocated</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: budgetUsedPct > 90 ? "#DC2626" : budgetUsedPct > 70 ? "#D97706" : "#16A34A" }}>{budgetUsedPct}%</Text>
              <Text style={{ fontSize: 10, color: "#64748B" }}>utilized</Text>
            </View>
          </View>

          {/* Allocated vs Spent bar */}
          <View style={{ gap: 8 }}>
            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "600" }}>Spent</Text>
                <Text style={{ fontSize: 10, color: "#0F172A", fontWeight: "700" }}>{mobileCurrency} {fmtM(budget.totalSpent)}</Text>
              </View>
              <View style={{ height: 10, backgroundColor: "#F1F5F9", borderRadius: 5, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${Math.min(100, budgetUsedPct)}%`, backgroundColor: budgetUsedPct > 90 ? "#DC2626" : "#2563EB", borderRadius: 5 }} />
              </View>
            </View>

            {/* CAPEX / OPEX split */}
            {(budget.totalCapex > 0 || budget.totalOpex > 0) && (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10 }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "#2563EB", letterSpacing: 0.5 }}>CAPEX</Text>
                  <Text style={{ fontSize: 16, fontWeight: "900", color: "#0F172A", marginTop: 2 }}>{mobileCurrency} {fmtM(budget.totalCapex)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#FFFBEB", borderRadius: 10, padding: 10 }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "#D97706", letterSpacing: 0.5 }}>OPEX</Text>
                  <Text style={{ fontSize: 16, fontWeight: "900", color: "#0F172A", marginTop: 2 }}>{mobileCurrency} {fmtM(budget.totalOpex)}</Text>
                </View>
              </View>
            )}
          </View>
        </Section>

        {/* ── Department Health Overview ───────────────────────── */}
        {departments.length > 0 && (
          <Section title="Department Health" icon="business-outline">
            {/* Legend */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {[
                { color: "#16A34A", label: "On Track" },
                { color: "#F59E0B", label: "At Risk" },
                { color: "#EF4444", label: "Delayed" },
                { color: "#059669", label: "Done" },
                { color: "#D1D5DB", label: "Not Started" },
              ].map((s) => (
                <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                  <Text style={{ fontSize: 9, color: "#64748B" }}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={{ gap: 12 }}>
              {departments.map((dept) => (
                <View key={dept.departmentId}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={1}>{dept.departmentName}</Text>
                    <Text style={{ fontSize: 10, color: "#94A3B8" }}>{dept.totalProjects} project{dept.totalProjects !== 1 ? "s" : ""}</Text>
                  </View>
                  <SegmentedBar height={16} segments={[
                    { color: "#16A34A", value: dept.onTrack, label: "On Track" },
                    { color: "#F59E0B", value: dept.atRisk, label: "At Risk" },
                    { color: "#EF4444", value: dept.delayed, label: "Delayed" },
                    { color: "#059669", value: dept.completed, label: "Done" },
                    { color: "#D1D5DB", value: dept.notStarted, label: "Not Started" },
                  ]} />
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* ── Strategic Pillars ────────────────────────────────── */}
        {pillars.length > 0 && (
          <Section title="Strategic Pillars" icon="bar-chart-outline">
            {pillars.map((p, i) => {
              const color = p.color || PILLAR_COLORS[i % PILLAR_COLORS.length];
              return (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: i < pillars.length - 1 ? 1 : 0, borderBottomColor: "#F1F5F9" }}>
                  <View style={{ width: 4, height: 28, borderRadius: 2, backgroundColor: color }} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" }} numberOfLines={1}>{p.name}</Text>
                  <View style={{ width: 80, height: 6, backgroundColor: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.min(100, p.progress)}%`, backgroundColor: color, borderRadius: 3 }} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "800", color, width: 40, textAlign: "right" }}>{Math.round(p.progress)}%</Text>
                </View>
              );
            })}
          </Section>
        )}

        {/* ── Cross-Cutting Enablers ──────────────────────────── */}
        {enablers.length > 0 && (
          <Section title="Cross-Cutting Enablers" icon="git-merge-outline">
            {enablers.map((p, i) => {
              const color = p.color || PILLAR_COLORS[(i + 3) % PILLAR_COLORS.length];
              return (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: i < enablers.length - 1 ? 1 : 0, borderBottomColor: "#F1F5F9" }}>
                  <View style={{ width: 4, height: 28, borderRadius: 2, backgroundColor: color }} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" }} numberOfLines={1}>{p.name}</Text>
                  <View style={{ width: 80, height: 6, backgroundColor: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.min(100, p.progress)}%`, backgroundColor: color, borderRadius: 3 }} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "800", color, width: 40, textAlign: "right" }}>{Math.round(p.progress)}%</Text>
                </View>
              );
            })}
          </Section>
        )}

        {/* ── Quick Actions ───────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {([
            { icon: "folder-outline" as const, label: "Projects", route: "/(tabs)/projects" },
            { icon: "checkbox-outline" as const, label: "Tasks", route: "/(tabs)/tasks" },
            { icon: "notifications-outline" as const, label: "Alerts", route: "/notifications" },
          ]).map((a) => (
            <Pressable key={a.label} onPress={() => router.push(a.route as never)} style={{ flex: 1, backgroundColor: "#FFF", borderRadius: 14, padding: 14, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }}>
              <Ionicons name={a.icon} size={22} color="#475569" />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569" }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
