import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";

export default function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="projects/[id]" options={{ title: "Project Detail" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications", presentation: "modal" }} />
        </Stack>
      </AuthProvider>
    </QueryProvider>
  );
}
