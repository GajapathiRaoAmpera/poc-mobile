import { zodResolver } from "@hookform/resolvers/zod";
import { Image } from "expo-image";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, WEB_URL, errorMessage } from "@/api/client";
import { useSession } from "@/auth/session";
import { loginSchema, type LoginValues } from "@/schemas/auth";
import { Button } from "@/ui/button";
import { Banner, FormField, FormScreen } from "@/ui/form";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";

export default function Login() {
  const { signIn, expired } = useSession();
  const [error, setError] = useState<unknown>(null);
  const { control, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });
  const adminOnWeb = error instanceof ApiError && error.status === 403;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await signIn(v);
    } catch (e) {
      setError(e);
    }
  });

  return (
    <SafeAreaView style={styles.safe}>
      <FormScreen>
        <View style={styles.hero}>
          <Image source={require("../../../assets/brand/ampera-logo.png")} style={styles.logo} contentFit="contain" accessibilityLabel="Ampera" />
          <Text variant="display">Welcome back</Text>
          <Text muted>Check on your projects and keep the agents moving.</Text>
        </View>

        {expired && !error ? <Banner tone="info" text="Your session has expired. Sign in again to continue." /> : null}
        {error ? (
          <Banner text={errorMessage(error)}>
            {adminOnWeb ? (
              <Button size="sm" variant="secondary" label="Open the web app" onPress={() => void WebBrowser.openBrowserAsync(WEB_URL)} />
            ) : null}
          </Banner>
        ) : null}

        <FormField
          control={control}
          name="email"
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <FormField
          control={control}
          name="password"
          label="Password"
          secret
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void onSubmit()}
        />
        <Link href="/forgot-password" style={styles.link}>
          <Text variant="label" style={styles.linkText}>
            Forgot password?
          </Text>
        </Link>

        <Button label="Sign in" block loading={formState.isSubmitting} onPress={() => void onSubmit()} />

        <View style={styles.footer}>
          <Text muted>New to Ampera?</Text>
          <Link href="/register">
            <Text variant="label" style={styles.linkText}>
              Create an account
            </Text>
          </Link>
        </View>
      </FormScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  hero: { gap: sp(2), marginTop: sp(8), marginBottom: sp(2) },
  logo: { width: 140, height: 39, marginBottom: sp(6) },
  link: { alignSelf: "flex-end", paddingVertical: sp(1) },
  linkText: { color: color.primary },
  footer: { flexDirection: "row", gap: sp(2), justifyContent: "center", marginTop: "auto", paddingTop: sp(6), flexWrap: "wrap" },
});
