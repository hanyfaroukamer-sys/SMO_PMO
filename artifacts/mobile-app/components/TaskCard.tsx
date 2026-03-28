import { View, Text, Pressable } from "react-native";

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "#FEE2E2", text: "#DC2626", border: "#FECACA" },
  high:     { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  medium:   { bg: "#FEF3C7", text: "#D97706", border: "#FDE68A" },
  low:      { bg: "#F1F5F9", text: "#64748B", border: "#E2E8F0" },
  info:     { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
};

interface TaskCardProps {
  task: { id: string; type: string; priority: string; title: string; subtitle: string };
  onPress: () => void;
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low;

  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text }} />
        <Text style={{ fontSize: 10, fontWeight: "700", color: colors.text, textTransform: "uppercase" }}>{task.priority}</Text>
        <Text style={{ fontSize: 10, color: "#64748B", backgroundColor: "#FFFFFF", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, overflow: "hidden" }}>{task.type.replace("_", " ")}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A" }}>{task.title}</Text>
      <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{task.subtitle}</Text>
    </Pressable>
  );
}
