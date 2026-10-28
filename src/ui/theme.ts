/** Ampera brand tokens, mirrored from poc-frontend/src/styles/_tokens.scss. */
export const color = {
  bg: "#FCFCFC",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F5F4",
  text: "#050505",
  textMuted: "#5B5B5B",
  border: "rgba(5,5,5,0.1)",
  borderStrong: "rgba(5,5,5,0.25)",
  borderInput: "#8D8D8D",
  primary: "#9C369A",
  primaryPressed: "#7E2B7C",
  primaryFg: "#FFFFFF",
  primarySubtle: "#F7EDF7",
  navy: "#000F5C",
  cream: "#FFFEFA",
  lavender: "#8070B4",
  success: "#1E7B4A",
  successSubtle: "#E8F4ED",
  warning: "#8A5A00",
  warningSubtle: "#FDF4E3",
  danger: "#B42318",
  dangerSubtle: "#FDECEA",
  info: "#1D4ED8",
  infoSubtle: "#EAF0FD",
} as const;

// Embedded by the expo-font config plugin; names are the font files' PostScript names.
export const font = {
  light: "Switzer-Light",
  regular: "Switzer-Regular",
  medium: "Switzer-Medium",
  mono: "FragmentMono-Regular",
} as const;

/** 4pt spacing: sp(4) = 16. */
export const sp = (n: number) => n * 4;

export const radius = { pill: 40, card: 12, input: 8 } as const;

export const type = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 20, lineHeight: 28 },
  xl: { fontSize: 24, lineHeight: 32 },
  xxl: { fontSize: 30, lineHeight: 36 },
} as const;

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const tone: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: color.textMuted, bg: color.surfaceMuted },
  primary: { fg: color.primary, bg: color.primarySubtle },
  success: { fg: color.success, bg: color.successSubtle },
  warning: { fg: color.warning, bg: color.warningSubtle },
  danger: { fg: color.danger, bg: color.dangerSubtle },
  info: { fg: color.info, bg: color.infoSubtle },
};
