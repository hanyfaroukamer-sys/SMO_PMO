import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListSpmoProjects } from "@workspace/api-client-react";
import { useAuth } from "@/providers/AuthProvider";

type StatusKey = "on-track" | "at-risk" | "delayed" | "completed" | "not-started";

const STATUS_COLORS: Record<StatusKey, { bg: string; text: string; dot: string }> = {
  "on-track":    { bg: "#DCFCE7", text: "#15803D", dot: "#16A34A" },
  "at-risk":     { bg: "#FEF9C3", text: "#A16207", dot: "#D97706" },
  "delayed":     { bg: "#FEE2E2", text: "#B91C1C", dot: "#DC2626" },
  "completed":   { bg: "#DBEAFE", text: "#1D4ED8", dot: "#2563EB" },
  "not-started": { bg: "#F1F5F9", text: "#475569", dot: "#94A3B8" },
};

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + "20", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
          <Feather name={icon} size={14} color={color} />
        </View>
        <Text style={{ fontSize: 11, color: "#64748B", fontFamily: "Inter_500Medium", flex: 1 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: "#0F172A" }}>{value}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: projectsData, isLoading } = useListSpmoProjects({ page: 1, limit: 100 });
  const projects = projectsData?.projects ?? [];

  const onTrack    = projects.filter((p) => p.status === "on-track").length;
  const atRisk     = projects.filter((p) => p.status === "at-risk").length;
  const delayed    = projects.filter((p) => p.status === "delayed").length;
  const completed  = projects.filter((p) => p.status === "completed").length;
  const total      = projects.length;
  const avgProgress = total > 0 ? Math.round(projects.reduce((acc, p) => acc + (p.progress ?? 0), 0) / total) : 0;

  const recentProjects = projects.slice(0, 5);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{
        padding: 16,
        paddingTop: isWeb ? 16 + 67 : 16,
        paddingBottom: isWeb ? 34 + 84 : 100,
        gap: 16,
      }}
    >
      {/* Greeting */}
      <View>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#0F172A" }}>
          {user?.firstName ? `Hello, ${user.firstName}` : "Dashboard"}
        </Text>
        <Text style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular", marginTop: 2 }}>
          Programme status overview
        </Text>
      </View>

      {/* Stats grid */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 32 }} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard label="Total Projects"  value={total}       color="#2563EB" icon="folder" />
            <StatCard label="Avg Progress"    value={`${avgProgress}%`} color="#7C3AED" icon="trending-up" />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard label="On Track"  value={onTrack}   color="#16A34A" icon="check-circle" />
            <StatCard label="At Risk"   value={atRisk}    color="#D97706" icon="alert-triangle" />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard label="Delayed"   value={delayed}   color="#DC2626" icon="alert-circle" />
            <StatCard label="Completed" value={completed} color="#2563EB" icon="award" />
          </View>
        </>
      )}

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0F172A" }}>Recent Projects</Text>
            <Pressable onPress={() => router.push("/(tabs)/projects")}>
              <Text style={{ fontSize: 13, color: "#2563EB", fontFamily: "Inter_500Medium" }}>See all</Text>
            </Pressable>
          </View>

          {recentProjects.map((project) => {
            const s = (project.status ?? "not-started") as StatusKey;
            const colors = STATUS_COLORS[s] ?? STATUS_COLORS["not-started"];
            const progress = project.progress ?? 0;

            return (
              <Pressable
                key={project.id}
                onPress={() => router.push(`/projects/${project.id}`)}
                style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 8 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <View style={{ backgroundColor: colors.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.text }}>{s.replace("-", " ")}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={{ height: 4, backgroundColor: "#E2E8F0", borderRadius: 2 }}>
                  <View style={{ height: 4, width: `${progress}%`, backgroundColor: colors.dot, borderRadius: 2 }} />
                </View>
                <Text style={{ fontSize: 11, color: "#94A3B8", fontFamily: "Inter_400Regular", marginTop: 4 }}>{progress}% complete</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!isLoading && total === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Feather name="folder" size={40} color="#CBD5E1" />
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#0F172A", marginTop: 12 }}>No projects yet</Text>
          <Text style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular", marginTop: 4 }}>
            Projects will appear here once created.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
