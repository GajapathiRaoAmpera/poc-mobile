import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { FileQuestion, MessagesSquare } from "lucide-react-native";
import { ApiError } from "@/api/client";
import { useArtifact } from "@/api/artifacts";
import { useWorkflow } from "@/api/workflow";
import { ApprovalBar } from "@/features/artifacts/approval-bar";
import { ArchitectureView } from "@/features/artifacts/architecture-view";
import { BudgetView } from "@/features/artifacts/budget-view";
import { CodeView } from "@/features/artifacts/code-view";
import { PlanView } from "@/features/artifacts/plan-view";
import { RequirementsView } from "@/features/artifacts/requirements-view";
import { AGENT } from "@/features/chat/agents";
import { STAGE_STATUS, cleanMessage, relativeTime } from "@/lib/format";
import type { BudgetContent } from "@/schemas/budget";
import type { CodeContent } from "@/schemas/code";
import type { ArchitectureContent } from "@/schemas/diagram";
import type { PlanContent } from "@/schemas/plan";
import type { RequirementsContent } from "@/schemas/requirements";
import { STAGE_LABEL, type Revision, type StageName } from "@/schemas/workflow";
import { Badge, Card } from "@/ui/card";
import { Banner } from "@/ui/form";
import { EmptyState, ErrorState, SkeletonList } from "@/ui/states";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";

const STAGES = Object.keys(STAGE_LABEL) as StageName[];

export default function StageScreen() {
  const { id, stage: raw } = useLocalSearchParams<{ id: string; stage: string }>();
  const stage = STAGES.find((s) => s === raw);
  const wf = useWorkflow(id);
  const state = wf.data?.find((s) => s.stage === stage);
  const working = state?.status === "RUNNING" || state?.status === "QUEUED";
  const artifact = useArtifact(id, stage ?? "requirements", working);
  const { refetch: refetchArtifact } = artifact;
  // The last poll can land just before the run finishes; fetch once more when it stops.
  useEffect(() => {
    if (!working) void refetchArtifact();
  }, [working, refetchArtifact]);

  if (!stage) return <EmptyState icon={FileQuestion} title="Unknown stage" />;

  const refresh = () => {
    void wf.refetch();
    void artifact.refetch();
  };
  const rev = artifact.data?.revision;
  const meta = state ? STAGE_STATUS[state.status] : null;
  const reviewable = state?.status === "WAITING_FOR_APPROVAL" && rev && rev.revision === artifact.data?.latest_revision;
  const noArtifact = artifact.isError && artifact.error instanceof ApiError && artifact.error.status === 404;

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: STAGE_LABEL[stage],
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Chat with the ${AGENT[stage].name}`}
              hitSlop={10}
              onPress={() => router.push(`/projects/${id}/chat/${stage}`)}
            >
              <MessagesSquare size={22} color={color.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={wf.isRefetching || artifact.isRefetching} onRefresh={refresh} tintColor={color.primary} />}
      >
        {meta ? (
          <View style={styles.meta}>
            <Badge label={meta.label} tone={meta.tone} />
            {rev ? (
              <Text variant="caption">
                Revision {rev.revision} · {relativeTime(rev.created_at)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {working ? (
          <Card style={styles.working}>
            <ActivityIndicator color={color.primary} />
            <Text style={styles.flex}>The {AGENT[stage].name} is working on a new draft. This page updates when it's ready.</Text>
          </Card>
        ) : null}
        {artifact.data?.stale ? <Banner tone="info" text={artifact.data.stale_reason ?? "An input changed since this was drafted."} /> : null}
        {state?.latest_run?.status === "FAILED" && state.latest_run.error ? (
          <Banner text={cleanMessage(state.latest_run.error.message)} />
        ) : null}

        {artifact.isPending ? (
          <SkeletonList />
        ) : noArtifact || !rev ? (
          working ? null : (
            <EmptyState icon={FileQuestion} title="Nothing here yet" body={`The ${AGENT[stage].name} hasn't produced a draft yet.`} />
          )
        ) : artifact.isError ? (
          <ErrorState error={artifact.error} onRetry={refresh} />
        ) : (
          <>
            {rev.summary ? <Text muted>{cleanMessage(rev.summary)}</Text> : null}
            <ArtifactBody projectId={id} stage={stage} revision={rev} />
          </>
        )}
      </ScrollView>
      {reviewable ? <ApprovalBar projectId={id} kind={stage} revision={rev.revision} /> : null}
    </View>
  );
}

function ArtifactBody({ projectId, stage, revision }: { projectId: string; stage: StageName; revision: Revision }) {
  switch (stage) {
    case "requirements":
      return <RequirementsView projectId={projectId} revision={revision.revision} content={revision.content as RequirementsContent} />;
    case "architecture":
      return <ArchitectureView content={revision.content as ArchitectureContent} />;
    case "plan":
      return <PlanView content={revision.content as PlanContent} />;
    case "budget":
      return <BudgetView content={revision.content as BudgetContent} />;
    case "code":
      return <CodeView content={revision.content as CodeContent} />;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: sp(4), gap: sp(5), paddingBottom: sp(10) },
  meta: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  working: { flexDirection: "row", alignItems: "center", gap: sp(3), padding: sp(4) },
});
