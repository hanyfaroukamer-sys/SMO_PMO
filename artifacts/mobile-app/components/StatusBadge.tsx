import { View, Text } from "react-native";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  on_track:    { label: "On Track",    bg: "#DCFCE7", text: "#16A34A", border: "#BBF7D0" },
  at_risk:     { label: "At Risk",     bg: "#FEF3C7", text: "#D97706", border: "#FDE68A" },
  delayed:     { label: "Delayed",     bg: "#FEE2E2", text: "#DC2626", border: "#FECACA" },
  completed:   { label: "Completed",   bg: "#DBEAFE", text: "#2563EB", border: "#BFDBFE" },
  not_started: { label: "Not Started", bg: "#F1F5F9", text: "#64748B", border: "#E2E8F0" },
  on_hold:     { label: "On Hold",     bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;
  return (
    <View style={{ backgroundColor: config.bg, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: config.border }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: config.text }}>{config.label}</Text>
    </View>
  );
}
