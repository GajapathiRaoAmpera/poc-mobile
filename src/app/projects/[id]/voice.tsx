import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  useAnimatedValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Keyboard, Mic, MicOff, PhoneOff, Play, X } from "lucide-react-native";
import { useDelivery } from "@/api/delivery";
import { useWorkflow } from "@/api/workflow";
import { AGENT } from "@/features/chat/agents";
import { useDeliveryVoice } from "@/features/chat/use-voice";
import { VoiceOrb } from "@/features/chat/voice-orb";
import { AgentRow, VOICE_AGENT } from "@/features/voice/agent-row";
import { cleanMessage } from "@/lib/format";
import { activeChannel } from "@/lib/voice/delivery-voice";
import type { VoiceSnapshot } from "@/lib/voice/live-client";
import type { Delivery } from "@/schemas/delivery";
import { STAGE_LABEL, type StageName } from "@/schemas/workflow";
import { Button } from "@/ui/button";
import { spring, useAppear } from "@/ui/motion";
import { Text } from "@/ui/text";
import { color, font, radius, sp, type } from "@/ui/theme";

const LIVE = ["listening", "thinking", "speaking"];

/** Keeps the newest words on screen while the caption grows. */
const tail = (s: string, n = 220) => (s.length > n ? `…${s.slice(-n).replace(/^\S*\s/, "")}` : s);

/** What the delivery is waiting for, phrased as what to say next. */
function deliveryLine(d: Delivery | undefined): string {
  if (!d) return "";
  const p = d.pending;
  const stage = (p?.payload?.stage ?? p?.stage) as StageName | "orchestrator" | null | undefined;
  const label = stage && stage !== "orchestrator" ? STAGE_LABEL[stage] : null;
  switch (p?.kind) {
    case "approval":
      return `Waiting for your approval of ${label ?? "the draft"} revision ${p.payload?.revision ?? ""} — say "approve" or "request changes"`;
    case "awaiting_answers":
      return "The Requirements Agent has open questions — answer them out loud";
    case "intake_questions":
      return "The Project Orchestrator has questions — answer them out loud";
    case "needs_input":
    case "quota":
    case "failed":
    case "cancelled":
      return `${cleanMessage(d.message)} — say "resume" when you're ready`;
  }
  if (d.status === "DONE") return "Delivery complete — ask anything about it";
  return cleanMessage(d.message) || (d.status === "RUNNING" ? "The agents are working" : "");
}

function voiceLine(v: VoiceSnapshot, name: string): string {
  if (v.switching) return `Switching to ${name}… keep talking`;
  switch (v.state) {
    case "connecting":
      return "Connecting…";
    case "listening":
      return v.muted ? "Microphone off — the delivery keeps going" : "Listening";
    case "thinking":
      return `${name} is working…`;
    case "speaking":
      return `${name} · Talk anytime to interrupt`;
    case "paused":
      return `${v.pausedReason ?? "Paused"} — tap the microphone to resume`;
    case "ended":
      return "Voice delivery ended";
    case "error":
      return "Voice paused";
    default:
      return "Tap the microphone to start";
  }
}

