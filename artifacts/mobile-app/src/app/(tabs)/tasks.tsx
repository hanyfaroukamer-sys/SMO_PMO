import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { TaskCard } from "@/components/TaskCard";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function TasksScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();

  const { data, isLoading, refetch } = useQuery<{
    taskCount: number; criticalCount: number; highCount: number;
    tasks: { id: string; type: string; priority: string; title: string; subtitle: string; action: string; link: string }[];
  }>({
    queryKey: ["/spmo/my-tasks"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/spmo/my-tasks`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      return res.json();
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  const tasks = data?.tasks ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Group by priority
  const groups = ["critical", "high", "medium", "low", "info"].map((p) => ({
    priority: p,
    tasks: tasks.filter((t) => t.priority === p),
  })).filter((g) => g.tasks.length > 0);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["low", "info"]));
  const toggle = (p: string) => setCollapsed((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const priorityLabels: Record<string, string> = { critical: "Critical", high: "High Priority", medium: "Medium", low: "Low", info: "Info" };
  const priorityColors: Record<string, string> = { critical: "#EF4444", high: "#F97316", medium: "#EAB308", low: "#94A3B8", info: "#3B82F6" };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {/* Summary */}
      <View style={{ backgroundColor: "#FFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 14, fontWeight: "bold", flex: 1 }}>{data?.taskCount ?? 0} tasks</Text>
        {(data?.criticalCount ?? 0) > 0 && <Text style={{ fontSize: 11, fontWeight: "bold", color: "#EF4444", marginRight: 8 }}>{data?.criticalCount} critical</Text>}
        {(data?.highCount ?? 0) > 0 && <Text style={{ fontSize: 11, fontWeight: "bold", color: "#F97316" }}>{data?.highCount} high</Text>}
      </View>

      {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 32 }} />}

      {!isLoading && tasks.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A" }}>All caught up!</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>No pending tasks right now.</Text>
        </View>
      )}

      {groups.map((g) => (
        <View key={g.priority}>
          <Pressable onPress={() => toggle(g.priority)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priorityColors[g.priority] }} />
            <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0F172A", flex: 1, textTransform: "uppercase" }}>
              {priorityLabels[g.priority]} ({g.tasks.length})
            </Text>
            <Text style={{ fontSize: 12, color: "#94A3B8" }}>{collapsed.has(g.priority) ? "▸" : "▾"}</Text>
          </Pressable>
          {!collapsed.has(g.priority) && (
            <View style={{ gap: 8, marginTop: 4 }}>
              {g.tasks.map((task) => (
                <TaskCard key={task.id} task={task} onPress={() => {
                  if (task.link.startsWith("/projects/")) {
                    const id = task.link.split("/")[2]?.split("?")[0];
                    if (id) router.push(`/projects/${id}` as never);
                  }
                }} />
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
