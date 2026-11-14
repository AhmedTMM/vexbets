import { describe, expect, it } from "vitest";
import type { PricePoint } from "../src/lib/market";
import { resampleSeries } from "../src/lib/series";

const resample = resampleSeries<PricePoint>;

const p = (t: number, yes: number): PricePoint => ({ t, yes, no: 100 - yes });

describe("resample", () => {
  const raw = [p(0, 50), p(4_000, 66), p(9_000, 72), p(10_000, 100)];
  const out = resample(raw, 120);

  it("fills the line with many points", () => {
    expect(out.length).toBeGreaterThanOrEqual(120);
  });

  it("keeps every real point, in time order", () => {
    for (const r of raw) expect(out).toContainEqual(r);
    for (let i = 1; i < out.length; i++)
      expect((out[i] as PricePoint).t).toBeGreaterThan((out[i - 1] as PricePoint).t);
  });

  it("carries the last trade's price forward, never inventing prices", () => {
    const at = (t: number) => out.filter((x) => x.t <= t).at(-1)?.yes;
    expect(at(3_999)).toBe(50);
    expect(at(4_000)).toBe(66);
    expect(at(8_500)).toBe(66);
    expect(new Set(out.map((x) => x.yes))).toEqual(new Set([50, 66, 72, 100]));
  });

  it("leaves a single point or a zero-length series alone", () => {
    expect(resample([p(5, 50)], 120)).toEqual([p(5, 50)]);
    expect(resample([p(5, 50), p(5, 60)], 120)).toHaveLength(2);
  });
});
