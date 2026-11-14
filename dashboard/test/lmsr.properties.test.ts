// Property tests for the pricing math in @vexbets/contract (contract/src/lmsr.ts): the exact
// code the backend and the dashboard both run. fast-check generates thousands of random
// markets and trades and shrinks any failure to the smallest counterexample.

import { lmsr, SHARE_PAYOUT } from "@vexbets/contract";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const RUNS = { numRuns: 3000 };

// Market sizes the dashboard can create (b = 100) and the contract allows (10..10,000),
// with outstanding shares up to 20,000 per side.
const b = fc.integer({ min: 10, max: 10_000 });
const q = fc.tuple(fc.nat(20_000), fc.nat(20_000));
const side = fc.constantFrom(0, 1);
const shares = fc.integer({ min: 1, max: 5_000 });
/**
 * A market where neither side leads by more than 20 × b shares (prices above ~2e-9).
 * Past that, the contract's rounding (ceil(raw − 1e-9)) can price a buy at 0¢: see the
 * README. At the dashboard's b = 100 that lead costs about $2,470 to build.
 */
const near = b.chain((bb) =>
  fc.tuple(
    fc.constant(bb),
    fc
      .nat(20_000)
      .chain((y) =>
        fc.tuple(fc.constant(y), fc.integer({ min: Math.max(0, y - 20 * bb), max: y + 20 * bb })),
      ),
  ),
);
const raw = (qs: number[], bb: number, i: number, n: number) => {
  const after = [...qs];
  after[i] = (after[i] ?? 0) + n;
  return lmsr.cost(after, bb) - lmsr.cost(qs, bb);
};

describe("LMSR prices", () => {
  it("YES + NO prices are probabilities that sum to 1", () => {
    fc.assert(
      fc.property(q, b, (qs, bb) => {
        const p = lmsr.prices(qs, bb);
        expect(p.every((x) => x >= 0 && x <= 1)).toBe(true);
        expect(Math.abs((p[0] ?? 0) + (p[1] ?? 0) - 1)).toBeLessThan(1e-12);
      }),
      RUNS,
    );
  });

  it("rounded prices (basis points) sum to 10,000 ± 1", () => {
    fc.assert(
      fc.property(q, b, (qs, bb) => {
        const [y = 0, n = 0] = lmsr.pricesBps(qs, bb);
        expect(Math.abs(y + n - 10_000)).toBeLessThanOrEqual(1);
      }),
      RUNS,
    );
  });

  it("buying a side raises its price and lowers the other", () => {
    fc.assert(
      fc.property(q, b, side, shares, (qs, bb, i, n) => {
        const t = lmsr.quoteTrade(qs, bb, i, "buy", n);
        const before = lmsr.prices(qs, bb);
        const after = lmsr.prices(t.after, bb);
        expect(after[i] ?? 0).toBeGreaterThanOrEqual(before[i] ?? 0);
        expect(after[1 - i] ?? 0).toBeLessThanOrEqual(before[1 - i] ?? 0);
      }),
      RUNS,
    );
  });
});

