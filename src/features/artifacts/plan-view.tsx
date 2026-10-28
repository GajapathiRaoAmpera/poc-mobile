import { StyleSheet, View } from "react-native";
import { formatDay, roleLabel } from "@/lib/format";
import type { PlanContent } from "@/schemas/plan";
import { Badge, Card } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";
import { Bullets, Section, Stat } from "./section";

export function PlanView({ content }: { content: PlanContent }) {
  const { schedule } = content;
  return (
    <>
      <Card style={styles.stats}>
        <Stat label="Starts" value={formatDay(schedule.start)} />
        <Stat label="Ends" value={formatDay(schedule.end)} />
        <Stat label="Working days" value={String(schedule.working_days)} />
      </Card>
      {schedule.target_date ? (
        <Text variant="caption">
          Target date: {formatDay(schedule.target_date)}
          {schedule.end > schedule.target_date ? " — the plan runs past it" : ""}
        </Text>
      ) : null}
      {content.warnings.length ? (
        <Card style={[styles.card, styles.warn]}>
          <Bullets items={content.warnings} />
        </Card>
      ) : null}

      <Section title="Milestones" count={content.milestones.length}>
        {content.milestones.map((m, i) => {
          const tasks = content.tasks.filter((t) => t.milestone_id === m.id);
          return (
            <Card key={m.id} style={styles.card}>
              <View style={styles.row}>
                <Badge label={`M${i + 1}`} tone="primary" />
                <Text variant="caption">
                  {formatDay(m.start)} – {formatDay(m.end)}
                </Text>
              </View>
              <Text variant="label">{m.title}</Text>
              <Text muted>{m.goal}</Text>
              {tasks.map((t) => (
                <View key={t.id} style={styles.task}>
                  <View style={styles.flex}>
                    <Text>{t.title}</Text>
                    <Text variant="caption">
                      {roleLabel(t.role)} · {formatDay(t.start)} – {formatDay(t.end)}
                    </Text>
                  </View>
                  <Text variant="mono" muted>
                    {t.effort_days}d
                  </Text>
                </View>
              ))}
            </Card>
          );
        })}
      </Section>

      {content.risks.length ? (
        <Section title="Risks">
          {content.risks.map((r) => (
            <Card key={r.id} style={styles.card}>
              <Badge label={`${r.impact} impact`} tone={r.impact === "high" ? "danger" : r.impact === "medium" ? "warning" : "neutral"} />
              <Text>{r.description}</Text>
              <Text variant="caption">Mitigation: {r.mitigation}</Text>
            </Card>
          ))}
        </Section>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", padding: sp(4), gap: sp(4) },
  card: { padding: sp(4), gap: sp(2) },
  warn: { borderColor: color.warning, backgroundColor: color.warningSubtle },
  row: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  task: {
    flexDirection: "row",
    gap: sp(3),
    paddingTop: sp(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  flex: { flex: 1, gap: 2 },
});
