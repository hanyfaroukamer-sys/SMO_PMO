import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, TextInput, Alert, Modal, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { useApi, apiFetch } from "@/utils/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/AuthProvider";

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
  risks?: Risk[];
  computedStatus?: { status: string; reason: string };
}

const STATUS_COLORS: Record<string, string> = {
  on_track: "#16A34A", at_risk: "#D97706", delayed: "#DC2626",
  completed: "#2563EB", not_started: "#94A3B8", on_hold: "#6B7280",
  approved: "#16A34A", submitted: "#D97706", rejected: "#DC2626",
  pending: "#94A3B8", in_progress: "#2563EB",
};

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#64748B";
  return (
    <View style={{ backgroundColor: color + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color }}>{status.replace(/_/g, " ")}</Text>
    </View>
  );
}

export default function ProjectDetailScreen() {
  const { id, tab, milestoneId } = useLocalSearchParams<{ id: string; tab?: string; milestoneId?: string }>();
  const projectId = parseInt(id ?? "0");
  const qc = useQueryClient();
  const { user } = useAuth();
  const canApprove = user?.role === "admin" || user?.role === "approver";

  const { data: project, isLoading, isError, refetch } = useApi<ProjectData>(`/spmo/projects/${projectId}`, projectId > 0);

  const [activeTab, setActiveTab] = useState<"milestones" | "risks" | "info">((tab as any) ?? "milestones");
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [progressDraft, setProgressDraft] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: number; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const highlightId = milestoneId ? parseInt(milestoneId) : null;

  // Set tab from navigation params
  useEffect(() => {
    if (tab === "milestones" || tab === "risks" || tab === "info") setActiveTab(tab);
  }, [tab]);

  const handleApprove = async (msId: number) => {
    setApprovingId(msId);
    try {
      await apiFetch(`/spmo/milestones/${msId}/approve`, { method: "POST", body: JSON.stringify({}) });
      await qc.invalidateQueries({ queryKey: [`/spmo/projects/${projectId}`] });
      Alert.alert("Approved", "Milestone approved successfully");
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to approve");
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) { Alert.alert("Required", "Please enter a rejection reason."); return; }
    setIsRejecting(true);
    try {
      await apiFetch(`/spmo/milestones/${rejectModal.id}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason.trim() }) });
      setRejectModal(null);
      setRejectReason("");
      await qc.invalidateQueries({ queryKey: [`/spmo/projects/${projectId}`] });
      Alert.alert("Rejected", "Milestone rejected");
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to reject");
    } finally {
      setIsRejecting(false);
    }
  };

  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const milestones = project?.milestones ?? [];
  const risks = (project?.risks ?? []).filter((r) => r.status === "open").sort((a, b) => b.riskScore - a.riskScore);
  const cs = project?.computedStatus?.status ?? project?.status ?? "not_started";

  const saveProgress = async (milestoneId: number) => {
    const val = Math.min(100, Math.max(0, parseInt(progressDraft) || 0));
    setSavingId(milestoneId);
    try {
      await apiFetch(`/spmo/milestones/${milestoneId}`, { method: "PUT", body: JSON.stringify({ progress: val }) });
      await qc.invalidateQueries({ queryKey: [`/spmo/projects/${projectId}`] });
      setEditingId(null);
      Alert.alert("Updated", `Progress set to ${val}%`);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to update");
    } finally {
      setSavingId(null);
    }
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtCurrency = (n: number) => n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M` : `SAR ${n.toLocaleString()}`;

  if (isLoading) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color="#2563EB" /></View>;

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
    { key: "risks" as const, label: `Risks (${risks.length})` },
    { key: "info" as const, label: "Info" },
  ];

  const pct = Math.round(project.progress ?? 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}>
      {/* Project header */}
      <View style={{ backgroundColor: "#0F172A", padding: 20, paddingBottom: 28, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        {project.projectCode && <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "700", marginBottom: 4 }}>{project.projectCode}</Text>}
        <Text style={{ fontSize: 17, fontWeight: "bold", color: "#F8FAFC", marginBottom: 8 }}>{project.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, height: 6, backgroundColor: "#1E293B", borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${pct}%`, backgroundColor: "#3B82F6", borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: "900", color: "#3B82F6" }}>{pct}%</Text>
          <StatusPill status={cs} />
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", margin: 16, marginBottom: 8, backgroundColor: "#F1F5F9", borderRadius: 10, padding: 4 }}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setActiveTab(t.key)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: activeTab === t.key ? "#FFF" : "transparent" }}>
            <Text style={{ fontSize: 11, fontWeight: activeTab === t.key ? "800" : "500", color: activeTab === t.key ? "#0F172A" : "#64748B" }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {/* Milestones */}
        {activeTab === "milestones" && (
          <>
            {milestones.length === 0 && <View style={{ alignItems: "center", paddingVertical: 32 }}><Text style={{ fontSize: 14, color: "#64748B" }}>No milestones yet</Text></View>}
            {milestones.map((m) => {
              const sc = STATUS_COLORS[m.status] ?? "#64748B";
              const isEditing = editingId === m.id;
              const isHighlighted = highlightId === m.id;
              return (
                <View key={m.id} style={{ backgroundColor: isHighlighted ? "#EFF6FF" : "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: sc, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, ...(isHighlighted ? { borderWidth: 1.5, borderColor: "#3B82F6" } : {}) }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={2}>{m.name}</Text>
                    <StatusPill status={m.status} />
                  </View>
                  <View style={{ height: 5, backgroundColor: "#F1F5F9", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                    <View style={{ height: "100%", width: `${m.progress}%`, backgroundColor: sc, borderRadius: 3 }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {m.dueDate && <Text style={{ fontSize: 10, color: "#64748B" }}>Due: {fmtDate(m.dueDate)}</Text>}
                    {m.weight > 0 && <Text style={{ fontSize: 10, color: "#64748B" }}>Weight: {m.weight}%</Text>}
                    {(m.evidence?.length ?? 0) > 0 && <Text style={{ fontSize: 10, color: "#2563EB" }}>📎 {m.evidence!.length}</Text>}
                  </View>

                  {/* Approve/Reject buttons for submitted milestones (admin/approver only) */}
                  {m.status === "submitted" && canApprove && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => { setRejectReason(""); setRejectModal({ id: m.id, name: m.name }); }}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: "#FECACA", alignItems: "center" }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#DC2626" }}>Reject</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => Alert.alert("Approve milestone?", `"${m.name}"`, [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => handleApprove(m.id) }])}
                          disabled={approvingId === m.id}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: "#16A34A", alignItems: "center" }}>
                          {approvingId === m.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>Approve</Text>}
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* Update Progress for non-approved, non-submitted milestones */}
                  {m.status !== "approved" && m.status !== "submitted" && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
                      {isEditing ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <TextInput value={progressDraft} onChangeText={setProgressDraft} keyboardType="numeric" autoFocus
                            style={{ width: 60, textAlign: "center", borderWidth: 1, borderColor: "#2563EB", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 14 }} />
                          <Text style={{ fontSize: 12, color: "#64748B" }}>%</Text>
                          <Pressable onPress={() => saveProgress(m.id)} disabled={savingId === m.id} style={{ backgroundColor: "#2563EB", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                            {savingId === m.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Save</Text>}
                          </Pressable>
                          <Pressable onPress={() => setEditingId(null)}><Text style={{ color: "#64748B", fontSize: 12 }}>Cancel</Text></Pressable>
                        </View>
                      ) : (
                        <Pressable onPress={() => { setProgressDraft(String(m.progress)); setEditingId(m.id); }}>
                          <Text style={{ fontSize: 12, color: "#2563EB", fontWeight: "700" }}>Update Progress →</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* Risks */}
        {activeTab === "risks" && (
          <>
            {risks.length === 0 && <View style={{ alignItems: "center", paddingVertical: 32 }}><Text style={{ fontSize: 14, color: "#64748B" }}>No open risks</Text></View>}
            {risks.map((r) => {
              const c = r.riskScore >= 12 ? "#DC2626" : r.riskScore >= 6 ? "#D97706" : "#3B82F6";
              return (
                <View key={r.id} style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: c, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{r.title}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: c, backgroundColor: c + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>Score: {r.riskScore}</Text>
                    <Text style={{ fontSize: 10, color: "#64748B" }}>{r.probability} / {r.impact}</Text>
                    {r.owner && <Text style={{ fontSize: 10, color: "#64748B" }}>{r.owner}</Text>}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Info */}
        {activeTab === "info" && (
          <View style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 16, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            {([
              ["Status", cs.replace(/_/g, " ")],
              ["Owner", project.ownerName ?? "—"],
              ["Start Date", fmtDate(project.startDate)],
              ["Target Date", fmtDate(project.targetDate)],
              ["Budget", fmtCurrency(project.budget)],
              ["Spent", `${fmtCurrency(project.budgetSpent)} (${project.budget > 0 ? Math.round((project.budgetSpent / project.budget) * 100) : 0}%)`],
              ["Milestones", `${milestones.filter((m) => m.status === "approved").length} / ${milestones.length} approved`],
            ] as [string, string][]).map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" }}>
                <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600" }}>{label}</Text>
                <Text style={{ fontSize: 12, color: "#0F172A", fontWeight: "700", maxWidth: "60%", textAlign: "right" }}>{value}</Text>
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

      {/* Reject modal */}
      <Modal visible={!!rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setRejectModal(null)}>
          <Pressable style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 }} onPress={() => {}}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A", marginBottom: 4 }}>Reject Milestone</Text>
            <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }} numberOfLines={2}>{rejectModal?.name}</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Reason for rejection</Text>
            <TextInput
              style={{ backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, fontSize: 14, color: "#0F172A", minHeight: 100, borderWidth: 1, borderColor: "#E2E8F0", textAlignVertical: "top" }}
              placeholder="Explain what needs to be corrected…"
              placeholderTextColor="#94A3B8"
              multiline numberOfLines={4}
              value={rejectReason} onChangeText={setRejectReason} autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setRejectModal(null)} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#E2E8F0", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#475569" }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleReject} disabled={isRejecting} style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center" }}>
                {isRejecting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>Send Rejection</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
