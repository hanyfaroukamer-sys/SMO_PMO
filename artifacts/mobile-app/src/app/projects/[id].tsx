import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { MilestoneCard } from "@/components/MilestoneCard";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"milestones" | "risks" | "reports">("milestones");

  // TODO: import { useGetSpmoProject } from "@workspace/api-client-react";
  const projectId = parseInt(id ?? "0");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const TABS = [
    { key: "milestones" as const, label: "Milestones" },
    { key: "risks" as const, label: "Risks" },
    { key: "reports" as const, label: "Reports" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {/* Project header */}
      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>Project #{projectId}</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Loading project data...</Text>
          </View>
          <StatusBadge status="on_track" />
        </View>
        <View style={{ marginTop: 12 }}>
          <ProgressBar progress={0} />
        </View>
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
            <Text style={{ fontSize: 13, fontWeight: activeTab === tab.key ? "bold" : "500", color: activeTab === tab.key ? "#0F172A" : "#64748B" }}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === "milestones" && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, color: "#64748B" }}>Connect to API to load milestones</Text>
          {/* TODO: Map milestones from useGetSpmoProject data */}
        </View>
      )}

      {activeTab === "risks" && (
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontSize: 14, color: "#64748B" }}>Risk register coming soon</Text>
        </View>
      )}

      {activeTab === "reports" && (
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontSize: 14, color: "#64748B" }}>Weekly reports coming soon</Text>
        </View>
      )}
    </ScrollView>
  );
}
