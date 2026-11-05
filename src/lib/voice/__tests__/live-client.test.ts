import { configureClient } from "@/api/client";
import { LiveClient, type AudioIO, type SocketLike, type VoiceSnapshot } from "../live-client";
import { floatToPcm16Base64, pcm16Base64ToFloat, resample } from "../pcm";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

class FakeSocket implements SocketLike {
  sent: any[] = [];
  closed = false;
  binaryType?: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  server(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

function fakeAudio(): AudioIO & { flushed: number; played: number; chunk?: (b64: string, lvl: number) => void } {
  const a = {
    flushed: 0,
    played: 0,
    chunk: undefined as undefined | ((b64: string, lvl: number) => void),
    requestPermission: jest.fn(async () => true),
    startMic: jest.fn(async (cb: (b64: string, lvl: number) => void) => {
      a.chunk = cb;
    }),
    stopMic: jest.fn(),
    play: jest.fn(() => {
      a.played++;
      return { seconds: 0.05, level: 0.6 };
    }),
    flush: jest.fn(() => {
      a.flushed++;
    }),
    close: jest.fn(),
  };
  return a;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(fn()).toBe(true);
};

let fetchMock: jest.Mock;
let socket: FakeSocket;
let states: VoiceSnapshot[];

function makeClient(audio = fakeAudio()) {
  states = [];
  const onMessages = jest.fn();
  const client = new LiveClient({
    projectId: "p1",
    channel: "requirements",
    audio,
    onChange: (s) => states.push(s),
    onMessages,
    createSocket: (url) => (socket = new FakeSocket(url)),
    pollMs: 1,
    replyTimeoutMs: 1000,
  });
  return { client, audio, onMessages };
}

async function connect(client: LiveClient) {
  fetchMock.mockReturnValueOnce(json(201, { token: "auth_tokens/abc", model: "gemini-live", expires_at: "x", tool: "send_to_agent" }));
  await client.start();
  socket.onopen?.();
  socket.server({ setupComplete: {} });
  await tick();
}

beforeEach(() => {
  configureClient({ token: "t0k" });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
});

test("mints a session for the channel, opens the constrained endpoint and sends setup", async () => {
  const { client } = makeClient();
  await connect(client);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toMatch(/\/projects\/p1\/voice\/session$/);
  expect(JSON.parse(init.body)).toEqual({ channel: "requirements" });
  expect(socket.url).toBe(
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens%2Fabc",
  );
  expect(socket.sent[0].setup).toEqual({
    model: "models/gemini-live",
    generationConfig: { responseModalities: ["AUDIO"] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  });
  expect(states.map((s) => s.state)).toEqual(["connecting", "listening"]);
});

test("streams mic audio once live, and stops while muted", async () => {
  const { client, audio } = makeClient();
  await connect(client);
  audio.chunk!("QUJD", 0.4);
  expect(socket.sent.at(-1)).toEqual({ realtimeInput: { audio: { data: "QUJD", mimeType: "audio/pcm;rate=16000" } } });
  expect(client.levels.mic).toBe(0.4);
  client.setMuted(true);
  expect(socket.sent.at(-1)).toEqual({ realtimeInput: { audioStreamEnd: true } });
  const n = socket.sent.length;
  audio.chunk!("QUJD", 0.4);
  expect(socket.sent.length).toBe(n);
});

test("tool call: posts to the agent, polls for its reply, returns it as the tool response", async () => {
  const { client, onMessages } = makeClient();
  await connect(client);
  fetchMock
    .mockReturnValueOnce(json(202, { message: { id: "m1", seq: 7, role: "user", text: "add audit logging" }, run: null }))
    .mockReturnValueOnce(json(200, []))
    .mockReturnValueOnce(json(200, [{ id: "m2", seq: 8, role: "agent", text: "Added FR-12 audit logging." }]));

  socket.server({ toolCall: { functionCalls: [{ id: "c1", name: "send_to_agent", args: { text: "add audit logging" } }] } });
  await tick();
  expect(client.snapshot.state).toBe("thinking");
  await until(() => socket.sent.some((m) => m.toolResponse));

  const post = fetchMock.mock.calls[1];
  expect(post[0]).toMatch(/\/projects\/p1\/conversations\/requirements\/messages$/);
  expect(post[1].method).toBe("POST");
  expect(JSON.parse(post[1].body)).toEqual({ text: "add audit logging" });
  expect(fetchMock.mock.calls[2][0]).toMatch(/messages\?after=7$/);
  expect(socket.sent.find((m) => m.toolResponse)).toEqual({
    toolResponse: { functionResponses: [{ id: "c1", name: "send_to_agent", response: { output: "Added FR-12 audit logging." } }] },
  });
  expect(onMessages).toHaveBeenCalledTimes(2);
  expect(client.snapshot.state).toBe("listening");
});

test("tool call: a busy agent (409) is read back as the server's message", async () => {
  const { client } = makeClient();
  await connect(client);
  fetchMock.mockReturnValueOnce(json(409, { error: { code: "CONFLICT", message: "The agent is busy. Try again in a moment." } }));
  socket.server({ toolCall: { functionCalls: [{ id: "c2", name: "send_to_agent", args: { text: "hi" } }] } });
  await until(() => socket.sent.some((m) => m.toolResponse));
  expect(socket.sent.find((m) => m.toolResponse).toolResponse.functionResponses[0].response.output).toBe(
    "The agent is busy. Try again in a moment.",
  );
});

test("plays model audio, flushes it on interruption, and builds captions", async () => {
  const { client, audio } = makeClient();
  await connect(client);
  socket.server({ serverContent: { inputTranscription: { text: "What's " } } });
  socket.server({ serverContent: { inputTranscription: { text: "risky?" } } });
  socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm;rate=24000" } }] } } });
  socket.server({ serverContent: { outputTranscription: { text: "Payments." } } });
  expect(audio.played).toBe(1);
  expect(client.snapshot.state).toBe("speaking");
  expect(client.snapshot).toMatchObject({ userText: "What's risky?", agentText: "Payments." });

  socket.server({ serverContent: { interrupted: true } });
  expect(audio.flushed).toBe(1);
  expect(client.levels.out).toBe(0);
  expect(client.snapshot.state).toBe("listening");
});

test("errors say how to recover: mic denied, voice unavailable, dropped connection", async () => {
  const denied = fakeAudio();
  denied.requestPermission = jest.fn(async () => false);
  const a = makeClient(denied).client;
  await a.start();
  expect(a.snapshot).toMatchObject({ state: "error", error: { kind: "mic" } });
  expect(fetchMock).not.toHaveBeenCalled();

  const b = makeClient().client;
  fetchMock.mockReturnValueOnce(json(503, { error: { code: "VOICE_UNAVAILABLE", message: "Voice isn't available right now." } }));
  await b.start();
  expect(b.snapshot.error).toEqual({ kind: "unavailable", message: "Voice isn't available right now." });

  const c = makeClient().client;
  fetchMock.mockReturnValueOnce(json(201, { token: "auth_tokens/x", model: "m" }));
  await c.start();
  socket.onclose?.({ code: 1008 });
  expect(c.snapshot.error?.kind).toBe("session");
});

test("server closing a live session ends it and releases the mic", async () => {
  const { client, audio } = makeClient();
  await connect(client);
  socket.onclose?.({ code: 1000 });
  expect(client.snapshot.state).toBe("ended");
  expect(audio.stopMic).toHaveBeenCalled();
});

test("pcm16 round trip and resampling", () => {
  const src = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const back = pcm16Base64ToFloat(floatToPcm16Base64(src));
  back.forEach((v, i) => expect(v).toBeCloseTo(src[i], 3));
  expect(resample(new Float32Array(480), 48_000, 16_000)).toHaveLength(160);
});
