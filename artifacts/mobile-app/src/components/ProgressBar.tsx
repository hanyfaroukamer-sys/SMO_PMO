import { View, Text } from "react-native";

export function ProgressBar({ progress, showLabel = true }: { progress: number; showLabel?: boolean }) {
  const pct = Math.min(100, Math.max(0, progress));
  const color = pct >= 80 ? "#16A34A" : pct >= 50 ? "#2563EB" : pct >= 25 ? "#D97706" : "#DC2626";

  return (
    <View>
      {showLabel && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 11, color: "#64748B" }}>Progress</Text>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#0F172A" }}>{Math.round(pct)}%</Text>
        </View>
      )}
      <View style={{ height: 6, backgroundColor: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}
