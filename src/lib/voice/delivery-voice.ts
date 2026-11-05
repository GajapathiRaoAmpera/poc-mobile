/**
 * Runs the whole delivery by voice: one live session at a time, voiced by whichever agent the
 * delivery is on. Polls the delivery and all six threads, hands the session over when the active
 * agent changes, and narrates other agents' news as "[UPDATE]" text turns.
 */
import { apiFetch } from "@/api/client";
import { AGENT } from "@/features/chat/agents";
import { cleanMessage } from "@/lib/format";
import type { Channel, Message } from "@/schemas/conversation";
import type { Delivery } from "@/schemas/delivery";
import { AGENT_LABEL } from "@/schemas/workflow";
import type { LiveClient } from "./live-client";

export const VOICE_CHANNELS: Channel[] = ["intake", "requirements", "architecture", "plan", "budget", "code"];

/** Which agent should be talking: the stage the delivery waits on, the newest working stage, else the Orchestrator. */
export function activeChannel(d: Delivery | null | undefined, newest?: Channel | null): Channel {
  const stage = d?.pending?.stage ?? d?.pending?.payload?.stage;
  if (stage && VOICE_CHANNELS.includes(stage as Channel)) return stage as Channel;
  if (d?.status === "RUNNING" && newest) return newest;
  return "intake";
}

/** Questions and approval requests matter most: they're re-offered if cut off and come first in a recap. */
const IMPORTANT = /\?|approv|review|confirm|decide|answer/i;
const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n).replace(/\s\S*$/, "")}…` : s);

type Client = Pick<
  LiveClient,
  "channel" | "busy" | "held" | "isAsking" | "isOwn" | "setChannel" | "start" | "stop" | "switchChannel" | "sendText" | "onIdle" | "onTextCut" | "onResume"
>;

export interface DeliveryVoiceOptions {
  projectId: string;
  client: Client;
  onDelivery?: (d: Delivery) => void;
  pollMs?: number;
}

interface Update {
  label: string;
  text: string;
  important: boolean;
}

export class DeliveryVoice {
  private lastSeq: Partial<Record<Channel, number>> = {};
  private lastNarrated: Partial<Record<Channel, string>> = {};
  private newest: { channel: Channel; at: string } | null = null;
  private queue: Update[] = [];
  private reoffered = new Set<string>();
  private want: Channel;
  private delivery: Delivery | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private stopped = false;

  constructor(private opts: DeliveryVoiceOptions) {
    this.want = opts.client.channel;
    const c = opts.client;
    c.onIdle = () => this.act();
    c.onTextCut = (text) => this.reoffer(text);
    c.onResume = () => this.recap();
  }

  async start() {
    this.stopped = false;
    // Baseline: history isn't narrated, only what happens from now on.
    await Promise.all([this.fetchDelivery(), ...VOICE_CHANNELS.map((ch) => this.fetchMessages(ch, true))]);
    if (this.stopped) return;
    this.want = activeChannel(this.delivery, this.newest?.channel);
    this.opts.client.setChannel(this.want);
    void this.opts.client.start();
    this.timer = setInterval(() => void this.tick(), this.opts.pollMs ?? 3000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.opts.client.stop();
  }

  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      const fresh: Message[] = [];
      await Promise.all([
        this.fetchDelivery(),
        ...VOICE_CHANNELS.map(async (ch) => fresh.push(...(await this.fetchMessages(ch, false)))),
      ]);
      this.narrate(fresh);
      this.want = activeChannel(this.delivery, this.newest?.channel);
      this.act();
    } finally {
      this.ticking = false;
    }
  }

  /** Hand over or send queued news, but never over the agent's voice or a running tool. */
  act() {
    const c = this.opts.client;
    if (this.stopped || c.busy || c.held) return;
    if (this.want !== c.channel) {
      const from = AGENT[c.channel].name;
      const latest = this.queue.length ? this.queue.map((u) => `${u.label}: ${u.text}`).join(" ") : cleanMessage(this.delivery?.message ?? "");
      this.queue = [];
      void c.switchChannel(this.want, `[HANDOFF] Previous agent: ${from}.${latest ? ` Latest update: ${latest}` : ""}`);
      return;
    }
    if (!this.queue.length) return;
    c.sendText(this.queue.map((u) => `[UPDATE] ${u.label}: ${u.text}`).join("\n"));
    this.queue = [];
  }

  /** Back from mute or a pause: one recap, questions and approvals first, instead of every update. */
  private recap() {
    const c = this.opts.client;
    if (this.want !== c.channel) return this.act();
    if (!this.queue.length) return;
    const items = [...this.queue.filter((u) => u.important), ...this.queue.filter((u) => !u.important)];
    this.queue = [];
    c.sendText(`[RESUMED] ${items.map((u) => `${u.label}: ${u.text}`).join(" | ")}`);
  }

  /** An update with a question or approval request was cut off: offer it again once, after the user's turn. */
  private reoffer(sent: string) {
    for (const line of sent.split("\n")) {
      const m = /^\[UPDATE\] (?!\(re-offer\))([^:]+): (.*)$/s.exec(line);
      if (!m || !IMPORTANT.test(m[2]) || this.reoffered.has(line)) continue;
      this.reoffered.add(line);
      this.queue.push({ label: `(re-offer) ${m[1]}`, text: short(m[2]), important: true });
    }
  }

  private narrate(msgs: Message[]) {
    const c = this.opts.client;
    // Progress notices repeat ("Drafting…", "Validating…"): only the latest per agent is worth saying.
    const lastProgress = new Map<Channel, Message>();
    for (const m of msgs) if (m.role === "system" && m.refs?.progress) lastProgress.set(m.channel, m);
    for (const m of msgs.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (m.role === "user" || c.isOwn(m.channel, m.seq)) continue;
      if (m.refs?.progress && lastProgress.get(m.channel) !== m) continue;
      const text = cleanMessage(m.text);
      if (!text || this.lastNarrated[m.channel] === text) continue;
      this.lastNarrated[m.channel] = text;
      const label = (m.agent && AGENT_LABEL[m.agent]) || AGENT[m.channel].name;
      this.queue.push({ label, text, important: IMPORTANT.test(text) });
    }
  }

  private async fetchDelivery() {
    try {
      this.delivery = await apiFetch<Delivery>(`/projects/${this.opts.projectId}/delivery`);
      this.opts.onDelivery?.(this.delivery);
    } catch {
      // Keep the last known state; the next poll retries.
    }
  }

  private async fetchMessages(ch: Channel, baseline: boolean): Promise<Message[]> {
    // Its reply goes back as the tool result; reading it here too would say it twice.
    const after = this.lastSeq[ch];
    // A failed baseline is retried as a baseline, so old history is never read out.
    if (after === undefined) baseline = true;
    else if (this.opts.client.isAsking(ch)) return [];
    const path = `/projects/${this.opts.projectId}/conversations/${ch}/messages${after === undefined ? "" : `?after=${after}`}`;
    let msgs: Message[];
    try {
      msgs = await apiFetch<Message[]>(path);
    } catch {
      return [];
    }
    for (const m of msgs) {
      if (m.seq > (this.lastSeq[ch] ?? -1)) this.lastSeq[ch] = m.seq;
      if (m.role !== "user" && (!this.newest || m.created_at > this.newest.at)) this.newest = { channel: ch, at: m.created_at };
    }
    this.lastSeq[ch] ??= 0;
    return baseline ? [] : msgs.filter((m) => m.seq > (after ?? -1));
  }
}
