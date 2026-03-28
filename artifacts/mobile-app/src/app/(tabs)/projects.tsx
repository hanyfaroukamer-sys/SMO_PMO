import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  on_track:    { label: "On Track", color: "#16A34A", bg: "#DCFCE7" },
  at_risk:     { label: "At Risk", color: "#D97706", bg: "#FEF3C7" },
  delayed:     { label: "Delayed", color: "#DC2626", bg: "#FEE2E2" },
  completed:   { label: "Done", color: "#2563EB", bg: "#DBEAFE" },
  not_started: { label: "Not Started", color: "#94A3B8", bg: "#F1F5F9" },
  on_hold:     { label: "On Hold", color: "#6B7280", bg: "#F3F4F6" },
};

function ProjectItem({ project, onPress }: { project: { id: number; name: string; projectCode: string | null; progress: number; status: string; computedStatus?: { status: string } }; onPress: () => void }) {
  const cs = project.computedStatus?.status ?? project.status;
  const s = STATUS_CONFIG[cs] ?? STATUS_CONFIG.not_started;
  const pct = Math.round(project.progress ?? 0);

  return (
    <Pressable onPress={onPress} style={{
      backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
      borderLeftWidth: 4, borderLeftColor: s.color,
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          {project.projectCode && <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "700", fontFamily: "monospace" }}>{project.projectCode}</Text>}
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>{project.name}</Text>
        </View>
        <View style={{ backgroundColor: s.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: s.color }}>{s.label}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, height: 6, backgroundColor: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${pct}%`, backgroundColor: s.color, borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: "900", color: "#0F172A", width: 40, textAlign: "right" }}>{pct}%</Text>
      </View>
    </Pressable>
  );
}

export default function ProjectsScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();

  const { data, isLoading, refetch } = useQuery<{
    projects: { id: number; name: string; projectCode: string | null; progress: number; status: string; ownerId: string; computedStatus?: { status: string } }[];
  }>({
    queryKey: ["/spmo/projects"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/spmo/projects`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      return res.json();
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  const allProjects = data?.projects ?? [];
  const myProjects = allProjects.filter((p) => p.ownerId === user?.id);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A", flex: 1 }}>
          {myProjects.length} Project{myProjects.length !== 1 ? "s" : ""}
        </Text>
        <Text style={{ fontSize: 11, color: "#64748B" }}>Owned by you</Text>
      </View>

      {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 48 }} />}

      {!isLoading && myProjects.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 64 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📁</Text>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>No projects assigned</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>Ask admin to set you as project owner.</Text>
        </View>
      )}

      {myProjects.map((p) => (
        <ProjectItem key={p.id} project={p} onPress={() => router.push(`/projects/${p.id}` as never)} />
      ))}
    </ScrollView>
  );
}
