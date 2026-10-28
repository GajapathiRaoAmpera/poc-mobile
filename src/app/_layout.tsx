import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SessionProvider, useSession } from "@/auth/session";
import { stackOptions } from "@/ui/navigation";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

// Refetch stale data when the app comes back to the foreground.
AppState.addEventListener("change", (s) => focusManager.setFocused(s === "active"));

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootStack />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function RootStack() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);
  if (status === "loading") return null;

  const signedIn = status === "signedIn";
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="projects/new" options={{ presentation: "modal", title: "New project" }} />
        <Stack.Screen name="projects/[id]/index" options={{ title: "" }} />
        <Stack.Screen name="projects/[id]/[stage]" options={{ title: "" }} />
        <Stack.Screen name="projects/[id]/chat/[channel]" options={{ title: "" }} />
      </Stack.Protected>
    </Stack>
  );
}
