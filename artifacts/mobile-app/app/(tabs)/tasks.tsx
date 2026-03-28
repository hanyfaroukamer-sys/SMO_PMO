import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";

const API = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:3000";

const PRIORITY_STYLES: Record<string, { bg: string; dot: string; border: string; text: string }> = {
  critical: { bg: "#FEF2F2", dot: "#EF4444", border: "#FECACA", text: "#991B1B" },
  high:     { bg: "#FFF7ED", dot: "#F97316", border: "#FED7AA", text: "#9A3412" },
  medium:   { bg: "#FFFBEB", dot: "#EAB308", border: "#FDE68A", text: "#854D0E" },
  low:      { bg: "#F8FAFC", dot: "#94A3B8", border: "#E2E8F0", text: "#475569" },
  info:     { bg: "#EFF6FF", dot: "#3B82F6", border: "#BFDBFE", text: "#1E40AF" },
};

function TaskItem({ task, onPress }: { task: { id: string; type: string; priority: string; title: string; subtitle: string; action: string }; onPress: () => void }) {
  const s = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.low;
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: s.bg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: s.border, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.dot, marginTop: 5 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>{task.title}</Text>
        <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }} numberOfLines={1}>{task.subtitle}</Text>
        <Text style={{ fontSize: 10, color: s.text, marginTop: 4, fontStyle: "italic" }}>{task.action}</Text>
      </View>
      <Text style={{ fontSize: 16, color: "#CBD5E1" }}>›</Text>
    </Pressable>
  );
}

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
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const groups = ["critical", "high", "medium", "low", "info"]
    .map((p) => ({ priority: p, tasks: tasks.filter((t) => t.priority === p) }))
    .filter((g) => g.tasks.length > 0);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["low", "info"]));
  const toggle = (p: string) => setCollapsed((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const labels: Record<string, string> = { critical: "Critical", high: "High Priority", medium: "Medium", low: "Low", info: "Info" };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <View style={{ backgroundColor: "#FFF", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <Text style={{ fontSize: 14, fontWeight: "900", color: "#0F172A" }}>{data?.taskCount ?? 0}</Text>
          <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600" }}>tasks</Text>
        </View>
        {(data?.criticalCount ?? 0) > 0 && (
          <View style={{ backgroundColor: "#FEF2F2", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#FECACA" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" }} />
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#DC2626" }}>{data?.criticalCount} critical</Text>
          </View>
        )}
        {(data?.highCount ?? 0) > 0 && (
          <View style={{ backgroundColor: "#FFF7ED", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#FED7AA" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#F97316" }} />
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#EA580C" }}>{data?.highCount} high</Text>
          </View>
        )}
      </View>

      {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 48 }} />}

      {!isLoading && tasks.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 64 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>✅</Text>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>All caught up</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4, textAlign: "center" }}>No pending tasks. You're on top of things.</Text>
        </View>
      )}

      {groups.map((g) => (
        <View key={g.priority}>
          <Pressable onPress={() => toggle(g.priority)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIORITY_STYLES[g.priority]?.dot ?? "#94A3B8" }} />
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#0F172A", flex: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>{labels[g.priority] ?? g.priority}</Text>
            <View style={{ backgroundColor: PRIORITY_STYLES[g.priority]?.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: PRIORITY_STYLES[g.priority]?.border }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: PRIORITY_STYLES[g.priority]?.text }}>{g.tasks.length}</Text>
            </View>
            <Text style={{ fontSize: 14, color: "#94A3B8" }}>{collapsed.has(g.priority) ? "▸" : "▾"}</Text>
          </Pressable>
          {!collapsed.has(g.priority) && (
            <View style={{ gap: 8, marginTop: 4 }}>
              {g.tasks.map((task) => (
                <TaskItem key={task.id} task={task} onPress={() => {
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
