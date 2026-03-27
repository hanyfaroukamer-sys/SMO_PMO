import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { ProjectCard } from "@/components/ProjectCard";

export default function ProjectsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // TODO: import { useListSpmoProjects, useGetCurrentAuthUser } from "@workspace/api-client-react";
  const projects: { id: number; name: string; projectCode: string | null; progress: number; status: string; budget: number; budgetSpent: number }[] = [];

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
        {projects.length} project{projects.length !== 1 ? "s" : ""} assigned to you
      </Text>

      {projects.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A" }}>No projects assigned</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>Ask admin to set you as project owner.</Text>
        </View>
      )}

      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onPress={() => router.push(`/projects/${project.id}`)}
        />
      ))}
    </ScrollView>
  );
}
