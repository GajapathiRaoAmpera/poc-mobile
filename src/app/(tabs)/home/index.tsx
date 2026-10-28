import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRight, FolderOpen, Sparkles } from "lucide-react-native";
import { useProjects } from "@/api/projects";
import { useSession } from "@/auth/session";
import { ProjectCard } from "@/features/projects/project-card";
import { Button } from "@/ui/button";
import { EmptyState, ErrorState, SkeletonList } from "@/ui/states";
import { Text } from "@/ui/text";
import { color, radius, sp } from "@/ui/theme";

const RECENT = { page_size: 5 };

export default function Home() {
  const { user } = useSession();
  const projects = useProjects(RECENT);
  const first = user?.name.split(" ")[0];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={projects.isRefetching} onRefresh={() => void projects.refetch()} tintColor={color.primary} />}
    >
      <Text variant="display">{first ? `Hi ${first}` : "Hi there"}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start a new project"
        onPress={() => router.push("/projects/new")}
        style={({ pressed }) => [styles.hero, pressed && styles.heroPressed]}
      >
        <Sparkles size={24} color={color.cream} />
        <Text variant="title" style={styles.heroTitle}>
          Start a new project
        </Text>
        <Text style={styles.heroBody}>
          Describe what you want to build. The Project Orchestrator plans the work and the agents draft each stage for your
          review.
        </Text>
        <View style={styles.heroCta}>
          <Text variant="label" style={styles.heroTitle}>
            Describe your idea
          </Text>
          <ArrowRight size={18} color={color.cream} />
        </View>
      </Pressable>

      <View style={styles.sectionHead}>
        <Text variant="heading">Recent projects</Text>
        {projects.data && projects.data.total > RECENT.page_size ? (
          <Button size="sm" variant="tertiary" label="See all" onPress={() => router.navigate("/projects")} />
        ) : null}
      </View>

      {projects.isPending ? (
        <SkeletonList rows={3} />
      ) : projects.isError ? (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.items.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No projects yet" body="Your projects show up here once you start one." />
      ) : (
        <View style={styles.list}>
          {projects.data.items.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: sp(4), gap: sp(5), paddingBottom: sp(10) },
  hero: {
    backgroundColor: color.navy,
    borderRadius: radius.card + 4,
    borderCurve: "continuous",
    padding: sp(5),
    gap: sp(2),
  },
  heroPressed: { opacity: 0.92 },
  heroTitle: { color: color.cream },
  heroBody: { color: "rgba(255,254,250,0.78)" },
  heroCta: { flexDirection: "row", alignItems: "center", gap: sp(2), marginTop: sp(2) },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  list: { gap: sp(3) },
});
