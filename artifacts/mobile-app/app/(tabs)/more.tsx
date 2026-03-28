import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";

const SECTIONS = [
  {
    title: "Views",
    items: [
      { icon: "📊", label: "KPIs", desc: "Strategic & operational indicators", route: "/kpis" },
      { icon: "⚠️", label: "Risks", desc: "Risk register & mitigations", route: "/risks" },
      { icon: "📄", label: "Documents", desc: "Project files & evidence", route: "/documents" },
      { icon: "🔔", label: "Notifications", desc: "In-app alerts & updates", route: "/notifications" },
    ],
  },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const initials = ((user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "")).toUpperCase() || "?";
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "User";
  const roleLabel = user?.role === "admin" ? "Administrator" : user?.role === "approver" ? "Approver" : "Project Manager";
  const roleColor = user?.role === "admin" ? "#7C3AED" : user?.role === "approver" ? "#2563EB" : "#D97706";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={{ backgroundColor: "#0F172A", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, alignItems: "center" }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#334155" }}>
          <Text style={{ fontSize: 24, fontWeight: "900", color: "#E2E8F0" }}>{initials}</Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#F8FAFC", marginTop: 12 }}>{name}</Text>
        <View style={{ backgroundColor: roleColor + "20", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: roleColor }}>{roleLabel}</Text>
        </View>
        {user?.email && <Text style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>{user.email}</Text>}
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4 }}>{section.title}</Text>
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
              {section.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  onPress={() => router.push(item.route as never)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderBottomWidth: i < section.items.length - 1 ? 1 : 0, borderBottomColor: "#F1F5F9" }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8" }}>{item.desc}</Text>
                  </View>
                  <Text style={{ fontSize: 16, color: "#CBD5E1" }}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>App</Text>
          <Text style={{ fontSize: 12, color: "#64748B" }}>StrategyPMO Mobile v1.0.0</Text>
        </View>

        <Pressable onPress={signOut} style={{ backgroundColor: "#FFFFFF", borderRadius: 16, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: "#FECACA", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#DC2626" }}>Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
