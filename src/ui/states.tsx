import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { CloudOff, type LucideIcon } from "lucide-react-native";
import { errorMessage } from "@/api/client";
import { Button } from "./button";
import { Text } from "./text";
import { color, radius, sp } from "./theme";

/** Pulsing placeholder block for content that takes longer than ~1s. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => reduced || loop.start());
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, style, { opacity }]} accessibilityLabel="Loading" />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} style={styles.skeletonRow} />
      ))}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Couldn't load this"
      body={errorMessage(error)}
      action={onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon size={24} color={color.primary} />
      </View>
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      {body ? (
        <Text muted style={styles.center}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: color.surfaceMuted, borderRadius: radius.input },
  skeletonRow: { height: 72, borderRadius: radius.card },
  list: { gap: sp(3), padding: sp(4) },
  empty: { alignItems: "center", gap: sp(3), paddingHorizontal: sp(8), paddingVertical: sp(12) },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
});
