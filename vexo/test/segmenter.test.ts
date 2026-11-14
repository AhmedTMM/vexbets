import { describe, expect, it } from "vitest";
import { createSegmenter, rmsDb } from "../src/segmenter";

const RATE = 24_000;
const CHUNK = 480; // 20 ms

function chunk(amplitude: number, seed = 1): Float32Array {
  const out = new Float32Array(CHUNK);
  let s = seed;
  for (let i = 0; i < CHUNK; i++) {
    s = (s * 16807) % 2147483647;
    out[i] = amplitude * ((s / 2147483647) * 2 - 1);
  }
  return out;
}

/** Feed a script of [amplitude, ms] parts; return the events with their times. */
function run(parts: [number, number][], opts = {}) {
  const seg = createSegmenter(opts);
  const events = [];
  let t = 0;
  for (const [amp, ms] of parts) {
    for (let i = 0; i < ms / 20; i++) {
      t += 20;
      events.push(...seg.push(chunk(amp, t), RATE, t));
    }
  }
  events.push(...seg.flush(t));
  return events;
}

const QUIET = 0.002; // about -60 dB
const TALK = 0.2; // about -20 dB

describe("segmenter", () => {
  it("measures loudness in dB", () => {
    expect(rmsDb(new Float32Array(480).fill(1))).toBeCloseTo(0, 5);
    expect(rmsDb(new Float32Array(480))).toBeLessThan(-100);
  });

  it("finds one line between two quiet stretches", () => {
    const ev = run([
      [QUIET, 2000],
      [TALK, 1500],
      [QUIET, 2000],
    ]);
    const ends = ev.filter((e) => e.type === "speech-end");
    expect(ends).toHaveLength(1);
    const end = ends[0] as { startMs: number; endMs: number; reason: string };
    expect(end.reason).toBe("silence");
    expect(end.startMs).toBeGreaterThanOrEqual(1980);
    expect(end.startMs).toBeLessThanOrEqual(2060);
    expect(end.endMs).toBeGreaterThanOrEqual(3400);
    expect(end.endMs).toBeLessThanOrEqual(3520);
  });

  it("splits two lines with a pause, keeps one line with a short breath", () => {
    const two = run([
      [QUIET, 1500],
      [TALK, 1000],
      [QUIET, 1000],
      [TALK, 1000],
      [QUIET, 1500],
    ]);
    expect(two.filter((e) => e.type === "speech-end")).toHaveLength(2);
    const one = run([
      [QUIET, 1500],
      [TALK, 1000],
      [QUIET, 300],
      [TALK, 1000],
      [QUIET, 1500],
    ]);
    expect(one.filter((e) => e.type === "speech-end")).toHaveLength(1);
  });

  it("ignores a short bump", () => {
    const ev = run([
      [QUIET, 1500],
      [TALK, 100],
      [QUIET, 1500],
    ]);
    expect(ev.filter((e) => e.type === "speech-end")).toHaveLength(0);
    expect(ev.filter((e) => e.type === "discard")).toHaveLength(1);
  });

  it("cuts a monologue at maxMs and carries on", () => {
    const ev = run(
      [
        [QUIET, 1500],
        [TALK, 7000],
        [QUIET, 1500],
      ],
      { maxMs: 3000 },
    );
    const ends = ev.filter((e) => e.type === "speech-end") as { reason: string }[];
    expect(ends.length).toBe(3);
    expect(ends.slice(0, 2).every((e) => e.reason === "max-length")).toBe(true);
  });

  it("adapts to a noisy room", () => {
    const NOISY = 0.03; // about -36 dB of steady noise
    const ev = run([
      [NOISY, 4000],
      [0.5, 1500],
      [NOISY, 2000],
    ]);
    expect(ev.filter((e) => e.type === "speech-end")).toHaveLength(1);
  });

  it("closes a line still going when the stream ends", () => {
    const ev = run([
      [QUIET, 1500],
      [TALK, 1000],
    ]);
    expect(ev.at(-1)).toMatchObject({ type: "speech-end" });
  });
});
