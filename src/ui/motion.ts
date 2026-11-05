/**
 * Spring presets shared with poc-frontend's Motion.dev skill (reference/spring-physics.md), run on
 * React Native's built-in Animated with the native driver: transform and opacity only.
 */
import { useEffect, useState } from "react";
import { Animated, useAnimatedValue } from "react-native";

export const SPRING = {
  /** Default: buttons, cards, most UI. */
  gentle: { stiffness: 300, damping: 20, mass: 1 },
  /** Micro-interactions: avatar state, badges, press feedback. */
  snappy: { stiffness: 500, damping: 25, mass: 0.8 },
  /** Modal-like surfaces: the confirm card. */
  modal: { stiffness: 200, damping: 25, mass: 1.5 },
  /** No overshoot: exits and returns to rest. */
  critical: { stiffness: 300, damping: 50, mass: 1 },
} as const;

export type SpringName = keyof typeof SPRING;

/** Spring to `toValue`; under reduced motion an instant set (callers keep reduced paths opacity-only). */
export function spring(value: Animated.Value, toValue: number, preset: SpringName, reduced: boolean) {
  if (reduced) return Animated.timing(value, { toValue, duration: 0, useNativeDriver: true });
  return Animated.spring(value, { toValue, ...SPRING[preset], useNativeDriver: true });
}

/**
 * Enter/exit for a block that comes and goes: fades and rises in on a spring, fades out without
 * overshoot, then unmounts. Reduced motion: a 100 ms opacity fade only.
 */
export function useAppear(visible: boolean, reduced: boolean, preset: SpringName = "gentle", from: "rise" | "scale" = "rise") {
  const [mounted, setMounted] = useState(visible);
  const v = useAnimatedValue(visible ? 1 : 0);
  // Mount as soon as it should show (state adjusted during render, not in an effect).
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const anim = reduced
      ? Animated.timing(v, { toValue: visible ? 1 : 0, duration: 100, useNativeDriver: true })
      : spring(v, visible ? 1 : 0, visible ? preset : "critical", false);
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, reduced, preset, v]);

  const transform = reduced
    ? []
    : from === "rise"
      ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }]
      : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }];
  return { mounted, style: { opacity: v, transform } };
}
