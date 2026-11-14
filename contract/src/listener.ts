import type { Client } from "./api";
import { ContractError } from "./errors";
import type { SttToken } from "./ingest";

/**
 * The listener's core loop, with no browser or band in it, so the dashboard's listen page,
 * scripts and tests all run the same code:
 *
 *   startSession -> sttToken -> STT engine emits final lines -> batch -> appendSegments
 *
 * The STT engine is pluggable: a real one streams band audio to a provider; scriptedStt
 * below plays lines from a script, for demos and tests with no band and no key.
 */

export interface FinalTranscript {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  speaker: string | null;
}

export interface SttEngine {
  start(onFinal: (t: FinalTranscript) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface ScriptLine {
  text: string;
  speaker?: string | null;
  /** Wait this long after the previous line before "hearing" this one. */
  afterMs?: number;
}

/** A fake STT engine: "hears" each scripted line after its delay. */
export function scriptedStt(lines: ScriptLine[], opts: { now?: () => number } = {}): SttEngine {
  const now = opts.now ?? Date.now;
  const timers: ReturnType<typeof setTimeout>[] = [];
  return {
    async start(onFinal) {
      let at = 0;
      for (const line of lines) {
        at += line.afterMs ?? 1000;
        timers.push(
          setTimeout(() => {
            const endMs = now();
            const startMs = Math.max(0, endMs - Math.min(4000, 150 * line.text.split(/\s+/).length));
            onFinal({ text: line.text, startMs, endMs, confidence: 0.97, speaker: line.speaker ?? null });
          }, at),
        );
      }
    },
    async stop() {
      for (const t of timers) clearTimeout(t);
    },
  };
}

export type ListenerEvent =
  | { type: "started"; sessionId: string; provider: string }
  | { type: "heard"; text: string }
  | { type: "sent"; accepted: number; segmentCount: number }
  | { type: "retrying"; error: unknown }
  | { type: "stopped"; segmentCount: number };

export interface ListenerOptions {
  client: Client;
  bandNumber: number;
  subjectName: string;
  /** Build the STT engine once the backend has handed out a token. */
  stt: (token: SttToken) => SttEngine;
  /** Each final line is sent at once; this is how often failed sends are retried. */
  batchMs?: number;
  onEvent?: (e: ListenerEvent) => void;
}

export function createListener(opts: ListenerOptions) {
  const batchMs = opts.batchMs ?? 30_000;
  const emit = opts.onEvent ?? (() => {});
  const pending: FinalTranscript[] = [];
  let sessionId = "";
  let nextSeq = 0;
  let engine: SttEngine | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let flushing: Promise<void> = Promise.resolve();

  async function send(): Promise<void> {
    if (!sessionId || pending.length === 0) return;
    const batch = pending.slice(0, 50);
    // The contract wants whole epoch ms and a confidence in 0..1: STT engines and audio
    // chunk maths give fractions, so normalise here, once, for every engine.
    const segments = batch.map((t, i) => {
      const startMs = Math.max(0, Math.round(t.startMs));
      return {
        seq: nextSeq + i,
        startMs,
        endMs: Math.max(startMs, Math.round(t.endMs)),
        text: t.text.slice(0, 5_000),
        confidence: Math.min(1, Math.max(0, t.confidence)),
        speaker: t.speaker,
      };
    });
    try {
      const r = await opts.client("appendSegments", { params: { sessionId }, body: { segments } });
      pending.splice(0, batch.length);
      nextSeq = r.segmentCount;
      emit({ type: "sent", accepted: r.accepted, segmentCount: r.segmentCount });
    } catch (error) {
      // Keep the lines and try again on the next tick. If the backend says where the chain
      // really is (an earlier send landed but its answer was lost), continue from there.
      if (error instanceof ContractError && error.code === "segment_out_of_order") {
        const expected = (error.details as { expected?: number } | undefined)?.expected;
        if (typeof expected === "number") nextSeq = expected;
      }
      emit({ type: "retrying", error });
    }
  }

  function flush(): Promise<void> {
    flushing = flushing.then(send);
    return flushing;
  }

  return {
    async start(): Promise<string> {
      const session = await opts.client("startSession", {
        body: { bandNumber: opts.bandNumber, subjectName: opts.subjectName, consentConfirmed: true },
      });
      sessionId = session.id;
      nextSeq = session.segmentCount;
      const token = await opts.client("sttToken", { body: { sessionId } });
      engine = opts.stt(token);
      await engine.start((t) => {
        const text = t.text.trim();
        if (!text) return;
        pending.push({ ...t, text });
        emit({ type: "heard", text });
        void flush(); // send every final line at once; the interval only retries failures
      });
      timer = setInterval(() => void flush(), batchMs);
      emit({ type: "started", sessionId, provider: token.provider });
      return sessionId;
    },
    /** Send what has been heard now, without waiting for the next batch. */
    flush,
    async stop(): Promise<void> {
      if (timer) clearInterval(timer);
      await engine?.stop();
      await flush();
      if (sessionId) await opts.client("endSession", { params: { sessionId } });
      emit({ type: "stopped", segmentCount: nextSeq });
    },
    get sessionId() {
      return sessionId;
    },
  };
}
