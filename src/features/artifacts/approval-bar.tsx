import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "@/api/client";
import { useDecision } from "@/api/artifacts";
import type { ArtifactKind } from "@/schemas/workflow";
import { STAGE_LABEL } from "@/schemas/workflow";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";
import { color, font, radius, sp } from "@/ui/theme";

/** Sticky footer for a draft awaiting review: approve, or request changes with a comment. */
export function ApprovalBar({ projectId, kind, revision }: { projectId: string; kind: ArtifactKind; revision: number }) {
  const insets = useSafeAreaInsets();
  const decide = useDecision(projectId, kind);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const fail = (e: unknown) => Alert.alert("Couldn't save your decision", errorMessage(e));

  const approve = () =>
    decide.mutate(
      { n: revision, decision: "approve" },
      { onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), onError: fail },
    );

  const requestChanges = () =>
    decide.mutate(
      { n: revision, decision: "request-changes", comment: comment.trim() },
      {
        onSuccess: () => {
          setAsking(false);
          setComment("");
        },
        onError: fail,
      },
    );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, sp(3)) }]}>
      <Text variant="caption" style={styles.caption}>
        {STAGE_LABEL[kind]} revision {revision} is ready for your review
      </Text>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button label="Request changes" variant="secondary" block disabled={decide.isPending} onPress={() => setAsking(true)} />
        </View>
        <View style={styles.flex}>
          <Button label="Approve" block loading={decide.isPending && !asking} disabled={decide.isPending} onPress={approve} />
        </View>
      </View>

      <Modal visible={asking} presentationStyle="formSheet" animationType="slide" onRequestClose={() => setAsking(false)}>
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Text variant="title">What should change?</Text>
          <Text muted>The agent revises the draft using your comment. Be specific about what's missing or wrong.</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="e.g. Add offline support for field staff"
            placeholderTextColor={color.textMuted}
            accessibilityLabel="Requested changes"
            multiline
            autoFocus
            maxLength={2000}
            style={styles.input}
          />
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" block onPress={() => setAsking(false)} />
            </View>
            <View style={styles.flex}>
              <Button label="Send request" block disabled={!comment.trim()} loading={decide.isPending} onPress={requestChanges} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
    backgroundColor: color.surface,
    paddingHorizontal: sp(4),
    paddingTop: sp(3),
    gap: sp(2),
  },
  caption: { textAlign: "center" },
  actions: { flexDirection: "row", gap: sp(3) },
  flex: { flex: 1 },
  sheet: { flex: 1, padding: sp(6), gap: sp(4), backgroundColor: color.bg },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radius.input,
    padding: sp(3),
    fontFamily: font.regular,
    fontSize: 16,
    color: color.text,
    textAlignVertical: "top",
    backgroundColor: color.surface,
  },
});
