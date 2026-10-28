import { useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "@/api/client";
import { useSaveAnswers } from "@/api/artifacts";
import type { Priority, Requirement, RequirementsContent } from "@/schemas/requirements";
import { Button } from "@/ui/button";
import { Badge, Card } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, font, radius, sp, type Tone } from "@/ui/theme";
import { Bullets, Section } from "./section";

const PRIORITY_TONE: Record<Priority, Tone> = { MUST: "primary", SHOULD: "info", COULD: "neutral", WONT: "neutral" };
const ORDER: Priority[] = ["MUST", "SHOULD", "COULD", "WONT"];

export function RequirementsView({ projectId, revision, content }: { projectId: string; revision: number; content: RequirementsContent }) {
  const sorted = [...content.requirements].sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority));
  return (
    <>
      {content.open_questions.length ? <OpenQuestions key={revision} projectId={projectId} revision={revision} content={content} /> : null}
      {content.goals.length ? (
        <Section title="Goals">
          <Bullets items={content.goals} />
        </Section>
      ) : null}
      <Section title="Requirements" count={content.requirements.length}>
        {sorted.map((r) => (
          <RequirementCard key={r.id} r={r} />
        ))}
      </Section>
      {content.personas.length ? (
        <Section title="Who it's for">
          {content.personas.map((p) => (
            <View key={p.name} style={styles.gap1}>
              <Text variant="label">{p.name}</Text>
              <Text muted>{p.description}</Text>
            </View>
          ))}
        </Section>
      ) : null}
      {content.risks.length ? (
        <Section title="Risks">
          {content.risks.map((r, i) => (
            <Card key={i} style={styles.card}>
              <Badge label={`${r.likelihood} likelihood`} tone={r.likelihood === "high" ? "danger" : r.likelihood === "medium" ? "warning" : "neutral"} />
              <Text>{r.description}</Text>
              <Text variant="caption">Mitigation: {r.mitigation}</Text>
            </Card>
          ))}
        </Section>
      ) : null}
      {content.assumptions.length ? (
        <Section title="Assumptions">
          <Bullets items={content.assumptions} />
        </Section>
      ) : null}
    </>
  );
}

function RequirementCard({ r }: { r: Requirement }) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text variant="mono" muted>
          {r.id}
        </Text>
        <Badge label={r.priority} tone={PRIORITY_TONE[r.priority]} />
        {r.type === "non_functional" ? <Badge label="Non-functional" /> : null}
      </View>
      <Text variant="label">{r.title}</Text>
      <Text muted>{r.description}</Text>
      {r.acceptance_criteria.length ? (
        <View style={styles.gap1}>
          <Text variant="eyebrow">Acceptance criteria</Text>
          <Bullets items={r.acceptance_criteria} />
        </View>
      ) : null}
    </Card>
  );
}

function OpenQuestions({ projectId, revision, content }: { projectId: string; revision: number; content: RequirementsContent }) {
  const save = useSaveAnswers(projectId);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(content.open_questions.map((q) => [q.id, q.answer ?? ""])),
  );
  const changed = content.open_questions.some((q) => (answers[q.id] ?? "") !== (q.answer ?? ""));
  const unanswered = content.open_questions.filter((q) => !q.answer).length;

  const submit = () =>
    save.mutate(
      { base_revision: revision, answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.trim() || null])) },
      {
        onSuccess: () => Alert.alert("Answers saved", "The Requirements Agent will use them in the next draft."),
        onError: (e) => Alert.alert("Couldn't save answers", errorMessage(e)),
      },
    );

  return (
    <Section title="Open questions" count={unanswered || undefined}>
      {content.open_questions.map((q) => (
        <Card key={q.id} style={[styles.card, q.blocking && !q.answer ? styles.blocking : null]}>
          <View style={styles.row}>
            {q.blocking ? <Badge label="Blocking" tone="warning" /> : null}
            {q.answer ? <Badge label="Answered" tone="success" /> : null}
          </View>
          <Text variant="label">{q.question}</Text>
          <Text variant="caption">{q.why_it_matters}</Text>
          <TextInput
            value={answers[q.id]}
            onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))}
            placeholder="Your answer"
            placeholderTextColor={color.textMuted}
            accessibilityLabel={`Answer: ${q.question}`}
            multiline
            maxLength={2000}
            style={styles.answer}
          />
        </Card>
      ))}
      <Button label="Save answers" block disabled={!changed} loading={save.isPending} onPress={submit} />
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { padding: sp(4), gap: sp(2) },
  blocking: { borderColor: color.warning },
  row: { flexDirection: "row", alignItems: "center", gap: sp(2), flexWrap: "wrap" },
  gap1: { gap: sp(1) },
  answer: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radius.input,
    padding: sp(3),
    fontFamily: font.regular,
    fontSize: 16,
    color: color.text,
    marginTop: sp(1),
  },
});
