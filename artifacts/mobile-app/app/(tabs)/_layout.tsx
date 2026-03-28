import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

const API = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:3000";

function TabBadge({ count, focused }: { count: number; focused: boolean }) {
  if (count <= 0) return null;
  return (
    <View style={{
      position: "absolute", top: -6, right: -12,
      backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
      borderWidth: 2, borderColor: "#FFF",
    }}>
      <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "800" }}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { accessToken } = useAuth();

  const { data: taskCount } = useQuery<{ total: number }>({
    queryKey: ["/spmo/my-tasks/count"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/spmo/my-tasks/count`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  const { data: approvalsData } = useQuery<{ items: unknown[] }>({
    queryKey: ["/spmo/pending-approvals"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/spmo/pending-approvals`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  const pendingApprovals = approvalsData?.items?.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          elevation: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
        headerStyle: { backgroundColor: "#0F172A", elevation: 0, shadowOpacity: 0 },
        headerTitleStyle: { color: "#FFFFFF", fontWeight: "bold", fontSize: 17 },
        headerTintColor: "#FFFFFF",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerTitle: "StrategyPMO",
          tabBarIcon: ({ focused }) => (
            <View style={{ alignItems: "center", position: "relative" }}>
              <Ionicons name={focused ? "home" : "home-outline"} size={22} color={focused ? "#2563EB" : "#94A3B8"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Approvals",
          headerTitle: "Pending Approvals",
          tabBarIcon: ({ focused }) => (
            <View style={{ alignItems: "center", position: "relative" }}>
              <Ionicons name={focused ? "checkmark-circle" : "checkmark-circle-outline"} size={22} color={focused ? "#2563EB" : "#94A3B8"} />
              <TabBadge count={pendingApprovals} focused={focused} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          headerTitle: "My Tasks",
          tabBarIcon: ({ focused }) => (
            <View style={{ alignItems: "center", position: "relative" }}>
              <Ionicons name={focused ? "checkbox" : "checkbox-outline"} size={22} color={focused ? "#2563EB" : "#94A3B8"} />
              <TabBadge count={taskCount?.total ?? 0} focused={focused} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          headerTitle: "My Projects",
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? "folder" : "folder-outline"} size={22} color={focused ? "#2563EB" : "#94A3B8"} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          headerTitle: "More",
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={focused ? "#2563EB" : "#94A3B8"} />
          ),
        }}
      />
    </Tabs>
  );
}
