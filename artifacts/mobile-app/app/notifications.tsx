import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useApi, apiFetch } from "@/utils/api";
import { useQueryClient } from "@tanstack/react-query";

interface Notification {
  id: number; type: string; title: string; body: string | null;
  link: string | null; read: boolean; createdAt: string;
}

const typeColors: Record<string, string> = {
  comment: "#3B82F6", approval: "#F59E0B", assignment: "#16A34A", mention: "#7C3AED", alert: "#EF4444",
};

export default function NotificationsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useApi<{ notifications: Notification[]; unreadCount: number }>("/spmo/notifications");
  const notifications = data?.notifications ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const markAllRead = async () => {
    try {
      await apiFetch("/spmo/notifications/read-all", { method: "POST" });
      qc.invalidateQueries({ queryKey: ["/spmo/notifications"] });
    } catch { /* ignore */ }
  };

  const handleTap = async (n: Notification) => {
    if (!n.read) {
      try {
        await apiFetch(`/spmo/notifications/${n.id}/read`, { method: "POST" });
        qc.invalidateQueries({ queryKey: ["/spmo/notifications"] });
      } catch { /* ignore */ }
    }
    if (n.link?.startsWith("/projects/")) {
      const id = n.link.split("/")[2]?.split("?")[0];
      if (id) router.push(`/projects/${id}` as never);
    }
  };

  const fmtTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A", flex: 1 }}>{notifications.length} Notifications</Text>
        {(data?.unreadCount ?? 0) > 0 && (
          <Pressable onPress={markAllRead} style={{ backgroundColor: "#EFF6FF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 32 }} />}

      {!isLoading && notifications.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 64 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🔔</Text>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>No notifications yet</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4, textAlign: "center" }}>Updates will appear here when someone comments or assigns tasks.</Text>
        </View>
      )}

      {notifications.map((n) => (
        <Pressable key={n.id} onPress={() => handleTap(n)}
          style={{
            backgroundColor: n.read ? "#FFF" : "#EFF6FF", borderRadius: 14, padding: 14, borderWidth: 1,
            borderColor: n.read ? "#E2E8F0" : "#BFDBFE", flexDirection: "row", gap: 10,
            shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
          }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.read ? "#CBD5E1" : (typeColors[n.type] ?? "#3B82F6"), marginTop: 5 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: n.read ? "500" : "700", color: "#0F172A" }}>{n.title}</Text>
            {n.body && <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }} numberOfLines={2}>{n.body}</Text>}
            <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{fmtTime(n.createdAt)}</Text>
          </View>
          {n.link && <Text style={{ fontSize: 14, color: "#CBD5E1", alignSelf: "center" }}>›</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}
