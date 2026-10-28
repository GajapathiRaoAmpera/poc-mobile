import { Stack } from "expo-router";
import { stackOptions, tabRootOptions } from "@/ui/navigation";

export default function ProjectsStack() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: "Projects" }} />
    </Stack>
  );
}
