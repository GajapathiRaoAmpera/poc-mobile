import { router, useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { FileQuestion, MessagesSquare } from "lucide-react-native";
import { ApiError } from "@/api/client";
import { useDelivery } from "@/api/delivery";
import { useProject } from "@/api/projects";
import { useWorkflow } from "@/api/workflow";
import { PROJECT_STATUS, relativeTime } from "@/lib/format";
import { GateCard } from "@/features/workflow/gate-card";
import { StageList } from "@/features/workflow/stage-list";
import { Badge, Card, Row } from "@/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/ui/states";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProject(id);
  const delivery = useDelivery(id);
  const wf = useWorkflow(id);

  const refreshing = project.isRefetching || delivery.isRefetching || wf.isRefetching;
  const refresh = () => {
    void project.refetch();
    void delivery.refetch();
    void wf.refetch();
  };

  if (project.isError) {
    const missing = project.error instanceof ApiError && project.error.status === 404;
    return missing ? (
      <EmptyState icon={FileQuestion} title="Project not found" body="It may have been deleted." />
    ) : (
      <ErrorState error={project.error} onRetry={refresh} />
    );
  }

  const p = project.data;
  const status = p ? PROJECT_STATUS[p.status] : null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color.primary} />}
    >
      {p && status ? (
        <View style={styles.header}>
          <Text variant="title">{p.name}</Text>
          {p.description ? <Text muted>{p.description}</Text> : null}
          <View style={styles.meta}>
            <Badge label={status.label} tone={status.tone} />
            <Text variant="caption">Updated {relativeTime(p.updated_at)}</Text>
          </View>
        </View>
      ) : (
        <Skeleton style={styles.titleSkeleton} />
      )}

      {delivery.data ? <GateCard projectId={id} delivery={delivery.data} /> : delivery.isPending ? <Skeleton style={styles.gateSkeleton} /> : null}

      <Card>
        <Row
          leading={<MessagesSquare size={20} color={color.primary} />}
          title="Project Orchestrator"
          subtitle="Answer questions, add details or ask what happens next."
          onPress={() => router.push(`/projects/${id}/chat/intake`)}
        />
      </Card>

      <View style={styles.section}>
        <Text variant="heading">Stages</Text>
        {wf.isPending ? (
          <Skeleton style={styles.stagesSkeleton} />
        ) : wf.isError ? (
          <ErrorState error={wf.error} onRetry={() => void wf.refetch()} />
        ) : (
          <StageList projectId={id} stages={wf.data} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: sp(4), gap: sp(5), paddingBottom: sp(10) },
  header: { gap: sp(2) },
  meta: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  section: { gap: sp(3) },
  titleSkeleton: { height: 64 },
  gateSkeleton: { height: 120 },
  stagesSkeleton: { height: 260 },
});
