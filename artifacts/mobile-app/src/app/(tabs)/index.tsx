import { View, Text, ScrollView, RefreshControl, Pressable, Dimensions, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const { width: SCREEN_W } = Dimensions.get("window");

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

// Progress ring component
function ProgressRing({ progress, size = 100, strokeWidth = 8, color = "#2563EB" }: { progress: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, progress));
  // Simple view-based ring (no SVG needed)
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth, borderColor: "#E2E8F0",
        position: "absolute",
      }} />
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
      <Text style={{ fontSize: size * 0.28, fontWeight: "900", color: "#0F172A" }}>{Math.round(pct)}%</Text>
      <Text style={{ fontSize: size * 0.1, color: "#94A3B8", fontWeight: "600" }}>PROGRESS</Text>
    </View>
  );
}

function MetricCard({ label, value, sub, color, onPress }: { label: string; value: string; sub?: string; color: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
      }}
    >
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

export default function DashboardScreen() {
  const { user, isSignedIn } = useAuth();
  const router = useRouter();

  const { data: overview, refetch } = useApi<{
    programmeName: string; programmeProgress: number;
    totalMilestones: number; approvedMilestones: number; pendingApprovals: number; activeRisks: number;
    pillarSummaries: { id: number; name: string; pillarType: string; progress: number; color: string }[];
  }>("/spmo/programme");

  const { data: taskCount } = useApi<{ total: number; critical: number; high: number }>("/spmo/my-tasks/count");

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  if (!isSignedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A", justifyContent: "center", alignItems: "center", padding: 32 }}>
        <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Text style={{ color: "#FFF", fontSize: 28, fontWeight: "900" }}>S</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: "bold", color: "#FFF", marginBottom: 6 }}>StrategyPMO</Text>
        <Text style={{ fontSize: 13, color: "#94A3B8", marginBottom: 28 }}>Executive Programme Dashboard</Text>
        <Pressable onPress={() => router.push("/(auth)/login")} style={{ backgroundColor: "#2563EB", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, width: "100%" }}>
          <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 15, textAlign: "center" }}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  const progress = Math.round(overview?.programmeProgress ?? 0);
  const pillars = overview?.pillarSummaries ?? [];
  const strategicPillars = pillars.filter((p) => p.pillarType === "pillar");
  const enablers = pillars.filter((p) => p.pillarType === "enabler");
  const totalTasks = taskCount?.total ?? 0;
  const criticalTasks = taskCount?.critical ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {/* Hero gradient header */}
      <View style={{
        backgroundColor: "#0F172A", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32,
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
      }}>
        <Text style={{ fontSize: 14, color: "#94A3B8", fontWeight: "600" }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {user?.firstName ?? "there"}
        </Text>
        <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
          {overview?.programmeName ?? "Strategy Programme"}
        </Text>

        {/* Progress ring centered */}
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <ProgressRing progress={progress} size={120} color="#3B82F6" />
        </View>

        {/* Alert banner */}
        {criticalTasks > 0 && (
          <Pressable
            onPress={() => router.push("/tasks")}
            style={{
              backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 12, padding: 12, marginTop: 16,
              flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)",
            }}
          >
            <Ionicons name="alert-circle" size={18} color="#FCA5A5" style={{ marginRight: 8 }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: "#FCA5A5" }}>
              {criticalTasks} critical task{criticalTasks > 1 ? "s" : ""} need immediate attention
            </Text>
            <Text style={{ color: "#FCA5A5", fontSize: 14 }}>→</Text>
          </Pressable>
        )}
      </View>

      <View style={{ padding: 16, gap: 16, marginTop: -8 }}>
        {/* Metric cards row */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard
            label="Milestones"
            value={`${overview?.approvedMilestones ?? 0}/${overview?.totalMilestones ?? 0}`}
            sub="approved"
            color="#16A34A"
          />
          <MetricCard
            label="Tasks"
            value={String(totalTasks)}
            sub={criticalTasks > 0 ? `${criticalTasks} critical` : "all clear"}
            color={criticalTasks > 0 ? "#EF4444" : "#2563EB"}
            onPress={() => router.push("/tasks")}
          />
          <MetricCard
            label="Risks"
            value={String(overview?.activeRisks ?? 0)}
            sub="open"
            color="#F59E0B"
          />
        </View>

        {/* Strategic Pillars */}
        {strategicPillars.length > 0 && (
          <View style={{
            backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16,
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
          }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#0F172A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Strategic Pillars
            </Text>
            {strategicPillars.map((p) => <PillarRow key={p.id} name={p.name} progress={p.progress} color={p.color} />)}
          </View>
        )}

        {/* Enablers */}
        {enablers.length > 0 && (
          <View style={{
            backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16,
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
          }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#0F172A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Cross-Cutting Enablers
            </Text>
            {enablers.map((p) => <PillarRow key={p.id} name={p.name} progress={p.progress} color={p.color} />)}
          </View>
        )}

        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {([
            { icon: "checkbox-outline" as const, label: "My Tasks", route: "/(tabs)/tasks", bg: "#EFF6FF", border: "#BFDBFE", color: "#2563EB" },
            { icon: "folder-outline" as const, label: "Projects", route: "/(tabs)/projects", bg: "#F0FDF4", border: "#BBF7D0", color: "#16A34A" },
            { icon: "notifications-outline" as const, label: "Alerts", route: "/notifications", bg: "#FEF3C7", border: "#FDE68A", color: "#D97706" },
          ] as const).map((a) => (
            <Pressable
              key={a.label}
              onPress={() => router.push(a.route as never)}
              style={{
                flex: 1, backgroundColor: a.bg, borderRadius: 14, paddingVertical: 16, alignItems: "center",
                borderWidth: 1, borderColor: a.border,
              }}
            >
              <Ionicons name={a.icon} size={22} color={a.color} style={{ marginBottom: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: a.color }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
