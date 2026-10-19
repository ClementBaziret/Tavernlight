import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth";
import { useTheme } from "../src/theme";

const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

function Navigator() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1b2140" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Tavernlight" }} />
      <Stack.Screen name="login" options={{ title: "Log in" }} />
      <Stack.Screen name="new" options={{ title: "New character" }} />
      <Stack.Screen name="character/[id]" options={{ title: "Character" }} />
      <Stack.Screen name="dice" options={{ title: "Dice" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <StatusBar style="light" />
          <Navigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
