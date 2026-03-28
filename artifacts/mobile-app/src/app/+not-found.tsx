import { View, Text } from "react-native";
import { Link } from "expo-router";

export default function NotFoundScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>😕</Text>
      <Text style={{ fontSize: 20, fontWeight: "bold", color: "#0F172A" }}>Page Not Found</Text>
      <Link href="/" style={{ marginTop: 16, color: "#2563EB", fontSize: 14, fontWeight: "600" }}>
        Go to Dashboard
      </Link>
    </View>
  );
}
