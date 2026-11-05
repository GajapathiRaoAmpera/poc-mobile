import { useEffect } from "react";
import { Animated, StyleSheet, View, useAnimatedValue } from "react-native";
import { CalendarDays, Check, Code, Compass, ListChecks, Network, Wallet, type LucideIcon } from "lucide-react-native";
import { AGENT } from "@/features/chat/agents";
import { VOICE_CHANNELS } from "@/lib/voice/delivery-voice";
import type { Channel } from "@/schemas/conversation";
import type { Delivery } from "@/schemas/delivery";
import type { StageState } from "@/schemas/workflow";
import { spring } from "@/ui/motion";
import { Text } from "@/ui/text";
import { color, type } from "@/ui/theme";

export type AgentStatus = "done" | "active" | "waiting" | "idle" | "off";

/** Each agent's look on the voice screen; the orb takes the active agent's tint. */
export const VOICE_AGENT: Record<Channel, { short: string; icon: LucideIcon; tint: string }> = {
  intake: { short: "Orchestrator", icon: Compass, tint: color.primary },
  requirements: { short: "Requirements", icon: ListChecks, tint: color.lavender },
  architecture: { short: "Architecture", icon: Network, tint: color.navy },
  plan: { short: "Plan", icon: CalendarDays, tint: color.info },
  budget: { short: "Budget", icon: Wallet, tint: color.success },
  code: { short: "Development", icon: Code, tint: color.warning },
};

const WAITING = new Set(["WAITING_FOR_APPROVAL", "WAITING_FOR_INPUT", "NEEDS_REVISION"]);
const OFF = new Set(["UNAVAILABLE", "NOT_PLANNED"]);

export function agentStatus(ch: Channel, active: Channel, delivery?: Delivery, stages?: StageState[]): AgentStatus {
  if (ch === active) return "active";
  if (ch === "intake") {
    if (delivery?.pending?.kind === "intake_questions") return "waiting";
    return delivery?.plan ? "done" : "idle";
  }
  const s = stages?.find((x) => x.stage === ch);
  if (!s) return "idle";
  if (s.status === "APPROVED") return "done";
  if (WAITING.has(s.status)) return "waiting";
  return OFF.has(s.status) ? "off" : "idle";
}

const STATUS_WORD: Record<AgentStatus, string> = {
  done: "done",
  active: "active",
  waiting: "waiting for you",
  idle: "not started",
  off: "not in this plan",
};

/** The six agents in delivery order; the one talking wears a ring that pulses while it speaks. */
export function AgentRow({
  active,
  speaking,
  reduced,
  delivery,
  stages,
}: {
  active: Channel;
  speaking: boolean;
  reduced: boolean;
  delivery?: Delivery;
  stages?: StageState[];
}) {
  return (
    <View style={styles.row} accessibilityRole="list">
      {VOICE_CHANNELS.map((ch) => (
        <Avatar key={ch} ch={ch} status={agentStatus(ch, active, delivery, stages)} speaking={speaking && ch === active} reduced={reduced} />
      ))}
    </View>
  );
}

function Avatar({ ch, status, speaking, reduced }: { ch: Channel; status: AgentStatus; speaking: boolean; reduced: boolean }) {
  const meta = VOICE_AGENT[ch];
  const Icon = meta.icon;
  const isActive = status === "active";
  const pulse = useAnimatedValue(0);
  const lift = useAnimatedValue(isActive ? 1 : 0);
  const done = useAnimatedValue(status === "done" ? 1 : 0);

  // Becoming active / done: snappy spring, same preset as the web avatars.
  useEffect(() => spring(lift, isActive ? 1 : 0, "snappy", reduced).start(), [isActive, reduced, lift]);
  useEffect(() => spring(done, status === "done" ? 1 : 0, "snappy", reduced).start(), [status, reduced, done]);

  useEffect(() => {
    if (!speaking || reduced) {
      pulse.setValue(0);
      return;
    }
    // Functional loop while this agent talks: the ring breathes out and back on a gentle spring.
    const loop = Animated.loop(Animated.sequence([spring(pulse, 1, "gentle", false), spring(pulse, 0, "critical", false)]));
    loop.start();
    return () => loop.stop();
  }, [speaking, reduced, pulse]);

  const ringStyle = {
    borderColor: meta.tint,
    opacity: reduced ? 1 : Animated.add(lift, Animated.multiply(pulse, -0.6)),
    transform: reduced ? [] : [{ scale: Animated.add(lift.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }), Animated.multiply(pulse, 0.1)) }],
  };
  return (
    <View
      style={[styles.item, status === "off" && styles.off]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${AGENT[ch].name}, ${speaking ? "speaking" : STATUS_WORD[status]}`}
    >
      <View style={styles.avatarBox}>
        {isActive ? <Animated.View style={[styles.ring, ringStyle]} /> : null}
        <Animated.View
          style={[
            styles.avatar,
            isActive ? { backgroundColor: meta.tint } : status === "waiting" ? styles.waiting : null,
            !reduced && { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] },
          ]}
        >
          <Icon size={20} color={isActive ? color.primaryFg : status === "waiting" ? color.warning : color.textMuted} />
        </Animated.View>
        {status === "done" ? (
          <Animated.View style={[styles.check, { opacity: done }, !reduced && { transform: [{ scale: done }] }]}>
            <Check size={10} color={color.primaryFg} strokeWidth={3} />
          </Animated.View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.label, isActive && styles.labelActive]}>
        {meta.short}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 },
  item: { alignItems: "center", gap: 4, flex: 1, minHeight: 44 },
  off: { opacity: 0.4 },
  avatarBox: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 52, height: 52, borderRadius: 26, borderWidth: 2 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surfaceMuted,
  },
  waiting: { backgroundColor: color.warningSubtle, borderWidth: 1, borderColor: color.warning },
  check: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.success,
    borderWidth: 2,
    borderColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...type.xs, color: color.textMuted, maxWidth: 60 },
  labelActive: { color: color.text },
});
