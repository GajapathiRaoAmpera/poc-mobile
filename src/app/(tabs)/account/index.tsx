import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { ExternalLink, KeyRound, LogOut } from "lucide-react-native";
import { WEB_URL } from "@/api/client";
import { useSession } from "@/auth/session";
import { Card, Divider, Row } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, font, sp } from "@/ui/theme";

export default function Account() {
  const { user, signOut } = useSession();
  const initials = (user?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You'll need your email and password to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <View style={styles.flex}>
          <Text variant="heading">{user?.name ?? "Your account"}</Text>
          {user ? <Text variant="caption">{user.email}</Text> : null}
        </View>
      </View>

      <Card>
        <Row
          leading={<KeyRound size={20} color={color.primary} />}
          title="Change password"
          onPress={() => router.push("/account/change-password")}
        />
        <Divider />
        <Row
          leading={<ExternalLink size={20} color={color.primary} />}
          title="Open the web app"
          subtitle="Edit specifications, the architecture canvas and plans on a larger screen."
          onPress={() => void WebBrowser.openBrowserAsync(WEB_URL)}
        />
      </Card>

      <Card>
        <Row leading={<LogOut size={20} color={color.danger} />} title="Sign out" onPress={confirmSignOut} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: sp(4), gap: sp(5) },
  profile: { flexDirection: "row", alignItems: "center", gap: sp(4) },
  flex: { flex: 1 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontFamily: font.medium, fontSize: 20, color: color.primary },
});
