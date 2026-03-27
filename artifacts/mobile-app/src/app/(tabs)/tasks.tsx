import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { TaskCard } from "@/components/TaskCard";

export default function TasksScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // TODO: import { useGetSpmoMyTasks } from "@workspace/api-client-react";
  const tasks: { id: string; type: string; priority: string; title: string; subtitle: string; link: string }[] = [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      <Text style={{ fontSize: 14, color: "#64748B", marginBottom: 8 }}>
        {tasks.length} task{tasks.length !== 1 ? "s" : ""} require your attention
      </Text>

      {tasks.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A" }}>All caught up!</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>No pending tasks right now.</Text>
        </View>
      )}

      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onPress={() => {
          // Navigate based on link — parse "/projects/123?tab=milestones"
          if (task.link.startsWith("/projects/")) {
            const id = task.link.split("/")[2]?.split("?")[0];
            if (id) router.push(`/projects/${id}`);
          }
        }} />
      ))}
    </ScrollView>
  );
}
