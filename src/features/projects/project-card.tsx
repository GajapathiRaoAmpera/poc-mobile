import { router } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { PROJECT_STATUS, relativeTime } from "@/lib/format";
import type { Project } from "@/schemas/project";
import { Badge } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, radius, sp } from "@/ui/theme";

export const ProjectCard = memo(function ProjectCard({ project }: { project: Project }) {
  const status = PROJECT_STATUS[project.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, ${status.label}, updated ${relativeTime(project.updated_at)}`}
      onPress={() => router.push(`/projects/${project.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.body}>
        <View style={styles.top}>
          <Badge label={status.label} tone={status.tone} />
          <Text variant="caption">{relativeTime(project.updated_at)}</Text>
        </View>
        <Text variant="heading" numberOfLines={2}>
          {project.name}
        </Text>
        {project.description ? (
          <Text variant="caption" numberOfLines={2}>
            {project.description}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={color.textMuted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3),
    padding: sp(4),
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  pressed: { backgroundColor: color.surfaceMuted },
  body: { flex: 1, gap: sp(1.5) },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
