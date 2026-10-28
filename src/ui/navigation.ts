import type { NativeStackNavigationOptions } from "expo-router";
import { color, font } from "./theme";

export const stackOptions: NativeStackNavigationOptions = {
  headerTintColor: color.primary,
  headerTitleStyle: { fontFamily: font.medium, color: color.text },
  headerLargeTitleStyle: { fontFamily: font.medium, color: color.text },
  headerShadowVisible: false,
  headerStyle: { backgroundColor: color.bg },
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: color.bg },
};

/** Tab roots: iOS large title that collapses on scroll. */
export const tabRootOptions: NativeStackNavigationOptions = {
  headerLargeTitle: true,
  headerLargeTitleShadowVisible: false,
};
