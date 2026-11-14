/**
 * Decides where one spoken line ends, from loudness alone: speech is louder than the room.
 *
 * The band's audio has no pauses marked in it, and the live transcription model finalizes a
 * piece of text when the client says "that was one turn" (input_audio_buffer.commit). This
 * finds those turns: a run of speech, closed by a stretch of quiet or a maximum length.
 *
 * It tracks the room's noise floor, so a noisy café and a quiet bedroom both work.
 */

export interface SegmenterOptions {
  /** How much louder than the noise floor counts as speech (dB). */
  marginDb?: number;
  /** Speech shorter than this is a cough or a bump, not a line. */
  minSpeechMs?: number;
  /** Quiet this long ends a line. */
  silenceMs?: number;
  /** A line is cut here even if the talking goes on. */
  maxMs?: number;
}

export type SegmentEvent =
  | { type: "speech-start"; atMs: number }
  | { type: "speech-end"; startMs: number; endMs: number; reason: "silence" | "max-length" }
  | { type: "discard"; startMs: number; endMs: number };

export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (const v of samples) sum += v * v;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return 20 * Math.log10(Math.max(rms, 1e-6));
}

export function createSegmenter(opts: SegmenterOptions = {}) {
  const marginDb = opts.marginDb ?? 12;
  const minSpeechMs = opts.minSpeechMs ?? 250;
  const silenceMs = opts.silenceMs ?? 700;
  const maxMs = opts.maxMs ?? 15_000;

  let floorDb = -60;
  let startMs: number | null = null;
  let lastLoudMs = 0;
  let loudMs = 0;

  return {
    get floorDb() {
      return floorDb;
    },
    get speaking() {
      return startMs !== null;
    },
    /**
     * Feed one chunk. `atMs` is the wall-clock time at the end of the chunk.
     * Returns what happened, if anything.
     */
    push(samples: Float32Array, rate: number, atMs: number): SegmentEvent[] {
      const db = rmsDb(samples);
      const chunkMs = (samples.length / rate) * 1000;
      const loud = db > floorDb + marginDb;
      // The floor follows quiet fast and loud slowly, so speech does not drag it up.
      floorDb += (db - floorDb) * (loud ? 0.002 : db < floorDb ? 0.2 : 0.02);
      floorDb = Math.max(-90, Math.min(-20, floorDb));

      const out: SegmentEvent[] = [];
      if (loud) {
        if (startMs === null) {
          startMs = atMs - chunkMs;
          loudMs = 0;
          out.push({ type: "speech-start", atMs: startMs });
        }
        lastLoudMs = atMs;
        loudMs += chunkMs;
      }
      if (startMs !== null) {
        const tooLong = atMs - startMs >= maxMs;
        const quiet = atMs - lastLoudMs >= silenceMs;
        if (tooLong || quiet) {
          const endMs = tooLong ? atMs : lastLoudMs;
          if (loudMs >= minSpeechMs) {
            out.push({ type: "speech-end", startMs, endMs, reason: tooLong ? "max-length" : "silence" });
          } else {
            out.push({ type: "discard", startMs, endMs });
          }
          startMs = tooLong && loud ? atMs : null;
          loudMs = 0;
          if (startMs !== null) out.push({ type: "speech-start", atMs: startMs });
        }
      }
      return out;
    },
    /** End of stream: close the line in progress, if any. */
    flush(atMs: number): SegmentEvent[] {
      if (startMs === null) return [];
      const ev: SegmentEvent =
        loudMs >= minSpeechMs
          ? { type: "speech-end", startMs, endMs: lastLoudMs || atMs, reason: "silence" }
          : { type: "discard", startMs, endMs: atMs };
      startMs = null;
      return [ev];
    },
  };
}
