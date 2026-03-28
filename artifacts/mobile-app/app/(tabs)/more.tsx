import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";

const MENU_ITEMS = [
  { label: "KPIs", icon: "📊", description: "Strategic and operational KPIs" },
  { label: "Risks", icon: "⚠️", description: "Risk register and mitigations" },
  { label: "Documents", icon: "📄", description: "Project documents" },
  { label: "Notifications", icon: "🔔", description: "In-app notifications", route: "/notifications" },
];

export default function MoreScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* User info */}
      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#2563EB" }}>
            {(user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A" }}>
            {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "User"}
          </Text>
          <Text style={{ fontSize: 12, color: "#64748B" }}>{user?.role ?? "project-manager"}</Text>
        </View>
      </View>

      {/* Menu items */}
      {MENU_ITEMS.map((item) => (
        <Pressable
          key={item.label}
          onPress={() => item.route && router.push(item.route as never)}
          style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <Text style={{ fontSize: 24 }}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{item.label}</Text>
            <Text style={{ fontSize: 12, color: "#64748B" }}>{item.description}</Text>
          </View>
          <Text style={{ color: "#94A3B8" }}>›</Text>
        </Pressable>
      ))}

      {/* Sign out */}
      <Pressable
        onPress={signOut}
        style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#FECACA", alignItems: "center" }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#DC2626" }}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}
