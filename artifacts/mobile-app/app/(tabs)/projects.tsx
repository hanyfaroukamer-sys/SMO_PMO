import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, TextInput, Platform } from "react-native";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useListSpmoProjects } from "@workspace/api-client-react";
import { ProjectCard } from "@/components/ProjectCard";

export default function ProjectsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const isWeb = Platform.OS === "web";

  const { data, isLoading, refetch } = useListSpmoProjects({ page: 1, limit: 200 });
  const allProjects = data?.projects ?? [];

  const projects = useMemo(() => {
    if (!search.trim()) return allProjects;
    const q = search.toLowerCase();
    return allProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.projectCode ?? "").toLowerCase().includes(q)
    );
  }, [allProjects, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      {/* Search bar */}
      <View style={{ padding: 12, paddingTop: isWeb ? 12 + 67 : 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", paddingHorizontal: 12 }}>
          <Feather name="search" size={16} color="#94A3B8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search projects..."
            placeholderTextColor="#94A3B8"
            style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14, color: "#0F172A", fontFamily: "Inter_400Regular" }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={16} color="#94A3B8" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10, paddingBottom: isWeb ? 34 + 84 : 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 48 }} />
        ) : (
          <>
            <Text style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular", marginBottom: 4 }}>
              {projects.length} project{projects.length !== 1 ? "s" : ""}
              {search ? " matching your search" : ""}
            </Text>

            {projects.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 48 }}>
                <Feather name="folder" size={36} color="#CBD5E1" />
                <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#0F172A", marginTop: 12 }}>
                  {search ? "No results found" : "No projects assigned"}
                </Text>
                <Text style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" }}>
                  {search ? "Try a different search term." : "Ask admin to set you as project owner."}
                </Text>
              </View>
            )}

            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project as { id: number; name: string; projectCode: string | null; progress: number; status: string; budget: number; budgetSpent: number }}
                onPress={() => router.push(`/projects/${project.id}`)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
