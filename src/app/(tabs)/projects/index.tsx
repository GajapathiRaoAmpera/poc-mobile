import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { FolderOpen, Plus, SearchX } from "lucide-react-native";
import { useProjects } from "@/api/projects";
import { ProjectCard } from "@/features/projects/project-card";
import type { Project, ProjectStatus } from "@/schemas/project";
import { Button } from "@/ui/button";
import { EmptyState, ErrorState, SkeletonList } from "@/ui/states";
import { Text } from "@/ui/text";
import { color, font, radius, sp } from "@/ui/theme";

const FILTERS: { label: string; value?: ProjectStatus }[] = [
  { label: "All" },
  { label: "Active", value: "ACTIVE" },
  { label: "Draft", value: "DRAFT" },
  { label: "Archived", value: "ARCHIVED" },
];

const renderItem = ({ item }: { item: Project }) => <ProjectCard project={item} />;
const keyExtractor = (p: Project) => p.id;
const Gap = () => <View style={styles.gap} />;

export default function Projects() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | undefined>();
  // shortcut: first 100 projects only (backend max page size); add useInfiniteQuery when users exceed that.
  const projects = useProjects({ q, status, page_size: 100 });

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = Boolean(q || status);

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Search projects",
            onChangeText: (e) => setSearch(e.nativeEvent.text),
            hideWhenScrolling: false,
          },
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="New project" hitSlop={10} onPress={() => router.push("/projects/new")}>
              <Plus size={24} color={color.primary} />
            </Pressable>
          ),
        }}
      />
      <FlashList
        data={projects.data?.items ?? []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={Gap}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={projects.isRefetching} onRefresh={() => void projects.refetch()} tintColor={color.primary} />}
        ListHeaderComponent={<Filters value={status} onChange={setStatus} />}
        ListEmptyComponent={
          projects.isPending ? (
            <SkeletonList />
          ) : projects.isError ? (
            <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
          ) : filtered ? (
            <EmptyState
              icon={SearchX}
              title="No matching projects"
              body="Try a different search or filter."
              action={status ? <Button label="Show all statuses" variant="secondary" onPress={() => setStatus(undefined)} /> : null}
            />
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="No projects yet"
              body="Describe an idea and the agents will plan it with you."
              action={<Button label="Start a project" onPress={() => router.push("/projects/new")} />}
            />
          )
        }
      />
    </>
  );
}

function Filters({ value, onChange }: { value?: ProjectStatus; onChange: (v?: ProjectStatus) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {FILTERS.map((f) => {
        const active = f.value === value;
        return (
          <Pressable
            key={f.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(f.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: sp(4), paddingBottom: sp(10) },
  gap: { height: sp(3) },
  filters: { gap: sp(2), paddingBottom: sp(4) },
  chip: {
    minHeight: 36,
    paddingHorizontal: sp(4),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    justifyContent: "center",
    backgroundColor: color.surface,
  },
  chipActive: { backgroundColor: color.text, borderColor: color.text },
  chipText: { fontFamily: font.medium, fontSize: 14 },
  chipTextActive: { color: color.surface },
});
