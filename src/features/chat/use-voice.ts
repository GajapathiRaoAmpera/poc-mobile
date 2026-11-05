import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { dlKeys } from "@/api/delivery";
import { wfKeys } from "@/api/workflow";
import { DeliveryVoice } from "@/lib/voice/delivery-voice";
import { IDLE_SNAPSHOT, LiveClient, type LiveClientOptions, type VoiceSnapshot } from "@/lib/voice/live-client";

type Factory = (opts: Omit<LiveClientOptions, "audio">) => LiveClient;

// Lazy so screens and tests that never start voice don't load the native audio module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const defaultFactory: Factory = (opts) => new LiveClient({ ...opts, audio: require("@/lib/voice/audio").createAudio() });

/**
 * The whole delivery by voice: idle → connecting → listening ⇄ thinking ⇄ speaking (⇄ paused) → ended | error,
 * voiced by whichever agent is active.
 */
export function useDeliveryVoice(projectId: string, factory: Factory = defaultFactory) {
  const qc = useQueryClient();
  const [snap, setSnap] = useState<VoiceSnapshot>(IDLE_SNAPSHOT);
  const client = useRef<LiveClient | null>(null);
  const runner = useRef<DeliveryVoice | null>(null);
  const levels = useRef({ mic: 0, out: 0 });
  /** Bumps on barge-in and on Stop, so the screen can give visual feedback. */
  const [hush, setHush] = useState(0);

  const start = useCallback(() => {
    runner.current?.stop();
    client.current?.dispose();
    const refetch = () => {
      void qc.invalidateQueries({ queryKey: ["messages", projectId] });
      void qc.invalidateQueries({ queryKey: ["artifact", projectId] });
      void qc.invalidateQueries({ queryKey: wfKeys.workflow(projectId) });
      void qc.invalidateQueries({ queryKey: dlKeys.delivery(projectId) });
    };
    const c = factory({
      projectId,
      channel: "intake",
      onChange: setSnap,
      onMessages: refetch,
      onAction: refetch,
      onBargeIn: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setHush((n) => n + 1);
      },
    });
    client.current = c;
    levels.current = c.levels;
    const r = new DeliveryVoice({ projectId, client: c, onDelivery: (d) => qc.setQueryData(dlKeys.delivery(projectId), d) });
    runner.current = r;
    void r.start();
  }, [projectId, qc, factory]);

  const stop = useCallback(() => runner.current?.stop(), []);
  const setMuted = useCallback((m: boolean) => client.current?.setMuted(m), []);
  const type = useCallback((text: string) => client.current?.type(text), []);
  const confirm = useCallback((yes: boolean) => client.current?.confirm(yes), []);
  const stopSpeaking = useCallback(() => {
    client.current?.stopSpeaking();
    setHush((n) => n + 1);
  }, []);
  const resume = useCallback(() => void client.current?.resume(), []);

  // The mic never runs in the background: leaving the app pauses; coming back resumes (or reconnects).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") client.current?.pause("Paused while Ampera is in the background");
      else if (s === "active" && client.current?.snapshot.pausedReason?.includes("background")) void client.current.resume();
    });
    return () => {
      sub.remove();
      runner.current?.stop();
      client.current?.dispose();
    };
  }, []);

  const prev = useRef(snap);
  useEffect(() => {
    const was = prev.current;
    prev.current = snap;
    if (snap.switching && !was.switching) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (was.state === snap.state) return;
    if (was.state === "connecting" && snap.state === "listening") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (snap.state === "speaking") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (snap.state === "ended") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (snap.state === "error") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [snap]);

  return { ...snap, hush, levels, start, stop, setMuted, type, confirm, stopSpeaking, resume };
}
