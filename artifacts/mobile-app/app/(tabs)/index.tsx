import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";

const API = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:3000";

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

function ProgressRing({ progress, size = 120, strokeWidth = 10, color = "#3B82F6" }: { progress: number; size?: number; strokeWidth?: number; color?: string }) {
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
        position: "absolute",
        transform: [{ rotate: "-90deg" }],
      }} />
      <Text style={{ fontSize: size * 0.28, fontWeight: "900", color: "#FFFFFF" }}>{Math.round(pct)}%</Text>
      <Text style={{ fontSize: size * 0.09, color: "#94A3B8", fontWeight: "600" }}>PROGRESS</Text>
    </View>
  );
}

function MetricCard({ label, value, sub, color, onPress }: { label: string; value: string; sub?: string; color: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
      <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: color, marginBottom: 10 }} />
      <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: "900", color: "#0F172A", marginTop: 2 }}>{value}</Text>
      {sub && <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{sub}</Text>}
    </Pressable>
  );
}

function PillarRow({ name, progress, color }: { name: string; progress: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
      <View style={{ width: 4, height: 28, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#1E293B" }} numberOfLines={1}>{name}</Text>
      <View style={{ width: 80, height: 6, backgroundColor: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.min(100, progress)}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: "800", color, width: 40, textAlign: "right" }}>{Math.round(progress)}%</Text>
    </View>
  );
}

const PILLAR_COLORS = ["#2563EB", "#7C3AED", "#0891B2", "#059669", "#D97706", "#DC2626"];

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const { data: overview, refetch } = useApi<{
    programmeName: string; programmeProgress: number;
    totalMilestones: number; approvedMilestones: number; pendingApprovals: number; activeRisks: number;
    pillarSummaries: { id: number; name: string; pillarType: string; progress: number; color: string }[];
  }>("/spmo/programme");

  const { data: taskCount } = useApi<{ total: number; critical: number; high: number }>("/spmo/my-tasks/count");

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.firstName ?? user?.email?.split("@")[0] ?? "there";

  const pillars = (overview?.pillarSummaries ?? []).filter((p) => p.pillarType === "strategic_pillar");
  const enablers = (overview?.pillarSummaries ?? []).filter((p) => p.pillarType !== "strategic_pillar");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      <View style={{ backgroundColor: "#0F172A", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: "center" }}>
        <Text style={{ fontSize: 13, color: "#94A3B8", fontWeight: "600", marginBottom: 4 }}>{greeting}, {firstName}</Text>
        <Text style={{ fontSize: 15, color: "#E2E8F0", fontWeight: "700", marginBottom: 20, textAlign: "center" }}>{overview?.programmeName ?? "National Strategy"}</Text>
        <ProgressRing progress={overview?.programmeProgress ?? 0} />
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {(taskCount?.critical ?? 0) > 0 && (
          <Pressable onPress={() => router.push("/(tabs)/tasks" as never)} style={{ backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#FECACA" }}>
            <Text style={{ fontSize: 18 }}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#991B1B" }}>{taskCount?.critical} critical task{taskCount!.critical !== 1 ? "s" : ""} need attention</Text>
              <Text style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>Tap to review →</Text>
            </View>
          </Pressable>
        )}

        <View style={{ flexDirection: "row", gap: 12 }}>
          <MetricCard label="Milestones" value={String(overview?.approvedMilestones ?? 0)} sub={`of ${overview?.totalMilestones ?? 0}`} color="#2563EB" onPress={() => router.push("/(tabs)/projects" as never)} />
          <MetricCard label="My Tasks" value={String(taskCount?.total ?? 0)} sub={taskCount?.high ? `${taskCount.high} high` : undefined} color="#F97316" onPress={() => router.push("/(tabs)/tasks" as never)} />
          <MetricCard label="Risks" value={String(overview?.activeRisks ?? 0)} sub="active" color="#EF4444" />
        </View>

        {pillars.length > 0 && (
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Strategic Pillars</Text>
            {pillars.map((p, i) => <PillarRow key={p.id} name={p.name} progress={p.progress} color={PILLAR_COLORS[i % PILLAR_COLORS.length]} />)}
          </View>
        )}

        {enablers.length > 0 && (
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Cross-Cutting Enablers</Text>
            {enablers.map((p, i) => <PillarRow key={p.id} name={p.name} progress={p.progress} color={PILLAR_COLORS[(i + 3) % PILLAR_COLORS.length]} />)}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          {[{ icon: "📋", label: "Projects", route: "/(tabs)/projects" }, { icon: "📥", label: "Inbox", route: "/(tabs)/tasks" }, { icon: "🔔", label: "Alerts", route: "/notifications" }].map((a) => (
            <Pressable key={a.label} onPress={() => router.push(a.route as never)} style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }}>
              <Text style={{ fontSize: 24 }}>{a.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#475569" }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
