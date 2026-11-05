/**
 * Voice front-end for the delivery. Gemini Live only hears and speaks; every request goes to the
 * project's agents through the conversations API via the `send_to_agent` tool, and the agent's
 * reply goes back to Gemini as the tool result to be read out. Delivery tools (status, approve,
 * request changes, resume, cancel) run here too, behind a spoken-"confirm" guard.
 */
import { ApiError, apiFetch, errorMessage } from "@/api/client";
import { cleanMessage } from "@/lib/format";
import type { Channel, Message, SendOut } from "@/schemas/conversation";
import type { Delivery } from "@/schemas/delivery";

// Same endpoint and auth as @google/genai (src/live.ts) for auth_tokens/ keys: the Constrained method,
// token in the access_token query param, v1alpha (the SDK's supported version for ephemeral tokens,
// and what poc-frontend uses). Google's ephemeral-token page says v1beta; if v1alpha is refused, change it here.
const LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
const MIC_MIME = "audio/pcm;rate=16000";
const MIC_RATE = 16_000;

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "paused" | "error" | "ended";
export type VoiceErrorKind = "mic" | "network" | "unavailable" | "quota" | "session";

export interface VoiceSnapshot {
  state: VoiceState;
  muted: boolean;
  /** What the user said this turn, then what was said back. */
  userText: string;
  agentText: string;
  error: { kind: VoiceErrorKind; message: string } | null;
  /** The agent whose voice is live (changes on handoff). */
  channel: Channel;
  /** Reconnecting with the next agent's voice. */
  switching: boolean;
  /** The agent just read an action back and asked the user to say "confirm". */
  confirming: boolean;
  /** Short-lived feedback line, e.g. "Cancelled approval". */
  notice: string | null;
  /** Why the session is paused (phone call, headphones, app in background). */
  pausedReason: string | null;
}

export interface SocketLike {
  send(data: string): void;
  close(): void;
  binaryType?: string;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code?: number; reason?: string }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export type SystemAudioEvent = "interrupted" | "resumable" | "unplugged";

export interface AudioIO {
  requestPermission(): Promise<boolean>;
  /** Streams 16 kHz mono PCM16 as base64 with a 0..1 loudness for each chunk. */
  startMic(onChunk: (base64: string, level: number) => void): Promise<void>;
  stopMic(): void;
  /** Queues 24 kHz mono PCM16 (base64); returns its length and loudness. */
  play(base64: string): { seconds: number; level: number };
  /** Drops everything queued (barge-in). */
  flush(): void;
  /** Playback volume 0..1 (ducking while the user may be interrupting). */
  setGain?(gain: number): void;
  /** Phone calls, Siri, audio focus loss, headphones unplugged. Returns an unsubscribe. */
  watchSystem?(cb: (e: SystemAudioEvent) => void): () => void;
  close(): void;
}

export interface LiveClientOptions {
  projectId: string;
  channel: Channel;
  audio: AudioIO;
  onChange: (s: VoiceSnapshot) => void;
  /** New user or agent messages exist: refetch the thread. */
  onMessages?: () => void;
  /** A delivery action ran (approve, request changes, resume, cancel): refetch delivery state. */
  onAction?: () => void;
  /** Local barge-in detected: the agent was ducked (light haptic). */
  onBargeIn?: () => void;
  createSocket?: (url: string) => SocketLike;
  pollMs?: number;
  replyTimeoutMs?: number;
}

interface FunctionCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
}

const INITIAL: VoiceSnapshot = {
  state: "idle",
  muted: false,
  userText: "",
  agentText: "",
  error: null,
  channel: "intake",
  switching: false,
  confirming: false,
  notice: null,
  pausedReason: null,
};

