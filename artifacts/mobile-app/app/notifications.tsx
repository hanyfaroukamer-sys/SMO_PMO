import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";

interface SpmoNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  comment:    "#3B82F6",
  approval:   "#F59E0B",
  assignment: "#16A34A",
  mention:    "#7C3AED",
  alert:      "#EF4444",
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<SpmoNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isWeb = Platform.OS === "web";

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
      const res = await fetch(`https://${domain}/spmo/notifications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  const markRead = async (id: number) => {
    if (!accessToken) return;
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
      await fetch(`https://${domain}/spmo/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch {
      // silently fail
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{
        padding: 16,
        paddingTop: isWeb ? 16 + 67 : 16,
        gap: 8,
        paddingBottom: isWeb ? 34 : 32,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {isLoading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 48 }} />
      ) : notifications.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Feather name="bell" size={36} color="#CBD5E1" />
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#0F172A", marginTop: 12 }}>No notifications yet</Text>
          <Text style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" }}>
            You'll see updates here when someone comments or assigns tasks to you.
          </Text>
        </View>
      ) : (
        notifications.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => {
              markRead(n.id);
              if (n.link?.startsWith("/projects/")) {
                const parts = n.link.split("/");
                const id = parts[2]?.split("?")[0];
                if (id) router.push(`/projects/${id}`);
              }
            }}
            style={{
              backgroundColor: n.read ? "#FFFFFF" : "#EFF6FF",
              borderRadius: 12, padding: 14, borderWidth: 1,
              borderColor: n.read ? "#E2E8F0" : "#BFDBFE",
              flexDirection: "row", gap: 10,
            }}
          >
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: TYPE_COLORS[n.type] ?? "#64748B",
              marginTop: 5,
              opacity: n.read ? 0.4 : 1,
            }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#0F172A" }}>{n.title}</Text>
              {n.body && (
                <Text style={{ fontSize: 12, color: "#64748B", fontFamily: "Inter_400Regular", marginTop: 2 }} numberOfLines={2}>
                  {n.body}
                </Text>
              )}
              <Text style={{ fontSize: 10, color: "#94A3B8", fontFamily: "Inter_400Regular", marginTop: 4 }}>
                {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#2563EB", marginTop: 5 }} />}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
