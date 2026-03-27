import { View, Text, ScrollView, Pressable } from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // TODO: Fetch from /api/spmo/notifications

  const typeColors: Record<string, string> = {
    comment: "#3B82F6",
    approval: "#F59E0B",
    assignment: "#16A34A",
    mention: "#7C3AED",
    alert: "#EF4444",
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, gap: 8 }}>
      {notifications.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🔔</Text>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A" }}>No notifications yet</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>You'll see updates here when someone comments or assigns tasks to you.</Text>
        </View>
      )}

      {notifications.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => n.link && router.push(n.link as never)}
          style={{
            backgroundColor: n.read ? "#FFFFFF" : "#EFF6FF",
            borderRadius: 12, padding: 14, borderWidth: 1,
            borderColor: n.read ? "#E2E8F0" : "#BFDBFE",
            flexDirection: "row", gap: 10,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: typeColors[n.type] ?? "#64748B", marginTop: 5 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A" }}>{n.title}</Text>
            {n.body && <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }} numberOfLines={2}>{n.body}</Text>}
            <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
