import { configureClient } from "@/api/client";
import type { Channel, Message } from "@/schemas/conversation";
import type { Delivery } from "@/schemas/delivery";
import { activeChannel, DeliveryVoice } from "../delivery-voice";
import { BARGE, LiveClient, type AudioIO, type SocketLike, type SystemAudioEvent } from "../live-client";

// ---------- fakes ----------

class FakeSocket implements SocketLike {
  sent: any[] = [];
  closed = false;
  ready = false;
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
  texts() {
    return this.sent.filter((m) => m.clientContent).map((m) => m.clientContent.turns[0].parts[0].text as string);
  }
  tool() {
    return this.sent.find((m) => m.toolResponse)?.toolResponse.functionResponses[0];
  }
}

function fakeAudio(playSeconds = 0.05) {
  const a = {
    chunk: undefined as undefined | ((b64: string, lvl: number) => void),
    system: undefined as undefined | ((e: SystemAudioEvent) => void),
    gains: [] as number[],
    requestPermission: jest.fn(async () => true),
    startMic: jest.fn(async (cb: (b64: string, lvl: number) => void) => {
      a.chunk = cb;
    }),
    stopMic: jest.fn(),
    play: jest.fn(() => ({ seconds: playSeconds, level: 0.6 })),
    flush: jest.fn(),
    setGain: jest.fn((g: number) => void a.gains.push(g)),
    watchSystem: jest.fn((cb: (e: SystemAudioEvent) => void) => {
      a.system = cb;
      return () => {};
    }),
    close: jest.fn(),
  };
  return a satisfies AudioIO;
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 300 && !fn(); i++) await wait(5);
  expect(fn()).toBe(true);
};

/** 100 ms of 16 kHz PCM16 as base64 (only the length matters to the client). */
const CHUNK = "A".repeat(4268);

const delivery = (p: Partial<Delivery>): Delivery => ({
  status: "PAUSED",
  pending: null,
  message: "Working.",
  plan: null,
  last_error: null,
  updated_at: null,
  ...p,
});
const approval = (stage: string, revision: number) =>
  delivery({ pending: { kind: "approval", stage: stage as never, payload: { revision } }, message: `Waiting for ${stage} approval.` });

let n = 0;
const msg = (channel: Channel, seq: number, p: Partial<Message> = {}): Message => ({
  id: `m${++n}`,
  channel,
  seq,
  role: "agent",
  agent: null,
  text: "hello",
  refs: {},
  created_at: new Date(Date.UTC(2026, 10, 5, 12, 0, n)).toISOString(),
  ...p,
});

// ---------- fake backend ----------

let state: { delivery: Delivery; messages: Record<string, Message[]>; posts: { path: string; body: any }[]; sessions: string[] };
let sockets: FakeSocket[];

function backend() {
  state = { delivery: delivery({ status: "IDLE" }), messages: {}, posts: [], sessions: [] };
  sockets = [];
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^.*\/api\/v1/, "");
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    if (init.method === "POST") state.posts.push({ path, body });
    if (path.endsWith("/voice/session")) {
      state.sessions.push(body.channel);
      return json(201, { token: `tok-${body.channel}`, model: "live", expires_at: new Date(Date.now() + 600_000).toISOString() });
    }
    if (path.endsWith("/delivery")) return json(200, state.delivery);
    if (/\/delivery\/(resume|cancel)$/.test(path)) return json(200, delivery({ status: "RUNNING", message: "Delivery is running." }));
    if (/\/revisions\/\d+\/(approve|request-changes)$/.test(path)) return json(200, {});
    if (/\/runs\/[^/]+\/cancel$/.test(path)) return json(200, {});
    const m = /\/conversations\/(\w+)\/messages(?:\?after=(\d+))?$/.exec(path);
    if (m && init.method === "POST") {
      const list = (state.messages[m[1]] ??= []);
      const seq = (list.at(-1)?.seq ?? 0) + 1;
      const sent = msg(m[1] as Channel, seq, { role: "user", text: body.text });
      list.push(sent);
      return json(202, { message: sent, run: { id: "run-1" } });
    }
    if (m) return json(200, (state.messages[m[1]] ?? []).filter((x) => x.seq > Number(m[2] ?? -1)));
    return json(404, { error: { code: "NOT_FOUND", message: "nope" } });
  }) as unknown as typeof fetch;
}

