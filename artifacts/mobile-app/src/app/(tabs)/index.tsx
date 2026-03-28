import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

function useApi<T>(path: string) {
  const { accessToken } = useAuth();
  return useQuery<T>({
    queryKey: [path],
    queryFn: async () => {
      const res = await fetch(`${API}/api${path}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });
}

export default function DashboardScreen() {
  const { user, isSignedIn } = useAuth();
  const router = useRouter();

  const { data: overview, isLoading, refetch } = useApi<{
    programmeName: string;
    programmeProgress: number;
    totalMilestones: number;
    approvedMilestones: number;
    pendingApprovals: number;
    activeRisks: number;
    alertCount: number;
    pillarSummaries: { id: number; name: string; pillarType: string; progress: number; color: string }[];
  }>("/spmo/programme");

  const { data: taskCount } = useApi<{ total: number; critical: number; high: number }>("/spmo/my-tasks/count");

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (!isSignedIn) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>Sign in to continue</Text>
        <Pressable onPress={() => router.push("/(auth)/login")} style={{ backgroundColor: "#2563EB", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: "#FFF", fontWeight: "bold" }}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  const progress = Math.round(overview?.programmeProgress ?? 0);
  const pillars = overview?.pillarSummaries ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      <View>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#0F172A" }}>
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}
        </Text>
        <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
          {overview?.programmeName ?? "Programme Dashboard"}
        </Text>
      </View>

      {/* KPI Cards */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: "#FFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "600", textTransform: "uppercase" }}>Progress</Text>
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#2563EB", marginTop: 4 }}>{progress}%</Text>
          <ProgressBar progress={progress} showLabel={false} />
        </View>
        <View style={{ flex: 1, backgroundColor: "#FFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "600", textTransform: "uppercase" }}>Milestones</Text>
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#16A34A", marginTop: 4 }}>{overview?.approvedMilestones ?? 0}/{overview?.totalMilestones ?? 0}</Text>
          <Text style={{ fontSize: 10, color: "#94A3B8" }}>approved</Text>
        </View>
      </View>

      {/* Attention Required */}
      {(taskCount?.critical ?? 0) + (taskCount?.high ?? 0) > 0 && (
        <Pressable onPress={() => router.push("/tasks")} style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FECACA" }}>
          <Text style={{ fontSize: 13, fontWeight: "bold", color: "#DC2626", marginBottom: 4 }}>⚠ Attention Required</Text>
          <Text style={{ fontSize: 12, color: "#7F1D1D" }}>
            {taskCount?.critical ?? 0} critical · {taskCount?.high ?? 0} high priority tasks
          </Text>
        </Pressable>
      )}

      {/* Pillars */}
      <View style={{ backgroundColor: "#FFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
        <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0F172A", marginBottom: 12 }}>Pillar Progress</Text>
        {pillars.map((p) => (
          <View key={p.id} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: "#374151", fontWeight: "500" }}>{p.name}</Text>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: p.color }}>{Math.round(p.progress)}%</Text>
            </View>
            <View style={{ height: 5, backgroundColor: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
              <View style={{ height: "100%", width: `${Math.min(100, p.progress)}%`, backgroundColor: p.color, borderRadius: 3 }} />
            </View>
          </View>
        ))}
        {pillars.length === 0 && !isLoading && (
          <Text style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", paddingVertical: 16 }}>No programme data loaded</Text>
        )}
      </View>

      {/* Quick Actions */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable onPress={() => router.push("/tasks")} style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#BFDBFE" }}>
          <Text style={{ fontSize: 20, marginBottom: 4 }}>📋</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#2563EB" }}>My Tasks</Text>
          {(taskCount?.total ?? 0) > 0 && <Text style={{ fontSize: 10, color: "#64748B" }}>{taskCount?.total} pending</Text>}
        </Pressable>
        <Pressable onPress={() => router.push("/projects")} style={{ flex: 1, backgroundColor: "#F0FDF4", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#BBF7D0" }}>
          <Text style={{ fontSize: 20, marginBottom: 4 }}>📁</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#16A34A" }}>My Projects</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/notifications")} style={{ flex: 1, backgroundColor: "#FEF3C7", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#FDE68A" }}>
          <Text style={{ fontSize: 20, marginBottom: 4 }}>🔔</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#D97706" }}>Alerts</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
