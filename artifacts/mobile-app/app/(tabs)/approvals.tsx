import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Modal, TextInput, Alert, StyleSheet } from "react-native";
import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Swipeable } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

const API = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:3000";

interface ApprovalItem {
  milestone: {
    id: number;
    name: string;
    description: string | null;
    progress: number;
    submittedAt: string | null;
    evidence: { id: number; fileName: string }[];
  };
  project: { id: number; name: string; projectCode: string | null };
  initiative: { id: number; name: string };
  pillar: { id: number; name: string; color: string | null };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function SwipeApproveAction({ dragX }: { dragX: Animated.SharedValue<number> }) {
  return (
    <View style={{ backgroundColor: "#16A34A", justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 20, borderRadius: 16, marginBottom: 12, minWidth: 100 }}>
      <Text style={{ fontSize: 28 }}>✅</Text>
      <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFFFFF", marginTop: 2 }}>APPROVE</Text>
    </View>
  );
}

function SwipeRejectAction({ dragX }: { dragX: Animated.SharedValue<number> }) {
  return (
    <View style={{ backgroundColor: "#DC2626", justifyContent: "center", alignItems: "flex-start", paddingHorizontal: 20, borderRadius: 16, marginBottom: 12, minWidth: 100 }}>
      <Text style={{ fontSize: 28 }}>❌</Text>
      <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFFFFF", marginTop: 2 }}>REJECT</Text>
    </View>
  );
}

function ApprovalCard({
  item,
  onApprove,
  onReject,
  isApproving,
}: {
  item: ApprovalItem;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const handleSwipeRight = () => {
    swipeRef.current?.close();
    onApprove();
  };

  const handleSwipeLeft = () => {
    swipeRef.current?.close();
    onReject();
  };

  const pillarColor = item.pillar.color ?? "#2563EB";

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      leftThreshold={80}
      rightThreshold={80}
      renderLeftActions={(progress, dragX) => <SwipeApproveAction dragX={dragX as any} />}
      renderRightActions={(progress, dragX) => <SwipeRejectAction dragX={dragX as any} />}
      onSwipeableLeftOpen={handleSwipeRight}
      onSwipeableRightOpen={handleSwipeLeft}
    >
      <View style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
        borderLeftWidth: 4,
        borderLeftColor: pillarColor,
      }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            {item.project.projectCode && (
              <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "700", marginBottom: 2 }}>{item.project.projectCode}</Text>
            )}
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A" }} numberOfLines={2}>{item.milestone.name}</Text>
            <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }} numberOfLines={1}>{item.project.name}</Text>
          </View>
          <View style={{ backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#1D4ED8" }}>SUBMITTED</Text>
          </View>
        </View>

        {/* Pillar + initiative */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pillarColor }} />
          <Text style={{ fontSize: 11, color: "#475569", flex: 1 }} numberOfLines={1}>{item.pillar.name} › {item.initiative.name}</Text>
        </View>

        {/* Progress + evidence */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, height: 6, backgroundColor: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: "100%", width: "100%", backgroundColor: "#16A34A", borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: "900", color: "#16A34A" }}>100%</Text>
          <Text style={{ fontSize: 11, color: "#94A3B8" }}>📎 {item.milestone.evidence.length}</Text>
        </View>

        {/* Date + swipe hint */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <Text style={{ fontSize: 10, color: "#94A3B8" }}>Submitted {formatDate(item.milestone.submittedAt)}</Text>
          <Text style={{ fontSize: 10, color: "#CBD5E1" }}>← swipe to review →</Text>
        </View>

        {/* Manual action buttons */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Pressable
            onPress={onReject}
            disabled={isApproving}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#FECACA", alignItems: "center" }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#DC2626" }}>Reject</Text>
          </Pressable>
          <Pressable
            onPress={onApprove}
            disabled={isApproving}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#16A34A", alignItems: "center" }}
          >
            {isApproving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Approve</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Swipeable>
  );
}

export default function ApprovalsScreen() {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [approvingId, setApprovingId] = useState<number | null>(null);

  // Reject modal state
  const [rejectModal, setRejectModal] = useState<{ milestoneId: number; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ items: ApprovalItem[] }>({
    queryKey: ["/spmo/pending-approvals"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/spmo/pending-approvals`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      return res.json();
    },
    enabled: !!accessToken,
    staleTime: 15_000,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const handleApprove = async (id: number) => {
    setApprovingId(id);
    try {
      const res = await fetch(`${API}/api/spmo/milestones/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/spmo/pending-approvals"] });
        await queryClient.invalidateQueries({ queryKey: ["/spmo/programme"] });
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Error", err.error ?? "Approval failed");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) {
      Alert.alert("Reason required", "Please enter a rejection reason.");
      return;
    }
    setIsRejecting(true);
    try {
      const res = await fetch(`${API}/api/spmo/milestones/${rejectModal.milestoneId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (res.ok) {
        setRejectModal(null);
        setRejectReason("");
        await queryClient.invalidateQueries({ queryKey: ["/spmo/pending-approvals"] });
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Error", err.error ?? "Rejection failed");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setIsRejecting(false);
    }
  };

  const items = data?.items ?? [];
  const canApprove = user?.role === "admin" || user?.role === "approver";

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {/* Summary */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 }}>
          <View style={{ backgroundColor: items.length > 0 ? "#DBEAFE" : "#F1F5F9", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: items.length > 0 ? "#BFDBFE" : "#E2E8F0" }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: items.length > 0 ? "#1D4ED8" : "#64748B" }}>{items.length}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A" }}>
            {items.length === 1 ? "milestone awaiting approval" : "milestones awaiting approval"}
          </Text>
        </View>

        {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 48 }} />}

        {!isLoading && items.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎉</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>All clear</Text>
            <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4, textAlign: "center" }}>No milestones pending approval.</Text>
          </View>
        )}

        {!canApprove && items.length > 0 && (
          <View style={{ backgroundColor: "#FFF7ED", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#FED7AA" }}>
            <Text style={{ fontSize: 12, color: "#9A3412" }}>You have view-only access. Only admins and approvers can approve or reject milestones.</Text>
          </View>
        )}

        {items.map((item) => (
          <ApprovalCard
            key={item.milestone.id}
            item={item}
            isApproving={approvingId === item.milestone.id}
            onApprove={() => {
              if (!canApprove) { Alert.alert("Permission denied", "Only admins and approvers can approve milestones."); return; }
              Alert.alert(
                "Approve milestone?",
                `"${item.milestone.name}" from ${item.project.name}`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Approve", style: "default", onPress: () => handleApprove(item.milestone.id) },
                ]
              );
            }}
            onReject={() => {
              if (!canApprove) { Alert.alert("Permission denied", "Only admins and approvers can reject milestones."); return; }
              setRejectReason("");
              setRejectModal({ milestoneId: item.milestone.id, name: item.milestone.name });
            }}
          />
        ))}
      </ScrollView>

      {/* Reject modal */}
      <Modal
        visible={!!rejectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRejectModal(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Reject Milestone</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>{rejectModal?.name}</Text>

            <Text style={styles.modalLabel}>Reason for rejection</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Explain what needs to be corrected…"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={rejectReason}
              onChangeText={setRejectReason}
              autoFocus
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setRejectModal(null)} style={styles.btnCancel}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#475569" }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleReject} disabled={isRejecting} style={styles.btnReject}>
                {isRejecting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Send Rejection</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#0F172A", marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: "#64748B", marginBottom: 20 },
  modalLabel: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  modalInput: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, fontSize: 14, color: "#0F172A", minHeight: 100, borderWidth: 1, borderColor: "#E2E8F0", textAlignVertical: "top" },
  btnCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#E2E8F0", alignItems: "center" },
  btnReject: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center" },
});