function makeClient(audio = fakeAudio(), extra: { onBargeIn?: () => void; onAction?: () => void } = {}) {
  const client = new LiveClient({
    projectId: "p1",
    channel: "intake",
    audio,
    onChange: () => {},
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    pollMs: 2,
    replyTimeoutMs: 2000,
    ...extra,
  });
  return { client, audio };
}

/** Finishes the handshake of the newest socket. */
async function setup() {
  // Wait for a socket that hasn't been set up yet (a handoff opens a new one after the old).
  await until(() => sockets.some((x) => !x.ready && x.onopen !== null));
  const s = sockets.find((x) => !x.ready && x.onopen !== null)!;
  s.ready = true;
  s.onopen?.();
  s.server({ setupComplete: {} });
  await tick();
  await tick();
  return s;
}

async function live(channel: Channel = "intake", audio = fakeAudio(), extra = {}) {
  const made = makeClient(audio, extra);
  made.client.setChannel(channel);
  await made.client.start();
  const socket = await setup();
  return { ...made, socket };
}

beforeEach(() => {
  configureClient({ token: "t0k" });
  backend();
});

// ---------- active channel ----------

test.each([
  ["approval on requirements", approval("requirements", 2), null, "requirements"],
  ["awaiting answers", delivery({ pending: { kind: "awaiting_answers", stage: "requirements" } }), null, "requirements"],
  ["stage busy", delivery({ status: "RUNNING", pending: { kind: "stage_busy", stage: "budget" } }), "plan", "budget"],
  ["stage in payload only", delivery({ pending: { kind: "approval", stage: null, payload: { stage: "plan", revision: 1 } } }), null, "plan"],
  ["intake questions", delivery({ pending: { kind: "intake_questions", stage: "orchestrator" } }), "code", "intake"],
  ["idle", delivery({ status: "IDLE" }), "architecture", "intake"],
  ["done", delivery({ status: "DONE" }), "code", "intake"],
  ["running, newest agent message on architecture", delivery({ status: "RUNNING" }), "architecture", "architecture"],
  ["running, no messages", delivery({ status: "RUNNING" }), null, "intake"],
  ["no delivery yet", undefined, null, "intake"],
] as const)("active channel: %s", (_name, d, newest, expected) => {
  expect(activeChannel(d, newest as Channel | null)).toBe(expected);
});

// ---------- handoff ----------

