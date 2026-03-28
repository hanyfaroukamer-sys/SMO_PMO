import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useApi } from "@/utils/api";

interface Risk {
  id: number; title: string; description: string | null; probability: string;
  impact: string; riskScore: number; status: string; owner: string | null; category: string | null;
}

export default function RisksScreen() {
  const { data, isLoading, refetch } = useApi<{ risks: Risk[] }>("/spmo/risks");
  const risks = (data?.risks ?? []).filter((r) => r.status === "open").sort((a, b) => b.riskScore - a.riskScore);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}>
      <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A" }}>{risks.length} Open Risks</Text>
      {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 32 }} />}
      {!isLoading && risks.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>✅</Text>
          <Text style={{ fontSize: 16, fontWeight: "bold" }}>No open risks</Text>
        </View>
      )}
      {risks.map((r) => {
        const c = r.riskScore >= 12 ? "#DC2626" : r.riskScore >= 6 ? "#D97706" : "#3B82F6";
        return (
          <View key={r.id} style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: c,
            shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{r.title}</Text>
            {r.description && <Text style={{ fontSize: 11, color: "#64748B", marginTop: 4 }} numberOfLines={2}>{r.description}</Text>}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: c, backgroundColor: c + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>Score: {r.riskScore}</Text>
              <Text style={{ fontSize: 10, color: "#64748B" }}>{r.probability} / {r.impact}</Text>
              {r.owner && <Text style={{ fontSize: 10, color: "#64748B" }}>{r.owner}</Text>}
              {r.category && <Text style={{ fontSize: 10, color: "#94A3B8" }}>{r.category}</Text>}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
