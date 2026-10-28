import { Stack } from "expo-router";
import { stackOptions, tabRootOptions } from "@/ui/navigation";

export default function HomeStack() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: "Home" }} />
    </Stack>
  );
}
