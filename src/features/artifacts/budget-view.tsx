import { StyleSheet, View } from "react-native";
import { formatMoney, roleLabel } from "@/lib/format";
import type { BudgetContent } from "@/schemas/budget";
import { Card } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";
import { Bullets, Section } from "./section";

export function BudgetView({ content }: { content: BudgetContent }) {
  const money = (a: string) => formatMoney(a, content.currency);
  return (
    <>
      <Card style={styles.total}>
        <Text variant="eyebrow">Estimated total</Text>
        <Text variant="display" style={styles.totalValue}>
          {money(content.total)}
        </Text>
        <Line label="Labour" value={money(content.labour.total)} />
        <Line label="Other costs" value={money(content.non_labour)} />
        <Line label={`Contingency (${content.contingency_pct}%)`} value={money(content.contingency)} />
        {content.contingency_reason ? <Text variant="caption">{content.contingency_reason}</Text> : null}
      </Card>
      {content.warnings.length ? (
        <Card style={[styles.card, styles.warn]}>
          <Bullets items={content.warnings} />
        </Card>
      ) : null}

      <Section title="Labour by role">
        <Card style={styles.card}>
          {content.labour.by_role.map((r) => (
            <Line key={r.role} label={roleLabel(r.role)} detail={`${r.days} days`} value={money(r.cost)} />
          ))}
        </Card>
      </Section>

      <Section title="Labour by milestone">
        <Card style={styles.card}>
          {content.labour.by_milestone.map((m) => (
            <Line key={m.milestone_id} label={m.title} detail={`${m.days} days`} value={money(m.cost)} />
          ))}
        </Card>
      </Section>

      {content.items.length ? (
        <Section title="Other costs">
          <Card style={styles.card}>
            {content.items.map((it, i) => (
              <Line
                key={i}
                label={it.description}
                detail={it.recurrence === "monthly" ? `Monthly × ${content.months}` : "One-off"}
                value={money(it.amount)}
              />
            ))}
          </Card>
        </Section>
      ) : null}
    </>
  );
}

function Line({ label, detail, value }: { label: string; detail?: string; value: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.flex}>
        <Text>{label}</Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
      <Text variant="label" style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  total: { padding: sp(5), gap: sp(2), backgroundColor: color.primarySubtle, borderColor: color.primary },
  totalValue: { color: color.primary, marginBottom: sp(2) },
  card: { padding: sp(4), gap: sp(3) },
  warn: { borderColor: color.warning, backgroundColor: color.warningSubtle },
  line: { flexDirection: "row", alignItems: "flex-start", gap: sp(3) },
  flex: { flex: 1 },
  value: { fontVariant: ["tabular-nums"] },
});
