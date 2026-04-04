import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable, Linking } from "react-native";
import { useState, useCallback } from "react";
import { useApi, API_URL } from "@/utils/api";

interface Doc {
  id: number; title: string; fileName: string; category: string;
  contentType: string | null; objectPath: string; version: number;
  uploadedByName: string | null; createdAt: string;
}

const CAT_COLORS: Record<string, string> = {
  business_case: "#7C3AED", charter: "#2563EB", plan: "#16A34A",
  report: "#D97706", template: "#0891B2", contract: "#DC2626", other: "#64748B",
};

export default function DocumentsScreen() {
  const { data, isLoading, refetch } = useApi<{ documents: Doc[] }>("/spmo/documents");
  const docs = data?.documents ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}>
      <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A" }}>{docs.length} Documents</Text>
      {isLoading && <ActivityIndicator size="large" color="#2563EB" style={{ paddingVertical: 32 }} />}
      {!isLoading && docs.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📄</Text>
          <Text style={{ fontSize: 16, fontWeight: "bold" }}>No documents</Text>
        </View>
      )}
      {docs.map((d) => {
        const cc = CAT_COLORS[d.category] ?? "#64748B";
        return (
          <Pressable key={d.id} onPress={() => Linking.openURL(`${API_URL}/api/storage/objects${d.objectPath}`)}
            style={{ backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: cc,
              shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{d.title}</Text>
            <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{d.fileName}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: cc, backgroundColor: cc + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>{d.category.replace("_", " ")}</Text>
              {d.uploadedByName && <Text style={{ fontSize: 10, color: "#94A3B8" }}>{d.uploadedByName}</Text>}
              <Text style={{ fontSize: 10, color: "#94A3B8" }}>v{d.version}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
