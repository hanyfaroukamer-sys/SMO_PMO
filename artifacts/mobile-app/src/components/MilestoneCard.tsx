import { View, Text, Pressable, TextInput } from "react-native";
import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

interface MilestoneCardProps {
  milestone: {
    id: number;
    name: string;
    progress: number;
    status: string;
    dueDate: string | null;
    weight: number;
  };
  canEditProgress: boolean;
  onUpdateProgress?: (id: number, progress: number) => Promise<void>;
}

export function MilestoneCard({ milestone, canEditProgress, onUpdateProgress }: MilestoneCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(milestone.progress));

  const handleSave = async () => {
    const val = Math.min(100, Math.max(0, parseInt(draft) || 0));
    await onUpdateProgress?.(milestone.id, val);
    setEditing(false);
  };

  return (
    <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", flex: 1 }}>{milestone.name}</Text>
        <StatusBadge status={milestone.status} />
      </View>

      <ProgressBar progress={milestone.progress} />

      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        {milestone.dueDate && (
          <Text style={{ fontSize: 10, color: "#64748B" }}>Due: {new Date(milestone.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Text>
        )}
        {milestone.weight > 0 && (
          <Text style={{ fontSize: 10, color: "#64748B" }}>Weight: {milestone.weight}%</Text>
        )}
      </View>

      {/* Inline progress edit */}
      {canEditProgress && milestone.status !== "approved" && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
          {editing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                keyboardType="numeric"
                style={{ width: 60, textAlign: "center", borderWidth: 1, borderColor: "#2563EB", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 14 }}
                autoFocus
                onSubmitEditing={handleSave}
              />
              <Text style={{ fontSize: 12, color: "#64748B" }}>%</Text>
              <Pressable onPress={handleSave} style={{ backgroundColor: "#2563EB", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setEditing(false)}>
                <Text style={{ color: "#64748B", fontSize: 12 }}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => { setDraft(String(milestone.progress)); setEditing(true); }}>
              <Text style={{ fontSize: 12, color: "#2563EB", fontWeight: "600" }}>✏ Update Progress</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