/** One screen for the whole delivery: whichever agent is active speaks, and everything is done by voice. */
export default function DeliveryVoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const delivery = useDelivery(id);
  const wf = useWorkflow(id);
  const voice = useDeliveryVoice(id);
  const { start } = voice;
  const [reduced, setReduced] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);

  // The user opened voice mode on purpose: start talking right away.
  useEffect(() => start(), [start]);

  const started = voice.state !== "idle" && voice.state !== "ended" && voice.state !== "error";
  const channel = started ? voice.channel : activeChannel(delivery.data);
  const agent = AGENT[channel];
  const live = LIVE.includes(voice.state);
  const connecting = voice.state === "connecting";
  const paused = voice.state === "paused";
  const speaking = voice.state === "speaking";

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/projects/${id}`));
  const toThread = () => router.push(`/projects/${id}/chat/${channel}`);

  const onMic = () => {
    if (paused) voice.resume();
    else if (live) voice.setMuted(!voice.muted);
    else if (!connecting) start();
  };
  const micLabel = paused
    ? "Resume voice delivery"
    : live
      ? voice.muted
        ? "Turn microphone on"
        : "Turn microphone off"
      : connecting
        ? "Connecting"
        : "Start voice delivery";

  const sendTyped = () => {
    const text = draft.trim();
    if (!text) return;
    voice.type(text);
    setDraft("");
  };

  const hasCaption = Boolean(voice.userText || voice.agentText);
  const orbSize = Math.min(width * 0.6, 260);

  // Handoff: the orb settles back while the next agent connects, then springs forward in its colour.
  const orbScale = useAnimatedValue(1);
  useEffect(() => {
    if (!reduced) spring(orbScale, voice.switching ? 0.86 : 1, "gentle", false).start();
  }, [voice.switching, reduced, orbScale]);
  // Barge-in duck or Stop tap: a quick dip so the user sees they were heard.
  const { hush } = voice;
  useEffect(() => {
    if (!hush || reduced) return;
    Animated.sequence([spring(orbScale, 0.92, "snappy", false), spring(orbScale, 1, "gentle", false)]).start();
  }, [hush, reduced, orbScale]);

  const confirmCard = useAppear(voice.confirming && !voice.error, reduced, "modal", "scale");
  const userCap = useAppear(Boolean(voice.userText), reduced);
  const agentCap = useAppear(Boolean(voice.agentText), reduced);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, sp(4)) }]}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close voice mode" onPress={close} style={styles.iconBtn} hitSlop={4}>
          <X size={24} color={color.text} />
        </Pressable>
        <Text variant="label" style={styles.title} numberOfLines={1}>
          Delivery voice
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <AgentRow active={channel} speaking={speaking} reduced={reduced} delivery={delivery.data} stages={wf.data} />

      <View style={styles.stage}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stop ${agent.name} speaking`}
          accessibilityHint="Silences the agent without ending voice mode"
          accessibilityState={{ disabled: !speaking }}
          disabled={!speaking}
          onPress={voice.stopSpeaking}
        >
          <Animated.View style={{ transform: [{ scale: orbScale }] }}>
            <VoiceOrb state={voice.state} levels={voice.levels} size={orbSize} reduced={reduced} tint={VOICE_AGENT[channel].tint} />
          </Animated.View>
        </Pressable>
        <View style={styles.statusBox} accessibilityLiveRegion="polite">
          <Text variant="eyebrow" style={styles.center} accessibilityRole="text">
            {voiceLine(voice, agent.name)}
          </Text>
          {deliveryLine(delivery.data) ? (
            <Text style={[styles.center, styles.delivery]} accessibilityRole="text">
              {deliveryLine(delivery.data)}
            </Text>
          ) : null}
          {voice.notice ? (
            <Text variant="label" style={[styles.center, styles.notice]}>
              {voice.notice}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.captions}>
        {voice.error ? (
          <View style={styles.error} accessibilityLiveRegion="assertive">
            <Text style={styles.center}>{voice.error.message}</Text>
            <View style={styles.row}>
              {voice.error.kind === "mic" ? (
                <Button label="Open Settings" onPress={() => void Linking.openSettings()} />
              ) : voice.error.kind === "network" || voice.error.kind === "session" ? (
                <Button label="Try again" onPress={start} />
              ) : null}
              <Button label="Type instead" variant="secondary" onPress={toThread} />
            </View>
          </View>
        ) : confirmCard.mounted ? (
          <Animated.View style={[styles.confirm, confirmCard.style]} accessibilityLiveRegion="assertive">
            <Text variant="label" style={styles.center}>
              Say "confirm" or "cancel"
            </Text>
            <View style={styles.row}>
              <Button label="Confirm" onPress={() => voice.confirm(true)} />
              <Button label="Cancel" variant="secondary" onPress={() => voice.confirm(false)} />
            </View>
          </Animated.View>
        ) : hasCaption ? (
          <Pressable accessibilityRole="button" accessibilityHint="Opens the full conversation" onPress={toThread} style={styles.captionBox}>
            {userCap.mounted ? (
              <Animated.View style={userCap.style}>
                <Text variant="eyebrow">You</Text>
                <Text muted style={styles.userCaption}>
                  {tail(voice.userText, 120)}
                </Text>
              </Animated.View>
            ) : null}
            {agentCap.mounted ? (
              <Animated.View style={agentCap.style} accessibilityLiveRegion="polite">
                <Text variant="eyebrow" style={{ color: VOICE_AGENT[channel].tint }}>
                  {agent.name}
                </Text>
                <Text style={styles.agentCaption}>{tail(voice.agentText)}</Text>
              </Animated.View>
            ) : null}
          </Pressable>
        ) : (
          <Text muted style={styles.center}>
            {voice.state === "ended"
              ? "Tap the microphone to talk again."
              : 'Ask "what\'s happening?", answer questions, or say "approve" when a draft is ready.'}
          </Text>
        )}
      </View>

      {typing ? (
        <View style={styles.typeRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${agent.name}`}
            placeholderTextColor={color.textMuted}
            accessibilityLabel={`Message ${agent.name}`}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={sendTyped}
            editable={live}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !live || !draft.trim() }}
            disabled={!live || !draft.trim()}
            onPress={sendTyped}
            style={[styles.send, (!live || !draft.trim()) && styles.off]}
          >
            <ArrowUp size={20} color={color.primaryFg} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.controls}>
        <SideButton label="Type" a11y={typing ? "Hide keyboard input" : "Type instead"} onPress={() => setTyping((t) => !t)} disabled={!live}>
          <Keyboard size={22} color={color.text} />
        </SideButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={micLabel}
          accessibilityState={{ busy: connecting, selected: live && !voice.muted }}
          disabled={connecting}
          onPress={onMic}
          style={({ pressed }) => [styles.mic, live && voice.muted && styles.micMuted, pressed && styles.micPressed]}
        >
          {connecting ? (
            <ActivityIndicator color={color.primaryFg} />
          ) : paused ? (
            <Play size={32} color={color.primaryFg} />
          ) : live && voice.muted ? (
            <MicOff size={32} color={color.primary} />
          ) : (
            <Mic size={32} color={color.primaryFg} />
          )}
        </Pressable>
        <SideButton label="End" a11y="End voice delivery" onPress={voice.stop} disabled={!started}>
          <PhoneOff size={22} color={started ? color.danger : color.textMuted} />
        </SideButton>
      </View>
    </KeyboardAvoidingView>
  );
}

function SideButton({
  label,
  a11y,
  onPress,
  disabled,
  children,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.side, disabled && styles.off]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.sideBtn, pressed && styles.sidePressed]}
      >
        {children}
      </Pressable>
      <Text variant="caption" importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: sp(2), height: 52 },
  title: { flex: 1, textAlign: "center" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", gap: sp(3) },
  statusBox: { gap: sp(1), paddingHorizontal: sp(6), alignItems: "center" },
  delivery: { ...type.sm, color: color.text },
  notice: { color: color.warning },
  center: { textAlign: "center" },
  captions: { minHeight: 168, paddingHorizontal: sp(6), justifyContent: "center" },
  captionBox: { gap: sp(3) },
  userCaption: { ...type.base },
  agentCaption: { ...type.xl, fontFamily: font.light, letterSpacing: -0.3 },
  error: { alignItems: "center", gap: sp(4) },
  confirm: {
    alignItems: "center",
    gap: sp(3),
    padding: sp(4),
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: sp(3) },
  typeRow: { flexDirection: "row", alignItems: "center", gap: sp(2), paddingHorizontal: sp(4), paddingTop: sp(2) },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderInput,
    paddingHorizontal: sp(4),
    ...type.base,
    fontFamily: font.regular,
    color: color.text,
    backgroundColor: color.surface,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingTop: sp(4) },
  mic: { width: 80, height: 80, borderRadius: 40, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  micMuted: { backgroundColor: color.primarySubtle, borderWidth: 2, borderColor: color.primary },
  micPressed: { opacity: 0.85 },
  side: { alignItems: "center", gap: sp(1), width: 72 },
  sideBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sidePressed: { backgroundColor: color.surfaceMuted },
  off: { opacity: 0.4 },
});