describe("handoff", () => {
  test("starts on the active agent; on change closes the session, mints a token for the new agent and sends [HANDOFF]", async () => {
    state.delivery = delivery({ pending: { kind: "intake_questions", stage: "orchestrator" } });
    const { client } = makeClient();
    const dv = new DeliveryVoice({ projectId: "p1", client, pollMs: 60_000 });
    await dv.start();
    const first = await setup();
    expect(state.sessions).toEqual(["intake"]);

    state.delivery = approval("requirements", 2);
    await dv.tick();
    expect(first.closed).toBe(true);
    expect(client.snapshot).toMatchObject({ channel: "requirements", switching: true });
    const second = await setup();
    expect(state.sessions).toEqual(["intake", "requirements"]);
    expect(second.url).toMatch(/access_token=tok-requirements$/);
    expect(second.texts()[0]).toBe("[HANDOFF] Previous agent: Project Orchestrator. Latest update: Waiting for requirements approval.");
    expect(client.snapshot.switching).toBe(false);
    dv.stop();
  });

  test("waits while the agent is speaking, then hands over", async () => {
    state.delivery = delivery({ status: "IDLE" });
    const { client } = makeClient();
    const dv = new DeliveryVoice({ projectId: "p1", client, pollMs: 60_000 });
    await dv.start();
    const first = await setup();

    first.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } } });
    state.delivery = approval("plan", 1);
    await dv.tick();
    expect(first.closed).toBe(false);
    expect(state.sessions).toEqual(["intake"]);

    first.server({ serverContent: { turnComplete: true } });
    await wait(70); // let the queued audio finish
    await dv.tick();
    expect(first.closed).toBe(true);
    await setup();
    expect(state.sessions).toEqual(["intake", "plan"]);
    dv.stop();
  });

  test("keeps the user's speech during the reconnect and sends it, in order, to the new agent", async () => {
    const { client, audio, socket } = await live("intake");
    void client.switchChannel("budget", "[HANDOFF] Previous agent: Project Orchestrator.");
    expect(client.snapshot.switching).toBe(true);
    audio.chunk!("Zmlyc3Q=", 0.5);
    audio.chunk!("c2Vjb25k", 0.5);
    expect(socket.sent.filter((m) => m.realtimeInput?.audio)).toHaveLength(0);
    const next = await setup();
    expect(audio.startMic).toHaveBeenCalledTimes(1); // the mic never stopped
    const order = next.sent.slice(1).map((m) => m.clientContent?.turns[0].parts[0].text ?? m.realtimeInput?.audio?.data);
    expect(order).toEqual(["[HANDOFF] Previous agent: Project Orchestrator.", "Zmlyc3Q=", "c2Vjb25k"]);
  });
});

// ---------- narration ----------

describe("narration", () => {
  test("reads other agents' news as [UPDATE], collapses repeated progress, never re-reads the user's own reply", async () => {
    state.delivery = delivery({ status: "IDLE" });
    state.messages.plan = [msg("plan", 1, { text: "old history" })];
    const { client } = makeClient();
    const dv = new DeliveryVoice({ projectId: "p1", client, pollMs: 60_000 });
    await dv.start();
    const socket = await setup();

    state.messages.plan.push(
      msg("plan", 2, { role: "system", text: "Drafting…", refs: { progress: true } }),
      msg("plan", 3, { role: "system", text: "Validating…", refs: { progress: true } }),
    );
    state.messages.budget = [msg("budget", 1, { agent: "budget_estimator", text: "Estimate ready." })];
    await dv.tick();
    expect(socket.texts()).toEqual(["[UPDATE] Planning Agent: Validating…\n[UPDATE] Budget Agent: Estimate ready."]);

    // The user's own question to the Orchestrator: its reply comes back as the tool result only.
    socket.server({ toolCall: { functionCalls: [{ id: "c1", name: "send_to_agent", args: { text: "what's next?" } }] } });
    await until(() => state.messages.intake?.length === 1);
    state.messages.intake.push(msg("intake", 2, { text: "Next is the plan." }));
    await dv.tick();
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toBe("Next is the plan.");
    await dv.tick();
    expect(socket.texts()).toHaveLength(1);
    dv.stop();
  });

  test("queues news while the agent talks and sends it when the turn completes", async () => {
    const { client } = makeClient();
    const dv = new DeliveryVoice({ projectId: "p1", client, pollMs: 60_000 });
    await dv.start();
    const socket = await setup();
    socket.server({ serverContent: { outputTranscription: { text: "So the plan is" } } });
    state.messages.code = [msg("code", 1, { text: "Scaffold generated." })];
    await dv.tick();
    expect(socket.texts()).toEqual([]);
    socket.server({ serverContent: { turnComplete: true } });
    expect(socket.texts()).toEqual(["[UPDATE] Development Agent: Scaffold generated."]);
    dv.stop();
  });

  test("a cut-off update with a question is re-offered once, after the user's turn", async () => {
    const { client } = makeClient();
    const dv = new DeliveryVoice({ projectId: "p1", client, pollMs: 60_000 });
    await dv.start();
    const socket = await setup();
    state.messages.requirements = [msg("requirements", 1, { text: "Should logins use SSO?" })];
    await dv.tick();
    expect(socket.texts()).toEqual(["[UPDATE] Requirements Agent: Should logins use SSO?"]);

    socket.server({ serverContent: { outputTranscription: { text: "The Requirements Agent asks" } } });
    socket.server({ serverContent: { interrupted: true } });
    expect(client.snapshot.agentText).toBe("The Requirements Agent asks…");
    // The user's interjection is answered first; the re-offer follows that turn.
    socket.server({ serverContent: { inputTranscription: { text: "hold on" } } });
    socket.server({ serverContent: { outputTranscription: { text: "Sure." }, turnComplete: true } });
    expect(socket.texts().at(-1)).toBe("[UPDATE] (re-offer) Requirements Agent: Should logins use SSO?");

    // Cut off again: not offered a third time.
    socket.server({ serverContent: { outputTranscription: { text: "Again" } } });
    socket.server({ serverContent: { interrupted: true } });
    socket.server({ serverContent: { turnComplete: true } });
    expect(socket.texts()).toHaveLength(2);
    dv.stop();
  });

  test("muted: updates wait, then one [RESUMED] recap with questions and approvals first", async () => {
    const { client } = makeClient();
    const dv = new DeliveryVoice({ projectId: "p1", client, pollMs: 60_000 });
    await dv.start();
    const socket = await setup();
    client.setMuted(true);
    state.messages.code = [msg("code", 1, { text: "Scaffold generated." })];
    state.messages.architecture = [msg("architecture", 1, { text: "Which cloud should we target?" })];
    await dv.tick();
    expect(socket.texts()).toEqual([]);
    client.setMuted(false);
    expect(socket.texts()).toEqual([
      "[RESUMED] Architecture Agent: Which cloud should we target? | Development Agent: Scaffold generated.",
    ]);
    dv.stop();
  });
});

