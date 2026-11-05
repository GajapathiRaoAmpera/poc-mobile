import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { configureClient } from "@/api/client";
import { IDLE_SNAPSHOT, type LiveClient, type LiveClientOptions, type VoiceSnapshot } from "@/lib/voice/live-client";
import { useDeliveryVoice } from "../use-voice";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Error: "error" },
}));
// The real factory is never used here, but keep the native module out of the test runtime.
jest.mock("react-native-audio-api", () => ({}));

function fakeFactory() {
  const made: { opts: Omit<LiveClientOptions, "audio">; client: Record<string, any> }[] = [];
  const factory = (opts: Omit<LiveClientOptions, "audio">) => {
    const client = {
      levels: { mic: 0, out: 0 },
      channel: "intake",
      busy: false,
      held: false,
      snapshot: IDLE_SNAPSHOT,
      isAsking: () => false,
      isOwn: () => false,
      setChannel: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      dispose: jest.fn(),
      setMuted: jest.fn(),
      switchChannel: jest.fn(),
      sendText: jest.fn(),
    };
    made.push({ opts, client });
    return client as unknown as LiveClient;
  };
  return { factory, made };
}

const snap = (p: Partial<VoiceSnapshot>): VoiceSnapshot => ({ ...IDLE_SNAPSHOT, ...p });

beforeEach(() => {
  configureClient({ token: "t" });
  globalThis.fetch = jest.fn(() => Promise.reject(new Error("offline")));
});

test("moves through the voice states, with haptics on connect, speaking and end", async () => {
  const qc = new QueryClient();
  const invalidate = jest.spyOn(qc, "invalidateQueries");
  const { factory, made } = fakeFactory();
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const { result, unmount } = await renderHook(() => useDeliveryVoice("p1", factory), { wrapper });

  expect(result.current.state).toBe("idle");
  await act(() => result.current.start());
  const { opts, client } = made[0];
  expect(opts).toMatchObject({ projectId: "p1", channel: "intake" });
  await act(async () => {});
  // Delivery unreachable: the Orchestrator still starts so the user can talk.
  expect(client.setChannel).toHaveBeenCalledWith("intake");
  expect(client.start).toHaveBeenCalled();

  for (const state of ["connecting", "listening", "thinking", "speaking", "listening", "ended"] as const) {
    await act(() => opts.onChange(snap({ state })));
    expect(result.current.state).toBe(state);
  }
  expect((Haptics.impactAsync as jest.Mock).mock.calls.map((c) => c[0])).toEqual(["medium", "light", "medium"]);

  await act(() => opts.onChange(snap({ state: "error", error: { kind: "network", message: "Can't reach the server." } })));
  expect(result.current.error?.kind).toBe("network");
  expect(Haptics.notificationAsync).toHaveBeenCalled();

  await act(() => opts.onChange(snap({ state: "connecting", switching: true })));
  expect((Haptics.impactAsync as jest.Mock).mock.calls.at(-1)[0]).toBe("light");

  opts.onAction?.();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["messages", "p1"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["delivery", "p1"] });

  // Restart replaces the old session; unmount releases the mic.
  await act(() => result.current.start());
  expect(client.stop).toHaveBeenCalled();
  expect(client.dispose).toHaveBeenCalled();
  result.current.setMuted(true);
  expect(made[1].client.setMuted).toHaveBeenCalledWith(true);
  await unmount();
  expect(made[1].client.dispose).toHaveBeenCalled();
});
