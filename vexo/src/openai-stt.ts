import type { FinalTranscript, SttEngine } from "@vexbets/contract";
import type { AudioSource } from "./band-source";
import { createSegmenter, type SegmentEvent } from "./segmenter";

/**
 * Live speech-to-text with OpenAI Realtime transcription (gpt-live-transcribe), over a
 * WebSocket, from the band's samples:
 *
 *   band samples, 24 kHz Float32 -> PCM16 -> input_audio_buffer.append (every ~100 ms)
 *   segmenter: a spoken line ended -> input_audio_buffer.commit
 *   OpenAI -> ...input_audio_transcription.delta (live) / .completed (final, saved)
 *
 * gpt-live-transcribe has no server VAD: it only finalizes text when the client commits a
 * turn, which is what the segmenter is for. The token is the short-lived client secret the
 * backend minted (sttToken), so the real API key never reaches the browser; the session's
 * model and language were fixed when it was minted.
 */

export const REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
const APPEND_EVERY_SAMPLES = 2_400; // 100 ms at 24 kHz
/** Clear the buffered silence this often while nobody talks, so commits stay small. */
const CLEAR_QUIET_MS = 5_000;

export interface OpenAISttOptions {
  token: string;
  audio: AudioSource;
  /** Partial text while someone is still talking. */
  onLive?: (text: string) => void;
  onLog?: (msg: string) => void;
  /** For tests. */
  WebSocketImpl?: typeof WebSocket;
}

/** Float32 [-1, 1] -> little-endian PCM16 -> base64. */
export function toPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface Turn {
  startMs: number;
  endMs: number;
  itemId?: string;
  text: string;
  done: boolean;
}

/**
 * Matches commits to OpenAI's items and hands out final lines in the order they were spoken
 * (completion events from different turns may arrive out of order).
 */
export function createTurnTracker() {
  const turns: Turn[] = [];
  const byItem = new Map<string, Turn>();
  return {
    /** We sent a commit for this stretch of speech. */
    sent(startMs: number, endMs: number) {
      turns.push({ startMs, endMs, text: "", done: false });
    },
    /** input_audio_buffer.committed: the oldest commit without an item is this one. */
    acknowledged(itemId: string) {
      const t = turns.find((x) => x.itemId === undefined);
      if (!t) return;
      t.itemId = itemId;
      byItem.set(itemId, t);
    },
    delta(itemId: string, delta: string): string {
      const t = byItem.get(itemId);
      if (!t) return delta;
      t.text += delta;
      return t.text;
    },
    /** Returns every line now ready, oldest first. */
    completed(itemId: string, transcript: string): FinalTranscript[] {
      const t = byItem.get(itemId);
      if (t) {
        t.text = transcript;
        t.done = true;
      }
      const ready: FinalTranscript[] = [];
      while (turns[0]?.done) {
        const head = turns.shift() as Turn;
        if (head.itemId) byItem.delete(head.itemId);
        const text = head.text.trim();
        if (text) {
          // The live model reports no confidence and no speaker labels.
          ready.push({ text, startMs: head.startMs, endMs: head.endMs, confidence: 0.9, speaker: null });
        }
      }
      return ready;
    },
    /** A turn failed: drop it so the ones after it are not held up. */
    failed(itemId: string): FinalTranscript[] {
      return this.completed(itemId, "");
    },
    get waiting() {
      return turns.length;
    },
  };
}

export function openaiRealtimeStt(opts: OpenAISttOptions): SttEngine {
  const log = opts.onLog ?? (() => {});
  const WS = opts.WebSocketImpl ?? WebSocket;
  let ws: WebSocket | null = null;
  const turns = createTurnTracker();
  const segmenter = createSegmenter();
  let pending: Float32Array[] = [];
  let pendingSamples = 0;
  let appendedSinceReset = false;
  let lastResetMs = Date.now();
  let emit: (t: FinalTranscript) => void = () => {};

  const send = (msg: object) => {
    if (ws?.readyState === WS.OPEN) ws.send(JSON.stringify(msg));
  };

  function flushAudio() {
    if (pendingSamples === 0) return;
    const all = new Float32Array(pendingSamples);
    let at = 0;
    for (const p of pending) {
      all.set(p, at);
      at += p.length;
    }
    pending = [];
    pendingSamples = 0;
    send({ type: "input_audio_buffer.append", audio: toPcm16Base64(all) });
    appendedSinceReset = true;
  }

  function handle(ev: SegmentEvent, nowMs: number) {
    if (ev.type === "speech-end") {
      flushAudio();
      turns.sent(ev.startMs, ev.endMs);
      send({ type: "input_audio_buffer.commit" });
      appendedSinceReset = false;
      lastResetMs = nowMs;
    } else if (ev.type === "discard") {
      flushAudio();
      send({ type: "input_audio_buffer.clear" });
      appendedSinceReset = false;
      lastResetMs = nowMs;
    }
  }

  function onSamples(samples: Float32Array) {
    const now = Date.now();
    const events = segmenter.push(samples, 24_000, now);
    pending.push(samples);
    pendingSamples += samples.length;
    if (pendingSamples >= APPEND_EVERY_SAMPLES) flushAudio();
    for (const ev of events) handle(ev, now);
    if (!segmenter.speaking && appendedSinceReset && now - lastResetMs > CLEAR_QUIET_MS) {
      flushAudio();
      send({ type: "input_audio_buffer.clear" });
      appendedSinceReset = false;
      lastResetMs = now;
    }
  }

  function onMessage(raw: unknown) {
    let ev: {
      type?: string;
      item_id?: string;
      delta?: string;
      transcript?: string;
      error?: { message?: string; code?: string | null };
    };
    try {
      ev = JSON.parse(String(raw));
    } catch {
      return;
    }
    switch (ev.type) {
      case "input_audio_buffer.committed":
        if (ev.item_id) turns.acknowledged(ev.item_id);
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (ev.item_id) opts.onLive?.(turns.delta(ev.item_id, ev.delta ?? ""));
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (ev.item_id) for (const t of turns.completed(ev.item_id, ev.transcript ?? "")) emit(t);
        break;
      case "conversation.item.input_audio_transcription.failed":
        log(`openai: a line failed: ${ev.error?.message ?? "unknown"}`);
        if (ev.item_id) for (const t of turns.failed(ev.item_id)) emit(t);
        break;
      case "error":
        log(`openai error: ${ev.error?.code ?? ""} ${ev.error?.message ?? JSON.stringify(ev)}`);
        break;
    }
  }

  return {
    async start(onFinal) {
      emit = onFinal;
      ws = new WS(REALTIME_URL, ["realtime", `openai-insecure-api-key.${opts.token}`]);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("OpenAI did not answer in 15 s")), 15_000);
        ws?.addEventListener("open", () => {
          clearTimeout(timer);
          resolve();
        });
        ws?.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("could not open the OpenAI WebSocket (token expired or invalid?)"));
        });
      });
      ws.addEventListener("message", (m) => onMessage(m.data));
      ws.addEventListener("close", (e) => log(`openai: closed (${e.code}${e.reason ? ` ${e.reason}` : ""})`));
      log("openai: connected");
      await opts.audio.start((samples) => onSamples(samples));
    },

    async stop() {
      await opts.audio.stop();
      const now = Date.now();
      for (const ev of segmenter.flush(now)) handle(ev, now);
      // Wait for the last lines to come back as text, then close.
      const until = Date.now() + 5_000;
      while (turns.waiting > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
      ws?.close();
      ws = null;
    },
  };
}