// ---------- safety guard ----------

describe("confirm guard", () => {
  const approve = (socket: FakeSocket, args = { stage: "requirements", revision: 2 }) =>
    socket.server({ toolCall: { functionCalls: [{ id: "a1", name: "approve_revision", args } ] } });
  const decisionPosts = () => state.posts.filter((p) => /revisions|delivery\/cancel/.test(p.path));

  test("no confirm: no API call, the model is told why", async () => {
    state.delivery = approval("requirements", 2);
    const { socket } = await live("requirements");
    socket.server({ serverContent: { inputTranscription: { text: "approve it" } } });
    approve(socket);
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toMatch(/has not said "confirm"/);
    expect(decisionPosts()).toEqual([]);
  });

  test("confirm said but the gate moved on (revision mismatch): no API call", async () => {
    state.delivery = approval("requirements", 3);
    const { socket } = await live("requirements");
    socket.server({ serverContent: { inputTranscription: { text: "Confirm." } } });
    approve(socket);
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toMatch(/not waiting for approval/);
    expect(decisionPosts()).toEqual([]);
  });

  test("confirm + matching gate: approves, and the confirmation is spent", async () => {
    state.delivery = approval("requirements", 2);
    const onAction = jest.fn();
    const { socket } = await live("requirements", fakeAudio(), { onAction });
    socket.server({ serverContent: { inputTranscription: { text: "yes, I confirm" } } });
    approve(socket);
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toBe("Approved requirements revision 2.");
    expect(decisionPosts()).toEqual([{ path: "/projects/p1/artifacts/requirements/revisions/2/approve", body: {} }]);
    expect(onAction).toHaveBeenCalled();

    socket.sent = [];
    approve(socket);
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toMatch(/has not said "confirm"/);
    expect(decisionPosts()).toHaveLength(1);
  });

  test("request changes sends the comment; the Confirm tap counts as confirmation", async () => {
    state.delivery = approval("plan", 1);
    const { client, socket } = await live("plan");
    client.confirm(true);
    expect(socket.texts().at(-1)).toBe("confirm");
    socket.server({ toolCall: { functionCalls: [{ id: "r1", name: "request_changes", args: { stage: "plan", revision: 1, comment: "Two-week sprints" } }] } });
    await until(() => Boolean(socket.tool()));
    expect(decisionPosts()).toEqual([{ path: "/projects/p1/artifacts/plan/revisions/1/request-changes", body: { comment: "Two-week sprints" } }]);
  });

  test("cancel needs confirm; resume and get_status don't", async () => {
    state.delivery = delivery({ status: "RUNNING", message: "Budget Agent is drafting.", last_error: "Rate limited" });
    const { socket } = await live("intake");
    socket.server({ toolCall: { functionCalls: [{ id: "x1", name: "cancel_delivery", args: {} }] } });
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toMatch(/has not said "confirm"/);
    expect(decisionPosts()).toEqual([]);

    socket.sent = [];
    socket.server({ serverContent: { inputTranscription: { text: "confirm" } } });
    socket.server({ toolCall: { functionCalls: [{ id: "x2", name: "cancel_delivery", args: {} }] } });
    await until(() => Boolean(socket.tool()));
    expect(state.posts.some((p) => p.path === "/projects/p1/delivery/cancel")).toBe(true);

    socket.sent = [];
    socket.server({ toolCall: { functionCalls: [{ id: "x3", name: "resume_delivery", args: {} }] } });
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toBe("Resumed. Delivery is running.");

    socket.sent = [];
    socket.server({ toolCall: { functionCalls: [{ id: "x4", name: "get_status", args: {} }] } });
    await until(() => Boolean(socket.tool()));
    expect(socket.tool().response.output).toBe("Budget Agent is drafting. Last error: Rate limited");
  });

  test("anything but confirm/yes after a read-back drops it and its card", async () => {
    state.delivery = approval("requirements", 2);
    const { client, socket } = await live("requirements");
    socket.server({ serverContent: { outputTranscription: { text: 'Approving Requirements revision 2. Say "confirm" to go ahead.' }, turnComplete: true } });
    expect(client.snapshot.confirming).toBe(true);
    socket.server({ serverContent: { inputTranscription: { text: "actually wait" } } });
    socket.server({ serverContent: { outputTranscription: { text: "Okay, waiting." } } });
    expect(client.snapshot).toMatchObject({ confirming: false, notice: "Cancelled approval" });

    socket.server({ serverContent: { outputTranscription: { text: 'Say "confirm" to approve.' }, turnComplete: true } });
    socket.server({ serverContent: { inputTranscription: { text: "yes" } } });
    socket.server({ serverContent: { outputTranscription: { text: "Please say confirm." } } });
    expect(client.snapshot.confirming).toBe(true);
  });
});

