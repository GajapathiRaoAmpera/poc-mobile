import { Stack } from "expo-router";
import { stackOptions } from "@/ui/navigation";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ ...stackOptions, title: "" }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack>
  );
}
