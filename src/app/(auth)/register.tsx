import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "expo-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrors } from "@/api/client";
import { useSession } from "@/auth/session";
import { registerSchema, type RegisterValues } from "@/schemas/auth";
import { Button } from "@/ui/button";
import { Banner, FormField, FormScreen } from "@/ui/form";
import { Text } from "@/ui/text";
import { sp } from "@/ui/theme";

export default function Register() {
  const { register } = useSession();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError: setFieldError } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await register(v);
    } catch (e) {
      const fields = Object.entries(fieldErrors(e)).filter(([k]) => k in v);
      for (const [k, msg] of fields) setFieldError(k as keyof RegisterValues, { message: msg });
      if (!fields.length) setError(errorMessage(e));
    }
  });

  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Create account" }} />
      <View style={styles.intro}>
        <Text variant="title">Start your first project</Text>
        <Text muted>Describe an idea and the agents turn it into requirements, an architecture, a plan and a budget.</Text>
      </View>
      {error ? <Banner text={error} /> : null}
      <FormField control={control} name="name" label="Your name" autoComplete="name" textContentType="name" />
      <FormField
        control={control}
        name="email"
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <FormField
        control={control}
        name="password"
        label="Password"
        hint="At least 10 characters"
        secret
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void onSubmit()}
      />
      <Button label="Create account" block loading={formState.isSubmitting} onPress={() => void onSubmit()} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({ intro: { gap: sp(2) } });
