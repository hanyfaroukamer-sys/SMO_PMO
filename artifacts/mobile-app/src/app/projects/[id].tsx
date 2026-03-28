import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, TextInput, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { useApi, apiFetch } from "@/utils/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { useQueryClient } from "@tanstack/react-query";

interface Milestone {
  id: number; name: string; progress: number; status: string;
  dueDate: string | null; weight: number; description: string | null;
  phaseGate: string | null; evidence?: { id: number; fileName: string }[];
}

interface Risk {
  id: number; title: string; probability: string; impact: string;
  riskScore: number; status: string; owner: string | null;
}

interface ProjectData {
  id: number; name: string; projectCode: string | null; description: string | null;
  status: string; progress: number; budget: number; budgetSpent: number;
  ownerName: string | null; startDate: string | null; targetDate: string | null;
  milestones: Milestone[];
  computedStatus?: { status: string; reason: string };
  pendingApprovals?: number;
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const projectId = parseInt(id ?? "0");
  const qc = useQueryClient();

  const { data: project, isLoading, isError, refetch } = useApi<ProjectData>(`/spmo/projects/${projectId}`, projectId > 0);
  const { data: risksData } = useApi<{ risks: Risk[] }>("/spmo/risks", projectId > 0);

  const [activeTab, setActiveTab] = useState<"milestones" | "risks" | "info">("milestones");
  const [refreshing, setRefreshing] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [progressDraft, setProgressDraft] = useState("");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const projectRisks = (risksData?.risks ?? []).filter((r) => r.projectId === projectId);
  const milestones = project?.milestones ?? [];
  const cs = project?.computedStatus?.status ?? project?.status ?? "not_started";

