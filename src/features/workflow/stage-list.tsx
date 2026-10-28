import { router } from "expo-router";
import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { STAGE_STATUS } from "@/lib/format";
import { STAGE_LABEL, type StageState } from "@/schemas/workflow";
import { Badge, Card, Divider, Row } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, tone } from "@/ui/theme";

const HIDDEN = new Set(["UNAVAILABLE", "NOT_PLANNED"]);

/** The delivery pipeline: one row per stage, tappable once it has something to show. */
export function StageList({ projectId, stages }: { projectId: string; stages: StageState[] }) {
  const shown = stages.filter((s) => !HIDDEN.has(s.status));
  return (
    <Card>
      {shown.map((s, i) => {
        const meta = STAGE_STATUS[s.status];
        const openable = Boolean(s.artifact) || s.status === "RUNNING" || s.status === "QUEUED";
        const rev = s.artifact?.latest_revision;
        return (
          <Fragment key={s.stage}>
            {i > 0 ? <Divider /> : null}
            <Row
              leading={
                <View style={[styles.step, { backgroundColor: tone[meta.tone].bg }]}>
                  <Text variant="label" style={{ color: tone[meta.tone].fg }}>
                    {i + 1}
                  </Text>
                </View>
              }
              title={STAGE_LABEL[s.stage]}
              subtitle={rev ? `Revision ${rev}${s.artifact?.approved_revision === rev ? " · approved" : ""}` : s.reasons[0] ?? null}
              trailing={<Badge label={meta.label} tone={meta.tone} />}
              onPress={openable ? () => router.push(`/projects/${projectId}/${s.stage}`) : undefined}
            />
          </Fragment>
        );
      })}
      {shown.length === 0 ? (
        <Text muted style={styles.none}>
          The Project Orchestrator hasn't planned any stages yet.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  step: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  none: { padding: 16, color: color.textMuted },
});
