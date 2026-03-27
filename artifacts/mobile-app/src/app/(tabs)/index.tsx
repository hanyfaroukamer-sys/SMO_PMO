import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";

// TODO: Import from @workspace/api-client-react once monorepo deps resolve
// import { useGetSpmoOverview } from "@workspace/api-client-react";

export default function DashboardScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // refetch()
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      {/* Welcome */}
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#0F172A" }}>
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}
        </Text>
        <Text style={{ fontSize: 14, color: "#64748B", marginTop: 2 }}>
          Programme health at a glance
        </Text>
      </View>

      {/* KPI Summary Cards */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600", textTransform: "uppercase" }}>Progress</Text>
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#2563EB", marginTop: 4 }}>—%</Text>
          <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Strategy progress</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600", textTransform: "uppercase" }}>Projects</Text>
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#16A34A", marginTop: 4 }}>—</Text>
          <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Active projects</Text>
        </View>
      </View>

      {/* Attention Required */}
      <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#FECACA" }}>
        <Text style={{ fontSize: 13, fontWeight: "bold", color: "#DC2626", marginBottom: 8 }}>Attention Required</Text>
        <Text style={{ fontSize: 12, color: "#7F1D1D" }}>Connect to API to see alerts, delayed projects, and pending approvals.</Text>
      </View>

      {/* Quick Actions */}
      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
        <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0F172A", marginBottom: 12 }}>Quick Actions</Text>
        <Text style={{ fontSize: 12, color: "#64748B" }}>• Update milestone progress</Text>
        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>• Submit weekly report</Text>
        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>• Upload evidence</Text>
      </View>
    </ScrollView>
  );
}