// ---------- interruptions ----------

describe("interruptions", () => {
  test("instant barge-in ducks the agent after ~150 ms of loud mic, restores it on a false alarm", async () => {
    const onBargeIn = jest.fn();
    const audio = fakeAudio(5);
    const { socket } = await live("intake", audio, { onBargeIn });
    socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } } });

    // The agent's own voice leaking through the speaker (below 0.06 + 0.6 × its loudness) never triggers it.
    for (let i = 0; i < 5; i++) audio.chunk!(CHUNK, 0.3);
    expect(audio.gains).not.toContain(BARGE.duck);

    audio.chunk!(CHUNK, 0.8);
    expect(onBargeIn).not.toHaveBeenCalled();
    audio.chunk!(CHUNK, 0.8);
    expect(audio.gains.at(-1)).toBe(BARGE.duck);
    expect(onBargeIn).toHaveBeenCalledTimes(1);

    await wait(BARGE.falseAlarmMs + 50);
    expect(audio.gains.at(-1)).toBe(1);
  });

  test("on interrupted: playback flushed, caption ends with …, back to listening", async () => {
    const audio = fakeAudio(5);
    const { client, socket } = await live("intake", audio);
    socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] }, outputTranscription: { text: "The budget is" } } });
    audio.chunk!(CHUNK, 0.9);
    audio.chunk!(CHUNK, 0.9);
    socket.server({ serverContent: { interrupted: true } });
    expect(audio.flush).toHaveBeenCalled();
    expect(audio.gains.at(-1)).toBe(1);
    expect(client.snapshot).toMatchObject({ state: "listening", agentText: "The budget is…" });
  });

  test("saying stop while send_to_agent is pending cancels the run and answers the tool", async () => {
    const { socket } = await live("architecture");
    socket.server({ toolCall: { functionCalls: [{ id: "c1", name: "send_to_agent", args: { text: "redo the diagram" } }] } });
    await until(() => state.messages.architecture?.length === 1);
    socket.server({ serverContent: { inputTranscription: { text: "no, stop" } } });
    await until(() => Boolean(socket.tool()));
    expect(socket.tool()).toEqual({ id: "c1", name: "send_to_agent", response: { output: "Cancelled by the user." } });
    expect(state.posts.some((p) => p.path === "/projects/p1/runs/run-1/cancel")).toBe(true);
  });

  test("tapping the orb silences the rest of the turn without ending the session", async () => {
    const audio = fakeAudio(5);
    const { client, socket } = await live("intake", audio);
    socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } } });
    client.stopSpeaking();
    socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "BBBB" } }] } } });
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(client.snapshot.state).toBe("listening");
    socket.server({ serverContent: { turnComplete: true } });
    socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "CCCC" } }] } } });
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(socket.closed).toBe(false);
  });

  test("phone call pauses and resumes the same session; headphones unplugged pauses", async () => {
    const resumed = jest.fn();
    const audio = fakeAudio();
    const { client, socket } = await live("intake", audio);
    client.onResume = resumed;
    audio.system!("interrupted");
    expect(client.snapshot.state).toBe("paused");
    expect(audio.stopMic).toHaveBeenCalled();
    audio.system!("resumable");
    await until(() => resumed.mock.calls.length === 1);
    expect(client.snapshot.state).toBe("listening");
    expect(socket.closed).toBe(false);
    expect(state.sessions).toHaveLength(1);
    expect(resumed).toHaveBeenCalledTimes(1);

    audio.system!("unplugged");
    expect(client.snapshot).toMatchObject({ state: "paused", pausedReason: "Headphones disconnected" });
  });

  test("a session dropped while paused reconnects on return, then recaps", async () => {
    const resumed = jest.fn();
    const { client, socket } = await live("intake");
    client.onResume = resumed;
    client.pause("Paused while Ampera is in the background");
    socket.onclose?.({ code: 1000 });
    expect(client.snapshot.state).toBe("paused");
    void client.resume();
    await setup();
    expect(state.sessions).toEqual(["intake", "intake"]);
    expect(client.snapshot.state).toBe("listening");
    expect(resumed).toHaveBeenCalledTimes(1);
  });
});

describe("confirm detection", () => {
  it("accepts a plain confirm and rejects negations", () => {
    const { saidConfirm } = jest.requireActual("../live-client") as typeof import("../live-client");
    expect(saidConfirm("Confirm")).toBe(true);
    expect(saidConfirm("yes, I confirm")).toBe(true);
    expect(saidConfirm("don't confirm")).toBe(false);
    expect(saidConfirm("do not confirm that")).toBe(false);
    expect(saidConfirm("no, don't confirm it")).toBe(false);
    expect(saidConfirm("approve it")).toBe(false);
  });
});
