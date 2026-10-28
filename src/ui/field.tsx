import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./text";
import { color, font, radius, sp } from "./theme";

interface Props extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

/** Visible label above the input; error replaces the hint and is announced. */
export function Field({ label, error, hint, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="label" nativeID={`${label}-label`}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={color.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, focused && styles.focused, !!error && styles.invalid, style]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sp(1.5) },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radius.input,
    paddingHorizontal: sp(3),
    paddingVertical: sp(3),
    fontFamily: font.regular,
    fontSize: 16,
    color: color.text,
    backgroundColor: color.surface,
  },
  focused: { borderColor: color.primary, borderWidth: 2, paddingHorizontal: sp(3) - 1 },
  invalid: { borderColor: color.danger },
  error: { color: color.danger },
});
