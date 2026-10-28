import { Pressable, StyleSheet, View, type ViewProps } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Text } from "./text";
import { color, radius, sp, tone as tones, type Tone } from "./theme";

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
}

/** A tappable row inside a card or list: title, optional subtitle, trailing slot, chevron. */
export function Row({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
}: {
  title: string;
  subtitle?: string | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {leading}
      <View style={styles.rowText}>
        <Text variant="label" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress ? <ChevronRight size={18} color={color.textMuted} /> : null}
    </Pressable>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text variant="caption" style={[styles.badgeText, { color: t.fg }]}>
        {label}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    borderCurve: "continuous",
  },
  row: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3), minHeight: 56 },
  pressed: { backgroundColor: color.surfaceMuted },
  rowText: { flex: 1, gap: 2 },
  badge: { borderRadius: radius.pill, paddingHorizontal: sp(2.5), paddingVertical: 2, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.border, marginLeft: sp(4) },
});
