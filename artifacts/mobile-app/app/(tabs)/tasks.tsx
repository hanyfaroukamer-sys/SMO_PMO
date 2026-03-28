import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Platform } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { TaskCard } from "@/components/TaskCard";

interface SpmoTask {
  id: string;
  type: string;
  priority: string;
  title: string;
  subtitle: string;
  link: string;
}

export default function TasksScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<SpmoTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isWeb = Platform.OS === "web";

  const fetchTasks = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
      const res = await fetch(`https://${domain}/spmo/my-tasks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{
        padding: 16,
        paddingTop: isWeb ? 16 + 67 : 16,
        gap: 10,
        paddingBottom: isWeb ? 34 + 84 : 100,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {isLoading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 48 }} />
      ) : (
        <>
          <Text style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular", marginBottom: 4 }}>
            {tasks.length} task{tasks.length !== 1 ? "s" : ""} require your attention
          </Text>

          {tasks.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <Feather name="check-circle" size={36} color="#CBD5E1" />
              <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#0F172A", marginTop: 12 }}>
                All caught up!
              </Text>
              <Text style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular", marginTop: 4 }}>
                Pull down to refresh your task list.
              </Text>
            </View>
          )}

          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onPress={() => {
                if (task.link?.startsWith("/projects/")) {
                  const id = task.link.split("/")[2]?.split("?")[0];
                  if (id) router.push(`/projects/${id}`);
                }
              }}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}
