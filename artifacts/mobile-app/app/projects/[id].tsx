import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { Feather } from "@expo/vector-icons";
import { useGetSpmoProject } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { MilestoneCard } from "@/components/MilestoneCard";

const TABS = [
  { key: "milestones" as const, label: "Milestones" },
  { key: "risks" as const, label: "Risks" },
  { key: "info" as const, label: "Info" },
];

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <View style={{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
      <Text style={{ width: 120, fontSize: 13, color: "#64748B", fontFamily: "Inter_500Medium" }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: "#0F172A", fontFamily: "Inter_400Regular" }}>{String(value)}</Text>
    </View>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"milestones" | "risks" | "info">("milestones");
  const isWeb = Platform.OS === "web";

  const projectId = parseInt(id ?? "0");
  const { data: project, isLoading, refetch } = useGetSpmoProject(projectId);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const milestones = (project as { milestones?: unknown[] })?.milestones ?? [];
  const risks = (project as { risks?: { id: number; title: string; level: string; status: string }[] })?.risks ?? [];

  const RISK_COLORS: Record<string, { bg: string; text: string }> = {
    critical: { bg: "#FEE2E2", text: "#991B1B" },
    high:     { bg: "#FFEDD5", text: "#9A3412" },
    medium:   { bg: "#FEF9C3", text: "#713F12" },
    low:      { bg: "#DCFCE7", text: "#14532D" },
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{
        padding: 16,
        gap: 14,
        paddingTop: isWeb ? 16 + 67 : 16,
        paddingBottom: isWeb ? 34 + 84 : 32,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {isLoading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 48 }} />
      ) : !project ? (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Feather name="alert-circle" size={36} color="#F87171" />
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#0F172A", marginTop: 12 }}>Project not found</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: "#2563EB", fontFamily: "Inter_500Medium" }}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Project header card */}
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#0F172A" }}>{project.name}</Text>
                {project.projectCode && (
                  <Text style={{ fontSize: 12, color: "#64748B", fontFamily: "Inter_400Regular", marginTop: 2 }}>{project.projectCode}</Text>
                )}
              </View>
              <StatusBadge status={(project.status ?? "not-started") as string} />
            </View>
            <ProgressBar progress={project.progress ?? 0} />
            <Text style={{ fontSize: 12, color: "#94A3B8", fontFamily: "Inter_400Regular", marginTop: 4 }}>
              {project.progress ?? 0}% complete
            </Text>

            {/* Budget row */}
            {!!project.budget && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
                <View>
                  <Text style={{ fontSize: 11, color: "#94A3B8", fontFamily: "Inter_400Regular" }}>Budget</Text>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }}>
                    SAR {((project.budget as number) / 1_000_000).toFixed(1)}M
                  </Text>
                </View>
                {!!(project as { budgetSpent?: number }).budgetSpent && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 11, color: "#94A3B8", fontFamily: "Inter_400Regular" }}>Spent</Text>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }}>
                      SAR {(((project as { budgetSpent?: number }).budgetSpent ?? 0) / 1_000_000).toFixed(1)}M
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Tab bar */}
          <View style={{ flexDirection: "row", gap: 4, backgroundColor: "#F1F5F9", borderRadius: 10, padding: 4 }}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                  backgroundColor: activeTab === tab.key ? "#FFFFFF" : "transparent",
                }}
              >
                <Text style={{
                  fontSize: 13,
                  fontFamily: activeTab === tab.key ? "Inter_600SemiBold" : "Inter_500Medium",
                  color: activeTab === tab.key ? "#0F172A" : "#64748B",
                }}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Tab content: Milestones */}
          {activeTab === "milestones" && (
            <View style={{ gap: 8 }}>
              {milestones.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <Feather name="flag" size={32} color="#CBD5E1" />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#64748B", marginTop: 8 }}>No milestones yet</Text>
                </View>
              ) : (
                milestones.map((m: unknown) => (
                  <MilestoneCard key={(m as { id: number }).id} milestone={m as { id: number; title: string; status: string; dueDate: string | null; progress: number }} />
                ))
              )}
            </View>
          )}

          {/* Tab content: Risks */}
          {activeTab === "risks" && (
            <View style={{ gap: 8 }}>
              {risks.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <Feather name="shield" size={32} color="#CBD5E1" />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#64748B", marginTop: 8 }}>No risks recorded</Text>
                </View>
              ) : (
                risks.map((risk) => {
                  const rc = RISK_COLORS[risk.level] ?? RISK_COLORS.low;
                  return (
                    <View key={risk.id} style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <View style={{ backgroundColor: rc.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: rc.text }}>{risk.level?.toUpperCase()}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: "#94A3B8", fontFamily: "Inter_400Regular" }}>{risk.status}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }}>{risk.title}</Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Tab content: Info */}
          {activeTab === "info" && (
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
              <InfoRow label="Department"   value={(project as { departmentName?: string }).departmentName} />
              <InfoRow label="Owner"        value={(project as { ownerName?: string }).ownerName} />
              <InfoRow label="Start Date"   value={project.startDate ? new Date(project.startDate).toLocaleDateString("en-GB") : null} />
              <InfoRow label="End Date"     value={project.endDate ? new Date(project.endDate).toLocaleDateString("en-GB") : null} />
              <InfoRow label="Priority"     value={(project as { priority?: string }).priority} />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
