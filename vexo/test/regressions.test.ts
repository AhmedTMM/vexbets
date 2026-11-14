import type { FinalTranscript } from "@vexbets/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBandKeeper } from "../src/band-keeper";
import type { AudioSource } from "../src/band-source";
import { openaiRealtimeStt } from "../src/openai-stt";
import { createSegmenter, type SegmentEvent } from "../src/segmenter";

/**
 * Regressions from the first real-band session (2026-11-14). Each test is one failure.
 */

const RATE = 24_000;
/** The real band's 16 kHz -> 24 kHz resampler hands out 479-481 samples: fractional ms. */
const REAL_BAND_CHUNKS = [479, 481, 480, 479, 481];

function noise(n: number, amplitude: number, seed: number): Float32Array {
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    out[i] = amplitude * ((s / 2147483647) * 2 - 1);
  }
  return out;
}

/** A WebSocket stand-in: records what the page sends, lets the test answer as OpenAI. */
class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 1;
  sent: { type: string }[] = [];
  private handlers = new Map<string, ((e: unknown) => void)[]>();
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.last = this;
    queueMicrotask(() => this.emit("open", {}));
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
  emit(type: string, e: unknown) {
    for (const fn of this.handlers.get(type) ?? []) fn(e);
  }
  /** Answer as OpenAI would. */
  serverSays(msg: object) {
    this.emit("message", { data: JSON.stringify(msg) });
  }
  types() {
    return this.sent.map((m) => m.type).filter((t) => t !== "input_audio_buffer.append");
  }
}

function fakeAudio() {
  let feed: ((s: Float32Array, rate: number) => void) | null = null;
  const audio: AudioSource = {
    async start(onSamples) {
      feed = onSamples;
    },
    async stop() {},
  };
  /** Play `ms` of sound at `amplitude`, in real-band-sized chunks, advancing the clock. */
  const play = (amplitude: number, ms: number) => {
    let played = 0;
    let i = 0;
    while (played < ms) {
      const n = REAL_BAND_CHUNKS[i++ % REAL_BAND_CHUNKS.length] ?? 480;
      vi.advanceTimersByTime((n / RATE) * 1000);
      feed?.(noise(n, amplitude, i), RATE);
      played += (n / RATE) * 1000;
    }
  };
  return { audio, play };
}

async function startEngine() {
  const { audio, play } = fakeAudio();
  const finals: FinalTranscript[] = [];
  const engine = openaiRealtimeStt({
    token: "ek_test",
    audio,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
  });
  await engine.start((t) => finals.push(t));
  const ws = FakeSocket.last as FakeSocket;
  return { engine, play, ws, finals };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T20:50:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("regression: backend rejected 'expected int, received number' for startMs", () => {
  it("the segmenter reports whole milliseconds for real-band chunk sizes", () => {
    const seg = createSegmenter();
    const events: SegmentEvent[] = [];
    let t = 1_763_153_400_000;
    let i = 0;
    const play = (amp: number, ms: number) => {
      for (let played = 0; played < ms; ) {
        const n = REAL_BAND_CHUNKS[i++ % REAL_BAND_CHUNKS.length] ?? 480;
        t += (n / RATE) * 1000;
        played += (n / RATE) * 1000;
        // The page passes Date.now(): a whole number, while chunk lengths are fractional.
        events.push(...seg.push(noise(n, amp, i), RATE, Math.round(t)));
      }
    };
    play(0.002, 1500);
    play(0.3, 1200);
    play(0.002, 1500);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      for (const v of Object.values(e)) if (typeof v === "number") expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("a final line from the OpenAI engine carries whole-ms times", async () => {
    const { play, ws, finals } = await startEngine();
    play(0.002, 1500);
    play(0.3, 1200);
    play(0.002, 1500);
    expect(ws.types()).toContain("input_audio_buffer.commit");
    ws.serverSays({ type: "input_audio_buffer.committed", item_id: "item_1" });
    ws.serverSays({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_1",
      transcript: "no cap",
    });
    expect(finals).toHaveLength(1);
    expect(Number.isInteger(finals[0]?.startMs)).toBe(true);
    expect(Number.isInteger(finals[0]?.endMs)).toBe(true);
  });
});

describe("regression: quiet speech on the real band was thrown away", () => {
  it("speech a few dB above the room but under the speech threshold is committed, not cleared", async () => {
    const { play, ws } = await startEngine();
    play(0.002, 3000); // the room: about -60 dB
    play(0.006, 2000); // quiet speech: about +9 dB, under the 12 dB margin
    play(0.002, 5000); // quiet again; the 8 s sweep fires in here
    expect(ws.types()).toContain("input_audio_buffer.commit");
    expect(ws.types()).not.toContain("input_audio_buffer.clear");
  });

  it("pure room noise is cleared, never committed (no made-up lines from silence)", async () => {
    const { play, ws } = await startEngine();
    play(0.002, 20_000);
    expect(ws.types()).toContain("input_audio_buffer.clear");
    expect(ws.types()).not.toContain("input_audio_buffer.commit");
  });

  it("audio is actually streamed to OpenAI as it arrives", async () => {
    const { play, ws } = await startEngine();
    play(0.3, 1000);
    expect(ws.sent.filter((m) => m.type === "input_audio_buffer.append").length).toBeGreaterThanOrEqual(8);
    expect(ws.protocols).toEqual(["realtime", "openai-insecure-api-key.ek_test"]);
    expect(ws.url).toBe("wss://api.openai.com/v1/realtime?intent=transcription");
  });
});

describe("regression: every Start reopened the band chooser", () => {
  it("Start again on the same band reuses the connection", async () => {
    const connect = vi.fn(async (key: string) => ({ key, disconnect: vi.fn(async () => {}) }));
    const keeper = createBandKeeper(connect);
    const a = await keeper.acquire("41:real");
    const b = await keeper.acquire("41:real");
    expect(a.fresh).toBe(true);
    expect(b.fresh).toBe(false);
    expect(b.conn).toBe(a.conn);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("switching band (or real <-> pretend) disconnects the old one first", async () => {
    const made: { key: string; disconnect: ReturnType<typeof vi.fn> }[] = [];
    const keeper = createBandKeeper(async (key) => {
      const c = { key, disconnect: vi.fn(async () => {}) };
      made.push(c);
      return c;
    });
    await keeper.acquire("41:real");
    await keeper.acquire("41:pretend");
    expect(made[0]?.disconnect).toHaveBeenCalledTimes(1);
    await keeper.release();
    expect(made[1]?.disconnect).toHaveBeenCalledTimes(1);
    expect(keeper.current).toBeNull();
  });
});
