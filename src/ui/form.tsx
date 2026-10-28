import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { AlertCircle, Eye, EyeOff } from "lucide-react-native";
import { Field } from "./field";
import { Text } from "./text";
import { color, radius, sp, tone } from "./theme";

type FieldProps = React.ComponentProps<typeof Field>;

/** A Field bound to react-hook-form; errors show after blur or submit (RHF "onTouched"). */
export function FormField<T extends FieldValues>({
  control,
  name,
  secret,
  ...rest
}: Omit<FieldProps, "value" | "onChangeText" | "error"> & { control: Control<T>; name: Path<T>; secret?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View>
          <Field
            {...rest}
            value={field.value ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry={secret && !shown}
            style={secret ? styles.secretInput : undefined}
          />
          {secret ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={shown ? "Hide password" : "Show password"}
              onPress={() => setShown((s) => !s)}
              hitSlop={8}
              style={styles.eye}
            >
              {shown ? <EyeOff size={20} color={color.textMuted} /> : <Eye size={20} color={color.textMuted} />}
            </Pressable>
          ) : null}
        </View>
      )}
    />
  );
}

export function Banner({ text, tone: t = "danger", children }: { text: string; tone?: "danger" | "info" | "success"; children?: React.ReactNode }) {
  return (
    <View style={[styles.banner, { backgroundColor: tone[t].bg }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <AlertCircle size={18} color={tone[t].fg} />
      <View style={styles.bannerBody}>
        <Text variant="caption" style={{ color: tone[t].fg }}>
          {text}
        </Text>
        {children}
      </View>
    </View>
  );
}

/** Scrollable form screen that keeps the focused input above the keyboard. */
export function FormScreen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: sp(6), gap: sp(5), flexGrow: 1 },
  secretInput: { paddingRight: 48 },
  eye: { position: "absolute", right: sp(3), top: 38, height: 32, justifyContent: "center" },
  banner: { flexDirection: "row", gap: sp(2), padding: sp(3), borderRadius: radius.input, alignItems: "flex-start" },
  bannerBody: { flex: 1, gap: sp(2) },
});
