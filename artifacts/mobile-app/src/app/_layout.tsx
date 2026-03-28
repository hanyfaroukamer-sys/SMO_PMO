import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";

export default function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: "#0F172A" }, headerTintColor: "#FFF", headerTitleStyle: { fontWeight: "bold" } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="projects/[id]" options={{ title: "Project" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="risks" options={{ title: "Risks" }} />
          <Stack.Screen name="kpis" options={{ title: "KPIs" }} />
          <Stack.Screen name="documents" options={{ title: "Documents" }} />
        </Stack>
      </AuthProvider>
    </QueryProvider>
  );
}