const CONFIRM = /\bconfirm\b/i;
// "don't confirm", "do not confirm", "no, don't confirm it" must never approve anything.
const NEGATED = /\b(?:don'?t|do not|not|never|no)\b\W+(?:\w+\W+){0,2}confirm\b/i;
export const saidConfirm = (text: string) => CONFIRM.test(text) && !NEGATED.test(text);
const AGREE = /\b(confirm|yes)\b/i;
const STOP = /\b(stop|cancel|never ?mind)\b/i;
const NOT_CONFIRMED =
  'Not done: the user has not said "confirm" since you read the action back. Read it back and ask them to say "confirm".';

/** Barge-in tuning: loud for this long while the agent talks ducks it; no `interrupted` by then restores it. */
export const BARGE = { floor: 0.06, echo: 0.6, holdMs: 150, duck: 0.15, falseAlarmMs: 600, bufferMs: 3000 } as const;

export class LiveClient {
  /** Read every frame by the orb; kept out of React state on purpose. */
  readonly levels = { mic: 0, out: 0 };
  private snap: VoiceSnapshot = INITIAL;
  private socket: SocketLike | null = null;
  private ready = false;
  private stopped = false;
  private micOn = false;
  private pending = 0;
  private playingUntil = 0;
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSpeaker: "user" | "agent" | null = null;
  private modelTurn = false;
  /** Tapped Stop: drop the rest of this model turn's audio. */
  private discardTurn = false;
  /** Text to send as soon as the next session is set up (handoff greeting, early updates). */
  private queuedText: string[] = [];
  /** The text turn the model is answering right now, so a cut-off update can be re-offered. */
  private answering: string | null = null;
  /** Mic audio said while the next agent's session connects, flushed in order once it is up. */
  private micBuffer: string[] = [];
  private micBufferMs = 0;
  /** What the user said or typed since their last fresh turn; the "confirm" guard reads it. */
  private heard = "";
  private tapConfirmed = false;
  private asking = new Set<Channel>();
  private own = new Set<string>();
  private ask: { runId?: string; cancelled: boolean } | null = null;
  private loudMs = 0;
  private ducked: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private expiresAt = 0;
  private needsReconnect = false;
  private resumeAfterSetup = false;
  private unwatch: (() => void) | null = null;
  /** Called when the model finishes a turn with no tool pending: a good moment to send news. */
  onIdle: (() => void) | null = null;
  /** A text turn (an [UPDATE]) was cut off before the user heard it all. */
  onTextCut: ((text: string) => void) | null = null;
  /** Unmuted or back from a pause: time to send what was missed. */
  onResume: (() => void) | null = null;

  constructor(private opts: LiveClientOptions) {
    this.snap = { ...INITIAL, channel: opts.channel };
  }

  get snapshot() {
    return this.snap;
  }

  get channel() {
    return this.snap.channel;
  }

  /** Model talking, audio still playing, or a tool in flight: hold handoffs and narration. */
  get busy() {
    return this.modelTurn || this.pending > 0 || Date.now() < this.playingUntil;
  }

  /** Muted or paused: the user isn't listening live, so news waits for a single recap. */
  get held() {
    return this.snap.muted || this.snap.state === "paused";
  }

  /** Picks the first agent before start(); use switchChannel() once live. */
  setChannel(channel: Channel) {
    this.set({ channel });
  }

  /** True while a send_to_agent on this channel waits for its reply (its reply must not be narrated). */
  isAsking(channel: Channel) {
    return this.asking.has(channel);
  }

  /** A message this client posted, or a reply it already read out. */
  isOwn(channel: Channel, seq: number) {
    return this.own.has(`${channel}:${seq}`);
  }

  async start() {
    this.stopped = false;
    this.ready = false;
    this.pending = 0;
    this.lastSpeaker = null;
    this.set({ ...INITIAL, channel: this.snap.channel, state: "connecting" });
    this.unwatch?.();
    this.unwatch = this.opts.audio.watchSystem?.((e) => this.onSystem(e)) ?? null;

    let granted = false;
    try {
      granted = await this.opts.audio.requestPermission();
    } catch {
      granted = false;
    }
    if (!granted) return this.fail("mic", "Ampera needs your microphone to hear you. Turn it on in Settings, then try again.");
    await this.connect();
  }

  /** Hands the conversation to another agent: new token (new voice), then `intro` as its first turn. */
  async switchChannel(channel: Channel, intro: string) {
    if (this.stopped) return;
    const old = this.socket;
    this.socket = null;
    this.ready = false;
    old?.close();
    // The mic stays on: what the user says during the reconnect is buffered and sent to the new agent.
    this.flushPlayback();
    this.modelTurn = false;
    this.answering = null;
    this.lastSpeaker = null;
    this.queuedText = [intro];
    this.micBuffer = [];
    this.micBufferMs = 0;
    this.set({ channel, switching: true, confirming: false, state: "connecting" });
    await this.connect();
  }

  /** A text turn for the model (workflow news, handoffs, typed input). Queued until the session is ready. */
  sendText(text: string) {
    if (!this.ready) {
      this.queuedText.push(text);
      return;
    }
    this.answering = text;
    this.send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } });
  }

  /** The user typed instead of speaking: it counts as their own words, including "confirm". */
  type(text: string) {
    this.endUserTurn(text);
    this.heard = text;
    this.lastSpeaker = null;
    this.set({ userText: text, agentText: "" });
    this.sendText(text);
  }

  /** Tapped Confirm or Cancel on the confirm card: the same flag a spoken "confirm" sets. */
  confirm(yes: boolean) {
    this.tapConfirmed = yes;
    if (!yes) {
      this.heard = "";
      this.set({ confirming: false });
      this.notify("Cancelled approval");
    }
    this.sendText(yes ? "confirm" : "cancel");
  }

  /** Tapped the orb while the agent talks: silence it now, keep the session. */
  stopSpeaking() {
    if (!this.modelTurn && Date.now() >= this.playingUntil) return;
    this.discardTurn = this.modelTurn;
    this.cutOff();
  }

  /** Ends the session; captions stay so the last exchange is still readable. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.teardown();
    if (this.snap.state !== "error") this.set({ state: "ended", pausedReason: null });
  }

  dispose() {
    this.stop();
    this.unwatch?.();
    this.unwatch = null;
    this.opts.audio.close();
  }

  setMuted(muted: boolean) {
    if (muted === this.snap.muted) return;
    // Closing the audio stream tells the server's voice detection the user's turn is over.
    if (muted && this.ready) this.send({ realtimeInput: { audioStreamEnd: true } });
    this.levels.mic = 0;
    this.set({ muted });
    if (!muted && this.ready) this.onResume?.();
  }

  /** Phone call, Siri, background: release mic and speaker but keep the session for a quick return. */
  pause(reason: string) {
    if (this.stopped || this.snap.state === "paused" || this.snap.state === "idle") return;
    this.opts.audio.stopMic();
    this.micOn = false;
    this.flushPlayback();
    if (this.modelTurn) this.discardTurn = true;
    this.set({ state: "paused", pausedReason: reason });
  }

  async resume() {
    if (this.stopped || this.snap.state !== "paused") return;
    this.set({ pausedReason: null });
    // Session dropped or token window over while away: reconnect with a fresh token, recap after setup.
    if (this.needsReconnect || !this.socket || Date.now() > this.expiresAt) {
      this.needsReconnect = false;
      const old = this.socket;
      this.socket = null;
      this.ready = false;
      old?.close();
      this.set({ state: "connecting" });
      this.resumeAfterSetup = true;
      return this.connect();
    }
    this.set({ state: "listening" });
    await this.ensureMic();
    this.refresh();
    this.onResume?.();
  }


  private onSystem(e: SystemAudioEvent) {
    if (e === "interrupted") this.pause("Paused for another app's audio");
    else if (e === "unplugged") this.pause("Headphones disconnected");
    else if (this.snap.pausedReason === "Paused for another app's audio") void this.resume();
  }

  private async connect() {
    let session: { token: string; model: string; expires_at?: string };
    try {
      session = await apiFetch(`/projects/${this.opts.projectId}/voice/session`, {
        method: "POST",
        json: { channel: this.snap.channel },
      });
    } catch (err) {
      return this.fail(sessionErrorKind(err), errorMessage(err));
    }
    if (this.stopped) return;
    const exp = session.expires_at ? Date.parse(session.expires_at) : NaN;
    this.expiresAt = Number.isNaN(exp) ? Date.now() + 25 * 60_000 : exp;

    const socket = (this.opts.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(
      `${LIVE_URL}?access_token=${encodeURIComponent(session.token)}`,
    );
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.onopen = () =>
      this.send({
        // The token pins model, system prompt, tools and audio config server-side; these must agree with it.
        setup: {
          model: session.model.startsWith("models/") ? session.model : `models/${session.model}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });
    socket.onmessage = (e) => void this.onMessage(e.data);
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped) return;
      if (this.snap.state === "paused") {
        this.needsReconnect = true;
        return;
      }
      if (!this.ready) return this.fail("session", "Couldn't start the voice session. Check your connection and try again.");
      this.stop();
    };
  }

  private teardown() {
    this.ready = false;
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.opts.audio.stopMic();
    this.micOn = false;
    this.flushPlayback();
    this.modelTurn = false;
    this.queuedText = [];
    this.micBuffer = [];
    if (this.ask) this.ask.cancelled = true;
  }

  private fail(kind: VoiceErrorKind, message: string) {
    this.stopped = true;
    this.teardown();
    this.set({ state: "error", switching: false, error: { kind, message } });
  }

  private send(msg: unknown) {
    this.socket?.send(JSON.stringify(msg));
  }

  private set(patch: Partial<VoiceSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.opts.onChange(this.snap);
  }

  private notify(notice: string) {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.set({ notice });
    this.noticeTimer = setTimeout(() => this.set({ notice: null }), 3000);
  }

  /** Live states follow what is actually happening: audio out beats agent work beats listening. */
  private refresh() {
    if (!this.ready || this.stopped || this.snap.state === "paused") return;
    const state = Date.now() < this.playingUntil ? "speaking" : this.pending > 0 ? "thinking" : "listening";
    if (state !== this.snap.state) this.set({ state });
  }

  private flushPlayback() {
    this.opts.audio.flush();
    this.opts.audio.setGain?.(1);
    if (this.ducked) clearTimeout(this.ducked);
    this.ducked = null;
    this.loudMs = 0;
    this.playingUntil = 0;
    this.levels.out = 0;
    if (this.playTimer) clearTimeout(this.playTimer);
    this.playTimer = null;
  }

  /** The agent was cut off (by the user or a tap): stop audio, mark the caption, re-offer a cut update. */
  private cutOff() {
    this.flushPlayback();
    this.modelTurn = false;
    if (this.snap.agentText && !this.snap.agentText.endsWith("…")) this.set({ agentText: `${this.snap.agentText.trimEnd()}…` });
    this.lastSpeaker = null;
    const cut = this.answering;
    this.answering = null;
    if (cut) this.onTextCut?.(cut);
    this.refresh();
  }

  private async ensureMic() {
    if (this.micOn) return;
    this.micOn = true;
    try {
      await this.opts.audio.startMic((b64, lvl) => this.onMic(b64, lvl));
    } catch {
      this.micOn = false;
      this.fail("mic", "The microphone couldn't start. Close other apps using it, then try again.");
    }
  }

  private onMic(b64: string, lvl: number) {
    if (this.snap.muted || this.snap.state === "paused") return;
    const ms = ((b64.length * 3) / 4 / 2 / MIC_RATE) * 1000;
    if (!this.ready) {
      // Handoff reconnect: keep the newest ~3 s so the user can keep talking.
      if (!this.snap.switching) return;
      this.micBuffer.push(b64);
      this.micBufferMs += ms;
      while (this.micBufferMs > BARGE.bufferMs && this.micBuffer.length > 1) {
        const dropped = this.micBuffer.shift()!;
        this.micBufferMs -= ((dropped.length * 3) / 4 / 2 / MIC_RATE) * 1000;
      }
      return;
    }
    this.levels.mic = lvl;
    this.send({ realtimeInput: { audio: { data: b64, mimeType: MIC_MIME } } });
    this.detectBargeIn(lvl, ms);
  }

  /** Duck the agent the moment the user starts talking over it; Gemini's `interrupted` confirms it. */
  private detectBargeIn(lvl: number, ms: number) {
    const speaking = Date.now() < this.playingUntil;
    // Echo cancellation removes most of the agent's own voice; scaling by its loudness covers the rest.
    const threshold = BARGE.floor + BARGE.echo * this.levels.out;
    if (!speaking || lvl <= threshold) {
      this.loudMs = 0;
      return;
    }
    this.loudMs += ms;
    if (this.loudMs < BARGE.holdMs || this.ducked) return;
    this.opts.audio.setGain?.(BARGE.duck);
    this.opts.onBargeIn?.();
    this.ducked = setTimeout(() => {
      // No `interrupted` came: a cough or a door, so bring the agent back.
      this.ducked = null;
      this.loudMs = 0;
      this.opts.audio.setGain?.(1);
    }, BARGE.falseAlarmMs);
  }

  private async onMessage(raw: unknown) {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(toText(raw));
    } catch {
      return;
    }
    if (msg.setupComplete && !this.ready) {
      this.ready = true;
      await this.ensureMic();
      if (!this.ready) return;
      const resumed = this.resumeAfterSetup;
      this.resumeAfterSetup = false;
      if (this.snap.switching) this.set({ switching: false });
      const queued = this.queuedText.splice(0);
      if (queued.length) this.sendText(queued.join("\n"));
      for (const b64 of this.micBuffer.splice(0)) this.send({ realtimeInput: { audio: { data: b64, mimeType: MIC_MIME } } });
      this.micBufferMs = 0;
      this.refresh();
      if (resumed) this.onResume?.();
    }
    const content = msg.serverContent;
    if (content) {
      if (content.interrupted) this.cutOff();
      if (!this.discardTurn) {
        for (const part of content.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) this.play(part.inlineData.data);
        }
        if (content.modelTurn || content.outputTranscription) this.modelTurn = true;
      }
      if (content.inputTranscription?.text) this.caption("user", content.inputTranscription.text);
      if (content.outputTranscription?.text && !this.discardTurn) this.caption("agent", content.outputTranscription.text);
      if (content.turnComplete) {
        this.modelTurn = false;
        this.discardTurn = false;
        this.answering = null;
      }
      this.refresh();
      if ((content.turnComplete || content.interrupted) && this.pending === 0) this.onIdle?.();
    }
    const calls = msg.toolCall?.functionCalls ?? [];
    if (calls.length) this.endUserTurn(this.heard);
    for (const call of calls) void this.runTool(call);
  }

  private caption(who: "user" | "agent", text: string) {
    if (who === "user") {
      // A new user turn clears the previous exchange.
      const fresh = this.lastSpeaker !== "user";
      this.heard = fresh ? text : this.heard + text;
      this.set(fresh ? { userText: text.trimStart(), agentText: "" } : { userText: this.snap.userText + text });
      if (this.ask && STOP.test(this.heard)) void this.cancelAsk();
    } else {
      if (this.lastSpeaker === "user") this.endUserTurn(this.heard);
      const fresh = this.lastSpeaker !== "agent";
      const agentText = fresh ? text.trimStart() : this.snap.agentText + text;
      // The confirm card follows the agent's latest turn: shown while it asks, gone once it moves on.
      this.set({ agentText, confirming: CONFIRM.test(agentText) });
    }
    this.lastSpeaker = who;
  }

  /** The user finished an utterance: anything but confirm/yes drops a pending read-back. */
  private endUserTurn(said: string) {
    if (!this.snap.confirming || AGREE.test(said)) return;
    this.tapConfirmed = false;
    this.heard = "";
    this.set({ confirming: false });
    this.notify("Cancelled approval");
  }

  private play(b64: string) {
    const { seconds, level } = this.opts.audio.play(b64);
    this.playingUntil = Math.max(this.playingUntil, Date.now()) + seconds * 1000;
    this.levels.out = level;
    if (this.playTimer) clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => {
      this.levels.out = 0;
      this.refresh();
    }, this.playingUntil - Date.now() + 20);
  }

  private async runTool(call: FunctionCall) {
    this.pending++;
    this.refresh();
    const output = await this.tool(call.name, call.args ?? {});
    this.pending--;
    if (this.ready && !this.stopped) {
      this.send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { output } }] } });
    }
    this.refresh();
    if (this.pending === 0 && !this.modelTurn) this.onIdle?.();
  }

  private async tool(name: string, args: Record<string, unknown>): Promise<string> {
    const pid = this.opts.projectId;
    const str = (k: string) => String(args[k] ?? "").trim();
    try {
      switch (name) {
        case "send_to_agent":
          return await this.askAgent(str("text"));
        case "get_status": {
          const d = await apiFetch<Delivery>(`/projects/${pid}/delivery`);
          return cleanMessage(d.message) + (d.last_error ? ` Last error: ${cleanMessage(d.last_error)}` : "");
        }
        case "resume_delivery": {
          const d = await apiFetch<Delivery>(`/projects/${pid}/delivery/resume`, { method: "POST" });
          this.opts.onAction?.();
          return `Resumed. ${cleanMessage(d.message)}`;
        }
        case "cancel_delivery": {
          if (!this.takeConfirmation()) return NOT_CONFIRMED;
          const d = await apiFetch<Delivery>(`/projects/${pid}/delivery/cancel`, { method: "POST" });
          this.opts.onAction?.();
          return `Cancelled. ${cleanMessage(d.message)}`;
        }
        case "approve_revision":
        case "request_changes": {
          if (!this.takeConfirmation()) return NOT_CONFIRMED;
          const stage = str("stage").toLowerCase();
          const revision = Number(args.revision);
          // Re-read the gate right now: the revision read back may have been superseded while the user spoke.
          const d = await apiFetch<Delivery>(`/projects/${pid}/delivery`);
          const p = d.pending;
          const gateStage = p?.stage ?? p?.payload?.stage;
          if (p?.kind !== "approval" || gateStage !== stage || p.payload?.revision !== revision) {
            return `Not done: ${stage} revision ${String(args.revision)} is not waiting for approval. Current state: ${cleanMessage(d.message)}`;
          }
          const approve = name === "approve_revision";
          const comment = str("comment");
          if (!approve && !comment) return "Not done: ask the user what should change, then read it back.";
          await apiFetch(`/projects/${pid}/artifacts/${stage}/revisions/${revision}/${approve ? "approve" : "request-changes"}`, {
            method: "POST",
            json: approve ? {} : { comment },
          });
          this.opts.onAction?.();
          return approve ? `Approved ${stage} revision ${revision}.` : `Sent the change request for ${stage} revision ${revision}.`;
        }
        default:
          return `Unknown tool ${name}.`;
      }
    } catch (err) {
      return errorMessage(err);
    }
  }

  /** One confirmation buys one action: spoken/typed "confirm" or the Confirm tap, then both reset. */
  private takeConfirmation() {
    const ok = this.tapConfirmed || saidConfirm(this.heard);
    if (ok) {
      this.tapConfirmed = false;
      this.heard = "";
      this.set({ confirming: false });
    }
    return ok;
  }

  /** The user said stop while their request was with an agent: cancel its run. */
  private async cancelAsk() {
    const ask = this.ask;
    if (!ask || ask.cancelled) return;
    ask.cancelled = true;
    if (ask.runId) await this.cancelRun(ask.runId);
  }

  private async cancelRun(runId: string) {
    try {
      await apiFetch(`/projects/${this.opts.projectId}/runs/${runId}/cancel`, { method: "POST" });
      this.opts.onMessages?.();
    } catch {
      // The run may already be done; the user still hears it was cancelled.
    }
  }

  /** Posts to the channel and waits for the agent's reply; any failure becomes words to read out. */
  private async askAgent(text: string): Promise<string> {
    if (!text) return "Nothing was passed on: the request was empty.";
    const channel = this.snap.channel;
    const ask = { cancelled: false } as { runId?: string; cancelled: boolean };
    this.ask = ask;
    this.asking.add(channel);
    try {
      return await this.askOn(channel, text, ask);
    } finally {
      this.asking.delete(channel);
      if (this.ask === ask) this.ask = null;
    }
  }

  private async askOn(channel: Channel, text: string, ask: { runId?: string; cancelled: boolean }): Promise<string> {
    const path = `/projects/${this.opts.projectId}/conversations/${channel}/messages`;
    let seq: number;
    try {
      const sent = await apiFetch<SendOut>(path, { method: "POST", json: { text } });
      seq = sent.message.seq;
      ask.runId = sent.run?.id;
    } catch (err) {
      return errorMessage(err);
    }
    this.own.add(`${channel}:${seq}`);
    this.opts.onMessages?.();
    // "Stop" said before the post came back: cancel now that the run id is known.
    if (ask.cancelled) {
      if (ask.runId) await this.cancelRun(ask.runId);
      return "Cancelled by the user.";
    }

    const deadline = Date.now() + (this.opts.replyTimeoutMs ?? 180_000);
    while (!this.stopped && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.opts.pollMs ?? 1500));
      if (ask.cancelled) return "Cancelled by the user.";
      try {
        const replies = (await apiFetch<Message[]>(`${path}?after=${seq}`)).filter(
          (m) => m.seq > seq && m.role !== "user" && !(m.role === "system" && m.refs?.progress),
        );
        if (ask.cancelled) return "Cancelled by the user.";
        if (replies.length) {
          for (const m of replies) this.own.add(`${channel}:${m.seq}`);
          this.opts.onMessages?.();
          return replies.map((m) => cleanMessage(m.text)).join("\n\n");
        }
      } catch {
        // Transient poll failure: keep waiting until the deadline.
      }
    }
    return "The agent is still working on this. Its reply will appear in the chat.";
  }
}

interface ServerMessage {
  setupComplete?: object;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
  toolCall?: { functionCalls?: FunctionCall[] };
}

function sessionErrorKind(err: unknown): VoiceErrorKind {
  if (!(err instanceof ApiError)) return "session";
  if (err.status === 0) return "network";
  if (err.status === 429) return "quota";
  if (err.status === 502 || err.status === 503 || err.code === "VOICE_UNAVAILABLE") return "unavailable";
  return "session";
}

/** Gemini sends JSON in binary frames; RN delivers those as ArrayBuffer. */
function toText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const bytes = new Uint8Array(raw as ArrayBuffer);
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(bin));
}

export { INITIAL as IDLE_SNAPSHOT };
