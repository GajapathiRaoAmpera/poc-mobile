import { Stack } from "expo-router";
import { stackOptions, tabRootOptions } from "@/ui/navigation";

export default function AccountStack() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: "Account" }} />
    </Stack>
  );
}
