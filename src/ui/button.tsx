import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { Text } from "./text";
import { color, font, radius, sp } from "./theme";

type Variant = "primary" | "secondary" | "tertiary" | "danger";

interface Props extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  size?: "md" | "sm";
  block?: boolean;
}

/** Brand pill button: 48pt tall (44pt minimum touch target), haptic tick on press. */
export function Button({ label, variant = "primary", loading, icon, size = "md", block, disabled, onPress, ...rest }: Props) {
  const inactive = disabled || loading;
  const fg = FG[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={size === "sm" ? 6 : 0}
      onPress={(e) => {
        void Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        size === "sm" && styles.sm,
        block && styles.block,
        BG[variant],
        pressed && PRESSED[variant],
        inactive && styles.inactive,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator size="small" color={fg} /> : icon}
        <Text style={[styles.label, { color: fg }, size === "sm" && styles.labelSm]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const FG: Record<Variant, string> = {
  primary: color.primaryFg,
  secondary: color.text,
  tertiary: color.primary,
  danger: color.danger,
};

const BG = StyleSheet.create({
  primary: { backgroundColor: color.primary },
  secondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.borderStrong },
  tertiary: { backgroundColor: "transparent" },
  danger: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.danger },
});

const PRESSED = StyleSheet.create({
  primary: { backgroundColor: color.primaryPressed },
  secondary: { backgroundColor: color.surfaceMuted },
  tertiary: { backgroundColor: color.primarySubtle },
  danger: { backgroundColor: color.dangerSubtle },
});

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: sp(6),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  sm: { minHeight: 36, paddingHorizontal: sp(4) },
  block: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  label: { fontFamily: font.medium, fontSize: 16 },
  labelSm: { fontSize: 14 },
  inactive: { opacity: 0.5 },
});
