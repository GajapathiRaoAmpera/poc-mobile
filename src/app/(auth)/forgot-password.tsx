import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, router } from "expo-router";
import { useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/api/client";
import { useRequestReset } from "@/api/auth";
import { forgotSchema } from "@/schemas/auth";
import { Button } from "@/ui/button";
import { Banner, FormField, FormScreen } from "@/ui/form";
import { Text } from "@/ui/text";
import { sp } from "@/ui/theme";

export default function ForgotPassword() {
  const reset = useRequestReset();
  const { control, handleSubmit, getValues } = useForm<{ email: string }>({
    resolver: zodResolver(forgotSchema),
    mode: "onTouched",
    defaultValues: { email: "" },
  });
  const onSubmit = handleSubmit((v) => reset.mutate(v.email.trim()));

  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Reset password" }} />
      {reset.isSuccess ? (
        <View style={styles.block}>
          <Text variant="title">Check your email</Text>
          <Text muted>
            If an account exists for {getValues("email").trim()}, we've sent a link to reset your password. Open it on this
            phone or your computer, then sign in here with the new password.
          </Text>
          <Button label="Back to sign in" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <View style={styles.block}>
            <Text variant="title">Forgot your password?</Text>
            <Text muted>Enter your email and we'll send you a link to choose a new one.</Text>
          </View>
          {reset.isError ? <Banner text={errorMessage(reset.error)} /> : null}
          <FormField
            control={control}
            name="email"
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onSubmitEditing={() => void onSubmit()}
          />
          <Button label="Send reset link" block loading={reset.isPending} onPress={() => void onSubmit()} />
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({ block: { gap: sp(3) } });
