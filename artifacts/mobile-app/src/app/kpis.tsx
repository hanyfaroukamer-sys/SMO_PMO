import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useApi } from "@/utils/api";
import { ProgressBar } from "@/components/ProgressBar";

interface KPI {
  id: number; name: string; type: string; unit: string;
  baseline: number; target: number; actual: number;
  status: string; description: string | null;
}

export default function KPIsScreen() {
  const { data, isLoading, refetch } = useApi<{ kpis: KPI[] }>("/spmo/kpis");
  const kpis = data?.kpis ?? [];
  const strategic = kpis.filter((k) => k.type === "strategic");
  const operational = kpis.filter((k) => k.type === "operational");
  const [tab, setTab] = useState<"strategic" | "operational">("strategic");
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const activeKpis = tab === "strategic" ? strategic : operational;
  const statusColors: Record<string, string> = { on_track: "#16A34A", at_risk: "#D97706", critical: "#DC2626", achieved: "#2563EB", exceeding: "#7C3AED" };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}>
      {/* Tab toggle */}
      <View style={{ flexDirection: "row", gap: 4, backgroundColor: "#F1F5F9", borderRadius: 10, padding: 4 }}>
        {(["strategic", "operational"] as const).map((t) => (
          <View key={t} style={{ flex: 1 }}>
            <Text onPress={() => setTab(t)} style={{ textAlign: "center", paddingVertical: 8, borderRadius: 8, fontSize: 12, fontWeight: tab === t ? "800" : "500",
              color: tab === t ? "#0F172A" : "#64748B", backgroundColor: tab === t ? "#FFF" : "transparent", overflow: "hidden" }}>
              {t === "strategic" ? `Strategic (${strategic.length})` : `Operational (${operational.length})`}
            </Text>
          </View>
        ))}
      </View>

      {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 32 }} />}
      {!isLoading && activeKpis.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 16, fontWeight: "bold" }}>No {tab} KPIs</Text>
        </View>
      )}
      {activeKpis.map((k) => {
        const pct = k.target > 0 ? Math.round((k.actual / k.target) * 100) : 0;
        const sc = statusColors[k.status] ?? "#64748B";
        return (
          <View key={k.id} style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: sc,
            shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{k.name}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 11, color: "#64748B" }}>Baseline: {k.baseline} {k.unit}</Text>
              <Text style={{ fontSize: 11, color: "#64748B" }}>Target: {k.target} {k.unit}</Text>
              <Text style={{ fontSize: 12, fontWeight: "800", color: sc }}>Actual: {k.actual} {k.unit}</Text>
            </View>
            <ProgressBar progress={pct} showLabel={false} />
            <Text style={{ fontSize: 10, color: sc, fontWeight: "700", marginTop: 4 }}>{pct}% of target · {k.status.replace("_", " ")}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
