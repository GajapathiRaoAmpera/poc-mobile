import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronRight, Copy, FileCode2 } from "lucide-react-native";
import type { CodeContent, CodeFile } from "@/schemas/code";
import { Badge, Card } from "@/ui/card";
import { Text } from "@/ui/text";
import { color, sp } from "@/ui/theme";
import { Bullets, Section } from "./section";

/** Read-only scaffold: checks, next steps and each file's contents. Downloading the script stays on the web. */
export function CodeView({ content }: { content: CodeContent }) {
  const { report } = content;
  const errors = report.findings.filter((f) => f.level === "error").length;
  return (
    <>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Badge label={`bash -n ${report.bash_n}`} tone={report.bash_n === "ok" ? "success" : "danger"} />
          <Badge
            label={`shellcheck ${report.shellcheck}`}
            tone={report.shellcheck === "ok" ? "success" : report.shellcheck === "failed" ? "danger" : "neutral"}
          />
          {report.findings.length ? (
            <Badge label={`${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`} tone={errors ? "danger" : "warning"} />
          ) : null}
        </View>
        <Text variant="caption">Download and run the scaffold script from the web app.</Text>
      </Card>

      {content.next_steps.length ? (
        <Section title="Next steps">
          <Bullets items={content.next_steps} />
        </Section>
      ) : null}

      <Section title="Files" count={content.files.length}>
        <Card>
          {content.files.map((f, i) => (
            <FileRow key={f.path} file={f} first={i === 0} />
          ))}
        </Card>
      </Section>
    </>
  );
}

function FileRow({ file, first }: { file: CodeFile; first: boolean }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View style={!first && styles.border}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.file, pressed && styles.pressed]}
      >
        <FileCode2 size={18} color={color.primary} />
        <Text variant="mono" style={styles.path} numberOfLines={1}>
          {file.path}
        </Text>
        <Chevron size={18} color={color.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.codeWrap}>
          <ScrollView horizontal>
            <Text variant="mono" selectable style={styles.code}>
              {file.content}
            </Text>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy ${file.path}`}
            hitSlop={8}
            onPress={() => void Clipboard.setStringAsync(file.content)}
            style={styles.copy}
          >
            <Copy size={16} color={color.textMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: sp(4), gap: sp(2) },
  row: { flexDirection: "row", gap: sp(2), flexWrap: "wrap" },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  file: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(4), minHeight: 48 },
  pressed: { backgroundColor: color.surfaceMuted },
  path: { flex: 1 },
  codeWrap: { backgroundColor: color.surfaceMuted, marginHorizontal: sp(3), marginBottom: sp(3), borderRadius: 8 },
  code: { padding: sp(3), fontSize: 12, lineHeight: 18 },
  copy: { position: "absolute", top: sp(2), right: sp(2), padding: sp(1) },
});
