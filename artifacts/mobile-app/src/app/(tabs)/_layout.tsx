import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

function TabIcon({ name, focused, badge }: { name: keyof typeof Ionicons.glyphMap; focused: boolean; badge?: number }) {
  return (
    <View style={{ alignItems: "center", position: "relative" }}>
      <Ionicons name={name} size={22} color={focused ? "#2563EB" : "#94A3B8"} />
      {(badge ?? 0) > 0 && (
        <View style={{
          position: "absolute", top: -6, right: -12,
          backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18,
          alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
          borderWidth: 2, borderColor: "#FFF",
        }}>
          <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "800" }}>{badge! > 99 ? "99+" : badge}</Text>
        </View>
      )}
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
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "home" : "home-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          headerTitle: "My Tasks",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "checkbox" : "checkbox-outline"} focused={focused} badge={taskCount?.total} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "My Projects",
          headerTitle: "My Projects",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "folder" : "folder-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          headerTitle: "More",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "grid" : "grid-outline"} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
