import { describe, expect, it } from "vitest";
import { lmsr, SHARE_PAYOUT } from "../src";

describe("lmsr", () => {
  it("starts an empty market at equal prices", () => {
    expect(lmsr.prices([0, 0], 100)).toEqual([0.5, 0.5]);
    expect(lmsr.pricesBps([0, 0, 0, 0], 100)).toEqual([2500, 2500, 2500, 2500]);
  });

  it("prices always add up to 1", () => {
    const p = lmsr.prices([120, 7, 300], 50);
    expect(p.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 12);
  });

  it("buying an outcome raises its price", () => {
    const q = lmsr.quoteTrade([0, 0], 100, 0, "buy", 50);
    expect(q.priceAfterBps[0]).toBeGreaterThan(5000);
    expect(q.after).toEqual([50, 0]);
    expect(q.credits).toBeGreaterThan(50 * SHARE_PAYOUT * 0.5);
    expect(q.credits).toBeLessThan(50 * SHARE_PAYOUT);
  });

  it("a buy then sell round trip never makes money", () => {
    for (const [b, shares] of [
      [10, 1],
      [100, 37],
      [1000, 999],
    ] as const) {
      const buy = lmsr.quoteTrade([5, 9], b, 1, "buy", shares);
      const sell = lmsr.quoteTrade(buy.after, b, 1, "sell", shares);
      expect(sell.credits).toBeLessThanOrEqual(buy.credits);
      expect(sell.after).toEqual([5, 9]);
    }
  });

  it("stays stable with huge share counts", () => {
    const p = lmsr.prices([1_000_000, 0], 10);
    expect(p[0]).toBeCloseTo(1, 9);
    expect(Number.isFinite(lmsr.cost([1_000_000, 0], 10))).toBe(true);
  });

  it("caps the creator's loss at maxSubsidy", () => {
    const b = 100;
    // Everyone piles into outcome 0 and it wins: the house pays out q0 * SHARE_PAYOUT.
    const q = lmsr.quoteTrade([0, 0], b, 0, "buy", 5_000);
    const loss = 5_000 * SHARE_PAYOUT - q.credits;
    expect(loss).toBeLessThanOrEqual(lmsr.maxSubsidy(b, 2));
  });

  it("rejects bad input", () => {
    expect(() => lmsr.quoteTrade([0, 0], 100, 2, "buy", 1)).toThrow(RangeError);
    expect(() => lmsr.quoteTrade([0, 0], 100, 0, "sell", 1)).toThrow(RangeError);
    expect(() => lmsr.quoteTrade([0, 0], 100, 0, "buy", 0)).toThrow(RangeError);
    expect(() => lmsr.prices([1], 100)).toThrow(RangeError);
  });
});
