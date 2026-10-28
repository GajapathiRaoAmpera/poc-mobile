import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { errorMessage } from "@/api/client";
import { useIntake } from "@/api/delivery";
import type { Preferences } from "@/schemas/delivery";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Banner, FormScreen } from "@/ui/form";
import { Text } from "@/ui/text";
import { color, font, sp } from "@/ui/theme";

const AGENTS = [
  { name: "Project Orchestrator", does: "plans the work and asks what it needs" },
  { name: "Requirements Agent", does: "drafts testable requirements and open questions" },
  { name: "Architecture Agent", does: "designs the system" },
  { name: "Planning Agent", does: "turns it into milestones, tasks and a schedule" },
  { name: "Budget Agent", does: "prices the plan from your rates" },
  { name: "Development Agent", does: "writes a checked scaffold script" },
];

const splitList = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Project creation is one question; preferences are optional. */
export default function NewProject() {
  const intake = useIntake();
  const [idea, setIdea] = useState("");
  const [showPrefs, setShowPrefs] = useState(false);
  const [deploy, setDeploy] = useState("");
  const [tech, setTech] = useState("");

  const submit = () => {
    const message = idea.trim();
    if (!message || intake.isPending) return;
    const preferences: Preferences = {};
    if (deploy.trim()) preferences.deployment_preference = deploy.trim();
    if (splitList(tech).length) preferences.preferred_technologies = splitList(tech);
    intake.mutate(Object.keys(preferences).length ? { message, preferences } : { message }, {
      onSuccess: (out) => router.replace(`/projects/${out.project.id}`),
    });
  };

  const Chevron = showPrefs ? ChevronDown : ChevronRight;

  return (
    <FormScreen>
      <Stack.Screen options={{ headerLeft: () => <Button size="sm" variant="tertiary" label="Cancel" onPress={() => router.back()} /> }} />
      <View style={styles.intro}>
        <Text variant="title">What do you want to build?</Text>
        <Text muted>Describe the idea in your own words. The agents take it from there and ask when they need something.</Text>
      </View>
      {intake.isError ? <Banner text={errorMessage(intake.error)} /> : null}
      <Field
        label="Your idea"
        hint="Who is it for, what problem does it solve, and anything you know about scope or constraints."
        value={idea}
        onChangeText={setIdea}
        multiline
        maxLength={4000}
        autoFocus
        style={styles.idea}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showPrefs }}
        onPress={() => setShowPrefs((s) => !s)}
        style={styles.toggle}
      >
        <Chevron size={18} color={color.primary} />
        <Text style={styles.toggleText}>Add preferences (optional)</Text>
      </Pressable>
      {showPrefs ? (
        <View style={styles.prefs}>
          <Field label="Deployment preference" hint="e.g. “Azure, EU region”." value={deploy} onChangeText={setDeploy} maxLength={300} />
          <Field label="Preferred technologies" hint="Separate with commas." value={tech} onChangeText={setTech} maxLength={300} autoCapitalize="none" />
        </View>
      ) : null}

      <Button label="Start project" block loading={intake.isPending} disabled={!idea.trim()} onPress={submit} />

      <View style={styles.who}>
        <Text variant="eyebrow">Who works on it</Text>
        {AGENTS.map((a, i) => (
          <View key={a.name} style={styles.agent}>
            <Text variant="mono" style={styles.index}>
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Text style={styles.flex}>
              <Text variant="label">{a.name}</Text>
              <Text muted> — {a.does}</Text>
            </Text>
          </View>
        ))}
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: sp(2) },
  idea: { minHeight: 160, textAlignVertical: "top" },
  toggle: { flexDirection: "row", alignItems: "center", gap: sp(2), minHeight: 44 },
  toggleText: { color: color.primary, fontFamily: font.medium },
  prefs: { gap: sp(4) },
  who: { gap: sp(3), marginTop: sp(4) },
  agent: { flexDirection: "row", gap: sp(3) },
  index: { color: color.primary },
  flex: { flex: 1 },
});
