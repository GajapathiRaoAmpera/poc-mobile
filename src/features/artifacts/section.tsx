import { StyleSheet, View } from "react-native";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";

export function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {count !== undefined ? <Text variant="caption">{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <View style={styles.bullets}>
      {items.map((t, i) => (
        <View key={i} style={styles.bullet}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.flex}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** Label/value pair in a summary grid. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="eyebrow">{label}</Text>
      <Text variant="heading">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: sp(3) },
  head: { flexDirection: "row", alignItems: "baseline", gap: sp(2) },
  bullets: { gap: sp(2) },
  bullet: { flexDirection: "row", gap: sp(2) },
  dot: { color: color.primary },
  flex: { flex: 1 },
  stat: { flex: 1, minWidth: 120, gap: sp(1) },
});
