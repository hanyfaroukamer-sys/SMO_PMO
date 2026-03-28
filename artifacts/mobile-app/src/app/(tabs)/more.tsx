import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { Ionicons } from "@expo/vector-icons";

const FEATURE_GRID = [
  { icon: "analytics-outline" as const, label: "KPIs", color: "#2563EB", bg: "#EFF6FF", route: "/kpis" },
  { icon: "warning-outline" as const, label: "Risks", color: "#D97706", bg: "#FFFBEB", route: "/risks" },
  { icon: "document-text-outline" as const, label: "Documents", color: "#7C3AED", bg: "#F5F3FF", route: "/documents" },
  { icon: "notifications-outline" as const, label: "Notifications", color: "#EF4444", bg: "#FEF2F2", route: "/notifications" },
];

export default function MoreScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const initials = ((user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "")).toUpperCase() || "?";
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "User";
  const roleLabel = user?.role === "admin" ? "Administrator" : user?.role === "approver" ? "Approver" : "Project Manager";
  const roleColor = user?.role === "admin" ? "#7C3AED" : user?.role === "approver" ? "#2563EB" : "#D97706";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }}>
      {/* Feature grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {FEATURE_GRID.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.route as never)}
            style={{
              width: "47%", backgroundColor: item.bg, borderRadius: 16, padding: 20, alignItems: "center", gap: 8,
              shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
            }}
          >
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: item.color + "18", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={item.icon} size={24} color={item.color} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Profile card */}
      <View style={{
        backgroundColor: "#FFF", borderRadius: 16, padding: 20,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{
            width: 52, height: 52, borderRadius: 26, backgroundColor: "#0F172A",
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: "#E2E8F0" }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A" }}>{name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <View style={{ backgroundColor: roleColor + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: roleColor }}>{roleLabel}</Text>
              </View>
            </View>
            {user?.email && <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{user.email}</Text>}
          </View>
        </View>
      </View>

      {/* App info + sign out */}
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 11, color: "#94A3B8", textAlign: "center" }}>StrategyPMO Mobile v1.0.0</Text>
        <Pressable
          onPress={signOut}
          style={{
            backgroundColor: "#FFF", borderRadius: 14, paddingVertical: 14, alignItems: "center",
            flexDirection: "row", justifyContent: "center", gap: 8,
            borderWidth: 1, borderColor: "#FECACA",
          }}
        >
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#DC2626" }}>Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
