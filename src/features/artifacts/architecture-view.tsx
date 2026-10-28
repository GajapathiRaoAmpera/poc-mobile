import { StyleSheet, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import type { ArchitectureContent, DiagramNode } from "@/schemas/diagram";
import { Badge, Card } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";
import { Bullets, Section } from "./section";

/** The diagram as lists: components by group, then connections and decisions. The canvas stays on the web. */
export function ArchitectureView({ content }: { content: ArchitectureContent }) {
  const names = Object.fromEntries(content.nodes.map((n) => [n.id, n.label]));
  const groupLabel = Object.fromEntries(content.groups.map((g) => [g.id, g.label]));
  const byGroup = new Map<string, DiagramNode[]>();
  for (const n of content.nodes) {
    const key = n.group ? (groupLabel[n.group] ?? n.group) : "Components";
    byGroup.set(key, [...(byGroup.get(key) ?? []), n]);
  }

  return (
    <>
      {[...byGroup].map(([group, nodes]) => (
        <Section key={group} title={group} count={nodes.length}>
          {nodes.map((n) => (
            <Card key={n.id} style={styles.card}>
              <View style={styles.row}>
                <Badge label={n.type.replace("_", " ")} tone="primary" />
                {n.technology ? <Text variant="mono" muted>{n.technology}</Text> : null}
              </View>
              <Text variant="label">{n.label}</Text>
              {n.description ? <Text muted>{n.description}</Text> : null}
              {n.responsibilities.length ? <Bullets items={n.responsibilities} /> : null}
            </Card>
          ))}
        </Section>
      ))}

      {content.edges.length ? (
        <Section title="Connections" count={content.edges.length}>
          <Card>
            {content.edges.map((e, i) => (
              <View key={e.id} style={[styles.edge, i > 0 && styles.edgeBorder]}>
                <View style={styles.row}>
                  <Text variant="label" style={styles.shrink}>{names[e.source] ?? e.source}</Text>
                  <ArrowRight size={16} color={color.textMuted} />
                  <Text variant="label" style={styles.shrink}>{names[e.target] ?? e.target}</Text>
                </View>
                {e.label || e.protocol ? (
                  <Text variant="caption">{[e.label, e.protocol].filter(Boolean).join(" · ")}</Text>
                ) : null}
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {content.decisions.length ? (
        <Section title="Decisions" count={content.decisions.length}>
          {content.decisions.map((d) => (
            <Card key={d.id} style={styles.card}>
              <Text variant="label">{d.title}</Text>
              <Text>{d.decision}</Text>
              {d.rationale ? <Text variant="caption">Why: {d.rationale}</Text> : null}
              {d.alternatives.length ? <Text variant="caption">Considered: {d.alternatives.join(", ")}</Text> : null}
            </Card>
          ))}
        </Section>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: sp(4), gap: sp(2) },
  row: { flexDirection: "row", alignItems: "center", gap: sp(2), flexWrap: "wrap" },
  shrink: { flexShrink: 1 },
  edge: { paddingHorizontal: sp(4), paddingVertical: sp(3), gap: sp(1) },
  edgeBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
