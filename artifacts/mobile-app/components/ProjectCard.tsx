import { View, Text, Pressable } from "react-native";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

interface ProjectCardProps {
  project: {
    id: number;
    name: string;
    projectCode: string | null;
    progress: number;
    status: string;
    budget: number;
    budgetSpent: number;
  };
  onPress: () => void;
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `SAR ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `SAR ${(n / 1_000).toFixed(0)}K`;
  return `SAR ${n}`;
}

export function ProjectCard({ project, onPress }: ProjectCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A" }}>
            {project.projectCode && <Text style={{ fontFamily: "monospace", color: "#64748B" }}>{project.projectCode}: </Text>}
            {project.name}
          </Text>
        </View>
        <StatusBadge status={project.status} />
      </View>

      <ProgressBar progress={project.progress} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
        <Text style={{ fontSize: 11, color: "#64748B" }}>Budget: {fmtCurrency(project.budget)}</Text>
        <Text style={{ fontSize: 11, color: "#64748B" }}>Spent: {fmtCurrency(project.budgetSpent)}</Text>
      </View>
    </Pressable>
  );
}
