import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";

export default function LoginScreen() {
  const { signIn, isLoading } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center", padding: 32 }}>
      {/* Logo */}
      <View style={{
        width: 80, height: 80, borderRadius: 20, marginBottom: 24,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "#2563EB",
      }}>
        <Text style={{ color: "#FFFFFF", fontSize: 36, fontWeight: "900" }}>S</Text>
      </View>

      <Text style={{ fontSize: 28, fontWeight: "bold", color: "#0F172A", marginBottom: 8 }}>StrategyPMO</Text>
      <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 32 }}>
        Programme management dashboard for strategic execution
      </Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <Pressable
          onPress={signIn}
          style={{
            backgroundColor: "#2563EB", paddingHorizontal: 32, paddingVertical: 14,
            borderRadius: 12, width: "100%", alignItems: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "bold" }}>Sign In</Text>
        </Pressable>
      )}

      <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 24, textAlign: "center" }}>
        Uses your organisation's identity provider
      </Text>
    </View>
  );
}
