import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { color, font, type } from "./theme";

type Variant = "display" | "title" | "heading" | "body" | "label" | "caption" | "eyebrow" | "mono";

export function Text({ variant = "body", muted, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean }) {
  return <RNText {...rest} style={[styles.base, styles[variant], muted && styles.muted, style]} />;
}

const styles = StyleSheet.create({
  base: { color: color.text, fontFamily: font.regular },
  display: { ...type.xxl, fontFamily: font.light, letterSpacing: -0.6 },
  title: { ...type.xl, fontFamily: font.medium, letterSpacing: -0.3 },
  heading: { ...type.lg, fontFamily: font.medium },
  body: { ...type.base },
  label: { ...type.sm, fontFamily: font.medium },
  caption: { ...type.sm, color: color.textMuted },
  eyebrow: { ...type.xs, fontFamily: font.medium, color: color.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  mono: { ...type.sm, fontFamily: font.mono },
  muted: { color: color.textMuted },
});
