/** Native mic capture + PCM playback with react-native-audio-api (needs a development build, not Expo Go). */
import { AudioContext, AudioManager, AudioRecorder, type AudioBufferQueueSourceNode, type GainNode } from "react-native-audio-api";
import type { AudioIO } from "./live-client";
import { floatToPcm16Base64, level, pcm16Base64ToFloat, resample } from "./pcm";

const MIC_RATE = 16_000;
const OUT_RATE = 24_000;

export function createAudio(): AudioIO {
  let ctx: AudioContext | null = null;
  let queue: AudioBufferQueueSourceNode | null = null;
  let recorder: AudioRecorder | null = null;
  let gain: GainNode | null = null;

  const output = () => {
    ctx ??= new AudioContext();
    if (!gain) {
      // Every queue plays through one gain node, so barge-in can duck the agent instantly.
      gain = ctx.createGain();
      gain.connect(ctx.destination);
    }
    if (!queue) {
      queue = ctx.createBufferQueueSource();
      queue.connect(gain);
      queue.start();
    }
    return { ctx, queue };
  };

  return {
    async requestPermission() {
      return (await AudioManager.requestRecordingPermissions()) === "Granted";
    },

    async startMic(onChunk) {
      // Voice-chat session: echo cancellation on, loudspeaker by default, so barge-in hears the user and not the agent.
      AudioManager.setSystemOptions({
        ios: { category: "playAndRecord", mode: "voiceChat", options: ["defaultToSpeaker", "allowBluetoothHFP"] },
      });
      await AudioManager.setAudioSessionActivity(true);
      // Phone calls, Siri and other apps taking audio focus arrive as `interruption` events.
      AudioManager.observeAudioInterruptions(true);
      recorder = new AudioRecorder({ androidInputPreset: "voiceCommunication", iosVoiceProcessing: true });
      recorder.onAudioReady({ sampleRate: MIC_RATE, bufferLength: MIC_RATE / 10, channelCount: 1 }, ({ buffer }) => {
        const samples = resample(buffer.getChannelData(0), buffer.sampleRate, MIC_RATE);
        onChunk(floatToPcm16Base64(samples), level(samples));
      });
      const res = await recorder.start();
      if (res.status !== "success") throw new Error(res.message);
    },

    stopMic() {
      recorder?.clearOnAudioReady();
      void recorder?.stop();
      recorder = null;
    },

    play(b64) {
      const samples = pcm16Base64ToFloat(b64);
      const { ctx: c, queue: q } = output();
      const buf = c.createBuffer(1, samples.length, OUT_RATE);
      buf.copyToChannel(samples, 0);
      q.enqueueBuffer(buf);
      return { seconds: samples.length / OUT_RATE, level: level(samples) };
    },

    flush() {
      // A queue source can only start once, so barge-in drops it and the next chunk builds a new one.
      queue?.clearBuffers();
      queue?.stop();
      queue?.disconnect();
      queue = null;
    },

    setGain(value) {
      if (gain) gain.gain.value = value;
    },

    watchSystem(cb) {
      const subs = [
        AudioManager.addSystemEventListener("interruption", (e) => cb(e.type === "began" ? "interrupted" : "resumable")),
        AudioManager.addSystemEventListener("routeChange", (e) => {
          if (e.reason === "OldDeviceUnavailable") cb("unplugged");
        }),
      ];
      return () => subs.forEach((s) => s?.remove());
    },

    close() {
      this.stopMic();
      this.flush();
      void ctx?.close();
      ctx = null;
      gain = null;
      void AudioManager.setAudioSessionActivity(false).catch(() => {});
    },
  };
}
