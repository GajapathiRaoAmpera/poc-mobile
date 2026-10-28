import { FlashList } from "@shopify/flash-list";
import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, MessagesSquare } from "lucide-react-native";
import { errorMessage } from "@/api/client";
import { useMessages, useSendMessage } from "@/api/conversations";
import { useDelivery } from "@/api/delivery";
import { useWorkflow } from "@/api/workflow";
import { AGENT, CHANNELS } from "@/features/chat/agents";
import { MessageBubble } from "@/features/chat/message-bubble";
import type { Channel, Message } from "@/schemas/conversation";
import { Banner } from "@/ui/form";
import { EmptyState, ErrorState, SkeletonList } from "@/ui/states";
import { Text } from "@/ui/text";
import { color, font, radius, sp } from "@/ui/theme";

const renderItem = ({ item }: { item: Message }) => <MessageBubble message={item} />;
const keyExtractor = (m: Message) => m.id;

export default function ChatScreen() {
  const { id, channel: raw } = useLocalSearchParams<{ id: string; channel: string }>();
  const channel = (CHANNELS.includes(raw as Channel) ? raw : "intake") as Channel;
  const agent = AGENT[channel];
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const delivery = useDelivery(id);
  const wf = useWorkflow(id);
  const stage = wf.data?.find((s) => s.stage === channel);
  const working =
    channel === "intake" ? delivery.data?.status === "RUNNING" : stage?.status === "QUEUED" || stage?.status === "RUNNING";
  const messages = useMessages(id, channel, working);
  const send = useSendMessage(id, channel);
  const [draft, setDraft] = useState("");

  const submit = (text = draft) => {
    const t = text.trim();
    if (!t || send.isPending) return;
    send.mutate(t, { onSuccess: () => setDraft("") });
  };

  const empty = messages.data?.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen options={{ title: agent.name }} />
      {messages.isPending ? (
        <SkeletonList rows={3} />
      ) : messages.isError ? (
        <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      ) : (
        <FlashList
          data={messages.data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.thread}
          keyboardDismissMode="interactive"
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          ListHeaderComponent={
            <Text variant="caption" style={styles.hint}>
              {agent.hint}
            </Text>
          }
          ListEmptyComponent={<EmptyState icon={MessagesSquare} title={agent.name} body={agent.empty} />}
          ListFooterComponent={
            working ? (
              <View style={styles.working} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={color.primary} />
                <Text variant="caption">{agent.name} is working…</Text>
              </View>
            ) : null
          }
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, sp(3)) }]}>
        {send.isError ? <Banner text={errorMessage(send.error)} /> : null}
        {empty && agent.suggestions ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.suggestions}>
            {agent.suggestions.map((s) => (
              <Pressable key={s} accessibilityRole="button" onPress={() => submit(s)} style={styles.suggestion}>
                <Text variant="caption" style={styles.suggestionText}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${agent.name}`}
            placeholderTextColor={color.textMuted}
            accessibilityLabel={`Message ${agent.name}`}
            multiline
            maxLength={4000}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !draft.trim() || send.isPending }}
            disabled={!draft.trim() || send.isPending}
            onPress={() => submit()}
            style={[styles.send, (!draft.trim() || send.isPending) && styles.sendOff]}
          >
            {send.isPending ? <ActivityIndicator size="small" color={color.primaryFg} /> : <ArrowUp size={20} color={color.primaryFg} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  thread: { paddingHorizontal: sp(4), paddingVertical: sp(3) },
  hint: { textAlign: "center", marginBottom: sp(3) },
  working: { flexDirection: "row", alignItems: "center", gap: sp(2), paddingVertical: sp(3) },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    backgroundColor: color.surface,
    paddingTop: sp(3),
    paddingHorizontal: sp(3),
    gap: sp(2),
  },
  suggestions: { gap: sp(2) },
  suggestion: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    backgroundColor: color.bg,
  },
  suggestionText: { color: color.text },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: sp(2) },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.borderInput,
    paddingHorizontal: sp(4),
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.text,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },
});
