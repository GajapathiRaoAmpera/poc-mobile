import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { cleanMessage, relativeTime } from "@/lib/format";
import type { Message } from "@/schemas/conversation";
import { AGENT_LABEL } from "@/schemas/workflow";
import { Text } from "@/ui/text";
import { color, radius, sp } from "@/ui/theme";

export const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  const text = cleanMessage(message.text);
  if (message.role === "system") {
    return (
      <View style={styles.system}>
        <Text variant="caption" style={styles.systemText}>
          {text}
        </Text>
      </View>
    );
  }
  const mine = message.role === "user";
  return (
    <View style={[styles.wrap, mine ? styles.mineWrap : styles.agentWrap]}>
      {!mine && message.agent ? <Text variant="eyebrow">{AGENT_LABEL[message.agent] ?? message.agent}</Text> : null}
      <View style={[styles.bubble, mine ? styles.mine : styles.agent]}>
        <Text selectable style={mine ? styles.mineText : undefined}>
          {text}
        </Text>
      </View>
      <Text variant="caption" style={styles.time}>
        {relativeTime(message.created_at)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { maxWidth: "86%", gap: sp(1), marginVertical: sp(1.5) },
  mineWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  agentWrap: { alignSelf: "flex-start" },
  bubble: { paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: 18, borderCurve: "continuous" },
  mine: { backgroundColor: color.primary, borderBottomRightRadius: 6 },
  agent: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    borderBottomLeftRadius: 6,
  },
  mineText: { color: color.primaryFg },
  time: { fontSize: 11 },
  system: {
    alignSelf: "center",
    backgroundColor: color.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: sp(3),
    paddingVertical: sp(1.5),
    marginVertical: sp(2),
    maxWidth: "92%",
  },
  systemText: { textAlign: "center" },
});
