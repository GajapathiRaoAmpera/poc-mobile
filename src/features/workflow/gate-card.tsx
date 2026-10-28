import { router } from "expo-router";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { CheckCircle2, PauseCircle } from "lucide-react-native";
import { errorMessage } from "@/api/client";
import { useCancelDelivery, useResumeDelivery } from "@/api/delivery";
import { cleanMessage } from "@/lib/format";
import type { Delivery } from "@/schemas/delivery";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";
import { color, radius, sp } from "@/ui/theme";

const RESUMABLE = new Set(["needs_input", "quota", "failed", "cancelled"]);

const NEXT_TITLE: Record<string, string> = {
  approval: "Review and approve the latest draft",
  awaiting_answers: "Answer the Requirements Agent's open questions",
  intake_questions: "Answer the Project Orchestrator's questions",
  needs_input: "More information is needed to continue",
  quota: "The AI service limit was reached",
  failed: "A stage failed — resume when ready",
  cancelled: "The workflow was cancelled",
};

/** What the delivery workflow is waiting for, and the one action that moves it on (mirrors the web GateCard). */
export function GateCard({ projectId, delivery }: { projectId: string; delivery: Delivery }) {
  const resume = useResumeDelivery(projectId);
  const cancel = useCancelDelivery(projectId);
  const fail = (e: unknown) => Alert.alert("Couldn't do that", errorMessage(e));
  const { status, pending } = delivery;
  const message = cleanMessage(delivery.message);
  if (status === "IDLE") return null;

  if (status === "RUNNING") {
    return (
      <Card tone="working" icon={<ActivityIndicator color={color.primary} />} eyebrow="Agents are working" title="No action needed right now" text={message}>
        <Button
          size="sm"
          variant="tertiary"
          label="Cancel workflow"
          loading={cancel.isPending}
          onPress={() =>
            Alert.alert("Cancel the workflow?", "The current stage stops. You can resume later.", [
              { text: "Keep running", style: "cancel" },
              { text: "Cancel workflow", style: "destructive", onPress: () => cancel.mutate(undefined, { onError: fail }) },
            ])
          }
        />
      </Card>
    );
  }
  if (status === "DONE") {
    return (
      <Card
        tone="done"
        icon={<CheckCircle2 size={22} color={color.success} />}
        eyebrow="Workflow complete"
        title="All planned stages are approved"
        text={message}
      />
    );
  }

  const kind = pending?.kind;
  const stage = pending?.payload?.stage ?? pending?.stage;
  let action: React.ReactNode = null;
  if (kind === "approval" && stage && stage !== "orchestrator") {
    action = <Button size="sm" label={`Review ${stage}`} onPress={() => router.push(`/projects/${projectId}/${stage}`)} />;
  } else if (kind === "awaiting_answers") {
    action = <Button size="sm" label="Answer open questions" onPress={() => router.push(`/projects/${projectId}/requirements`)} />;
  } else if (kind === "intake_questions") {
    action = (
      <View style={styles.questions}>
        {(pending?.payload?.questions ?? []).map((q) => (
          <View key={q.id} style={styles.question}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.flex}>{q.question}</Text>
          </View>
        ))}
        <Button size="sm" label="Reply to the Orchestrator" onPress={() => router.push(`/projects/${projectId}/chat/intake`)} />
      </View>
    );
  } else if (kind && RESUMABLE.has(kind)) {
    action = <Button size="sm" label="Resume workflow" loading={resume.isPending} onPress={() => resume.mutate(undefined, { onError: fail })} />;
  }
  return (
    <Card
      tone="action"
      icon={<PauseCircle size={22} color={color.primary} />}
      eyebrow="Your next step"
      title={NEXT_TITLE[kind ?? ""] ?? "The workflow is waiting for you"}
      text={message}
    >
      {action}
    </Card>
  );
}

const TONE = {
  working: { backgroundColor: color.surface, borderColor: color.borderStrong },
  action: { backgroundColor: color.primarySubtle, borderColor: color.primary },
  done: { backgroundColor: color.successSubtle, borderColor: color.success },
};

function Card({
  tone,
  icon,
  eyebrow,
  title,
  text,
  children,
}: {
  tone: keyof typeof TONE;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, TONE[tone]]} accessibilityRole="summary" accessibilityLiveRegion="polite">
      <View style={styles.head}>
        {icon}
        <Text variant="eyebrow">{eyebrow}</Text>
      </View>
      <Text variant="heading">{title}</Text>
      {text ? <Text muted>{text}</Text> : null}
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderCurve: "continuous", borderWidth: 1, padding: sp(4), gap: sp(2) },
  head: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  action: { marginTop: sp(2) },
  questions: { gap: sp(2) },
  question: { flexDirection: "row", gap: sp(2) },
  bullet: { color: color.primary },
  flex: { flex: 1 },
});