describe("LMSR trade costs", () => {
  it("a buy costs between the price before and the price after, times the shares", () => {
    fc.assert(
      fc.property(q, b, side, shares, (qs, bb, i, n) => {
        const r = raw(qs, bb, i, n);
        const pBefore = lmsr.prices(qs, bb)[i] ?? 0;
        const after = [...qs];
        after[i] = (after[i] ?? 0) + n;
        const pAfter = lmsr.prices(after, bb)[i] ?? 0;
        const tol = 1e-9 * SHARE_PAYOUT * n;
        expect(r).toBeGreaterThanOrEqual(n * pBefore * SHARE_PAYOUT - tol);
        expect(r).toBeLessThanOrEqual(n * pAfter * SHARE_PAYOUT + tol);
      }),
      RUNS,
    );
  });

  it("rounding always favours the house: buys round up, sells round down", () => {
    fc.assert(
      fc.property(q, b, side, shares, (qs, bb, i, n) => {
        const buy = lmsr.quoteTrade(qs, bb, i, "buy", n);
        expect(Number.isInteger(buy.credits)).toBe(true);
        expect(buy.credits).toBeGreaterThanOrEqual(raw(qs, bb, i, n) - 1e-6);
        const sell = lmsr.quoteTrade(buy.after, bb, i, "sell", n);
        expect(Number.isInteger(sell.credits)).toBe(true);
        expect(sell.credits).toBeLessThanOrEqual(raw(qs, bb, i, n) + 1e-6);
      }),
      RUNS,
    );
  });

  it("no free money: buying then selling the same shares never returns more than paid", () => {
    fc.assert(
      fc.property(q, b, side, shares, (qs, bb, i, n) => {
        const buy = lmsr.quoteTrade(qs, bb, i, "buy", n);
        const sell = lmsr.quoteTrade(buy.after, bb, i, "sell", n);
        expect(sell.credits).toBeLessThanOrEqual(buy.credits);
      }),
      RUNS,
    );
  });

  it("in exact arithmetic, a then b costs the same as a+b at once (path independence)", () => {
    fc.assert(
      fc.property(q, b, side, shares, shares, (qs, bb, i, n1, n2) => {
        const first = lmsr.quoteTrade(qs, bb, i, "buy", n1);
        const exact = raw(qs, bb, i, n1) + raw(first.after, bb, i, n2) - raw(qs, bb, i, n1 + n2);
        expect(Math.abs(exact)).toBeLessThan(1e-6 * (n1 + n2) * SHARE_PAYOUT);
      }),
      RUNS,
    );
  });

  it("after rounding, splitting an order never makes it cheaper (in the reachable region)", () => {
    fc.assert(
      fc.property(near, side, shares, shares, ([bb, qs], i, n1, n2) => {
        const first = lmsr.quoteTrade(qs, bb, i, "buy", n1);
        const second = lmsr.quoteTrade(first.after, bb, i, "buy", n2);
        const whole = lmsr.quoteTrade(qs, bb, i, "buy", n1 + n2);
        expect(first.credits + second.credits).toBeGreaterThanOrEqual(whole.credits);
      }),
      RUNS,
    );
  });

  it("a full set (n YES + n NO) costs at least n × $1, so it can't be bought below payout", () => {
    fc.assert(
      fc.property(q, b, shares, (qs, bb, n) => {
        const yes = lmsr.quoteTrade(qs, bb, 0, "buy", n);
        const no = lmsr.quoteTrade(yes.after, bb, 1, "buy", n);
        expect(yes.credits + no.credits).toBeGreaterThanOrEqual(n * SHARE_PAYOUT);
        expect(yes.credits + no.credits).toBeLessThanOrEqual(n * SHARE_PAYOUT + 2);
      }),
      RUNS,
    );
  });

  it("a buy costs at least 1¢ while neither side leads by more than 20 × b shares", () => {
    fc.assert(
      fc.property(near, side, shares, ([bb, qs], i, n) => {
        expect(lmsr.quoteTrade(qs, bb, i, "buy", n).credits).toBeGreaterThanOrEqual(1);
      }),
      RUNS,
    );
  });

  it("selling more shares than are outstanding is refused", () => {
    fc.assert(
      fc.property(q, b, side, (qs, bb, i) => {
        expect(() => lmsr.quoteTrade(qs, bb, i, "sell", (qs[i] ?? 0) + 1)).toThrow(RangeError);
      }),
      RUNS,
    );
  });
});

describe("house risk", () => {
  // Any sequence of buys and sells from an empty market, then either side wins.
  const op = fc.record({ i: side, sell: fc.boolean(), n: fc.integer({ min: 1, max: 2_000 }) });

  it("the house never loses more than maxSubsidy(b), whatever traders do", () => {
    fc.assert(
      fc.property(b, fc.array(op, { maxLength: 40 }), (bb, ops) => {
        let qs = [0, 0];
        let collected = 0;
        for (const o of ops) {
          const n = o.sell ? Math.min(o.n, qs[o.i] ?? 0) : o.n;
          if (n < 1) continue;
          const t = lmsr.quoteTrade(qs, bb, o.i, o.sell ? "sell" : "buy", n);
          collected += o.sell ? -t.credits : t.credits;
          qs = t.after;
        }
        for (const winner of [0, 1]) {
          const payout = (qs[winner] ?? 0) * SHARE_PAYOUT;
          expect(payout - collected).toBeLessThanOrEqual(lmsr.maxSubsidy(bb, 2));
        }
      }),
      { numRuns: 2000 },
    );
  });
});