  const saveProgress = async (milestoneId: number) => {
    const val = Math.min(100, Math.max(0, parseInt(progressDraft) || 0));
    try {
      await apiFetch(`/spmo/milestones/${milestoneId}`, { method: "PUT", body: JSON.stringify({ progress: val }) });
      qc.invalidateQueries({ queryKey: [`/spmo/projects/${projectId}`] });
      setEditingMilestoneId(null);
      Alert.alert("Updated", `Progress set to ${val}%`);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to update");
    }
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtCurrency = (n: number) => n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M` : `SAR ${n.toLocaleString()}`;

  if (isLoading) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  if (isError || !project) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#DC2626" }}>Failed to load project</Text>
        <Pressable onPress={() => refetch()} style={{ marginTop: 16, backgroundColor: "#2563EB", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}>
          <Text style={{ color: "#FFF", fontWeight: "bold" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const TABS = [
    { key: "milestones" as const, label: `Milestones (${milestones.length})` },
    { key: "risks" as const, label: `Risks (${projectRisks.length})` },
    { key: "info" as const, label: "Info" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {/* Project header */}
      <View style={{ backgroundColor: "#0F172A", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        {project.projectCode && <Text style={{ fontSize: 11, color: "#64748B", fontFamily: "monospace", fontWeight: "700" }}>{project.projectCode}</Text>}
        <Text style={{ fontSize: 20, fontWeight: "bold", color: "#F8FAFC", marginTop: 2 }}>{project.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <StatusBadge status={cs} />
          {project.ownerName && <Text style={{ fontSize: 11, color: "#94A3B8" }}>Owner: {project.ownerName}</Text>}
        </View>
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: "#94A3B8" }}>Progress</Text>
            <Text style={{ fontSize: 13, fontWeight: "900", color: "#F8FAFC" }}>{Math.round(project.progress)}%</Text>
          </View>
          <View style={{ height: 6, backgroundColor: "#334155", borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${Math.min(100, project.progress)}%`, backgroundColor: "#3B82F6", borderRadius: 3 }} />
          </View>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* Tab bar */}
        <View style={{ flexDirection: "row", gap: 4, backgroundColor: "#F1F5F9", borderRadius: 10, padding: 4 }}>
          {TABS.map((tab) => (
            <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: activeTab === tab.key ? "#FFFFFF" : "transparent" }}>
              <Text style={{ fontSize: 12, fontWeight: activeTab === tab.key ? "800" : "500", color: activeTab === tab.key ? "#0F172A" : "#64748B" }}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Milestones tab */}
        {activeTab === "milestones" && (
          <View style={{ gap: 8 }}>
            {milestones.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <Text style={{ fontSize: 14, color: "#94A3B8" }}>No milestones</Text>
              </View>
            )}
            {milestones.map((m) => {
              const isEditing = editingMilestoneId === m.id;
              const statusColor = m.status === "approved" ? "#16A34A" : m.status === "submitted" ? "#D97706" : m.status === "rejected" ? "#DC2626" : "#64748B";
              return (
                <View key={m.id} style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: statusColor,
                  shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={2}>{m.name}</Text>
                    <StatusBadge status={m.status} />
                  </View>
                  <ProgressBar progress={m.progress} />
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                    {m.dueDate && <Text style={{ fontSize: 10, color: "#64748B" }}>Due: {fmtDate(m.dueDate)}</Text>}
                    {m.weight > 0 && <Text style={{ fontSize: 10, color: "#64748B" }}>Weight: {m.weight}%</Text>}
                    {(m.evidence?.length ?? 0) > 0 && <Text style={{ fontSize: 10, color: "#2563EB" }}>{m.evidence!.length} evidence</Text>}
                  </View>
                  {/* Inline progress edit */}
                  {m.status !== "approved" && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
                      {isEditing ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <TextInput value={progressDraft} onChangeText={setProgressDraft} keyboardType="numeric" autoFocus
                            style={{ width: 60, textAlign: "center", borderWidth: 1, borderColor: "#2563EB", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 14 }}
                            onSubmitEditing={() => saveProgress(m.id)} />
                          <Text style={{ fontSize: 12, color: "#64748B" }}>%</Text>
                          <Pressable onPress={() => saveProgress(m.id)} style={{ backgroundColor: "#2563EB", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                            <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Save</Text>
                          </Pressable>
                          <Pressable onPress={() => setEditingMilestoneId(null)}>
                            <Text style={{ color: "#64748B", fontSize: 12 }}>Cancel</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable onPress={() => { setProgressDraft(String(m.progress)); setEditingMilestoneId(m.id); }}>
                          <Text style={{ fontSize: 12, color: "#2563EB", fontWeight: "700" }}>Update Progress</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Risks tab */}
        {activeTab === "risks" && (
          <View style={{ gap: 8 }}>
            {projectRisks.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <Text style={{ fontSize: 14, color: "#94A3B8" }}>No risks logged for this project</Text>
              </View>
            )}
            {projectRisks.map((r) => {
              const scoreColor = r.riskScore >= 12 ? "#DC2626" : r.riskScore >= 6 ? "#D97706" : "#3B82F6";
              return (
                <View key={r.id} style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: scoreColor,
                  shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{r.title}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 10, color: scoreColor, fontWeight: "700", backgroundColor: scoreColor + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>Score: {r.riskScore}</Text>
                    <Text style={{ fontSize: 10, color: "#64748B" }}>{r.probability} / {r.impact}</Text>
                    <StatusBadge status={r.status} />
                    {r.owner && <Text style={{ fontSize: 10, color: "#64748B" }}>{r.owner}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Info tab */}
        {activeTab === "info" && (
          <View style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 16, gap: 12,
            shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            {[
              ["Status", cs.replace("_", " ")],
              ["Owner", project.ownerName ?? "—"],
              ["Start Date", fmtDate(project.startDate)],
              ["Target Date", fmtDate(project.targetDate)],
              ["Budget", fmtCurrency(project.budget)],
              ["Spent", `${fmtCurrency(project.budgetSpent)} (${project.budget > 0 ? Math.round((project.budgetSpent / project.budget) * 100) : 0}%)`],
              ["Milestones", `${milestones.filter((m) => m.status === "approved").length} / ${milestones.length} approved`],
            ].map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" }}>
                <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600" }}>{label}</Text>
                <Text style={{ fontSize: 12, color: "#0F172A", fontWeight: "700" }}>{value}</Text>
              </View>
            ))}
            {project.description && (
              <View style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600", marginBottom: 4 }}>Description</Text>
                <Text style={{ fontSize: 12, color: "#374151", lineHeight: 18 }}>{project.description}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
