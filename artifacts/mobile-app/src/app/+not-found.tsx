import { View, Text } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function NotFoundScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#F8FAFC" }}>
      <Ionicons name="help-circle-outline" size={64} color="#CBD5E1" />
      <Text style={{ fontSize: 20, fontWeight: "bold", color: "#0F172A", marginTop: 16 }}>Page Not Found</Text>
      <Link href="/" style={{ marginTop: 16, color: "#2563EB", fontSize: 14, fontWeight: "600" }}>
        Go to Dashboard
      </Link>
    </View>
  );
}
